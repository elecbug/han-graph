"""Build the public Korean listening corpus in verified sets of ten dictionary entries."""
import argparse
from concurrent.futures import ProcessPoolExecutor
import hashlib
import io
from itertools import islice
import json
import multiprocessing
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
from typing import NamedTuple
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MAX_CPUS = 16
CHECKPOINT_SHA256 = "48e3ff3fd0b5348e095f0468e60ae727507564100f58142ef3a922ead6e0a4d0"


def check_limits():
    # The synthesizer may allocate large convolution workspaces. Check the actual
    # cgroup before importing torch, even if the script is invoked directly.
    group = next((line[3:] for line in Path("/proc/self/cgroup").read_text().splitlines()
                  if line.startswith("0::")), None)
    if group is None:
        raise RuntimeError("Use bash scripts/korean-audio.sh on a cgroup v2 Linux host")
    root = Path("/sys/fs/cgroup") / group.lstrip("/")
    quota, period = (root / "cpu.max").read_text().split()
    memory = (root / "memory.max").read_text().strip()
    swap = (root / "memory.swap.max").read_text().strip()
    requested = os.environ.get("HAN_AUDIO_CPUS", str(MAX_CPUS))
    if requested not in map(str, range(1, MAX_CPUS + 1)):
        raise RuntimeError(f"HAN_AUDIO_CPUS must be an integer from 1 to {MAX_CPUS}")
    if quota == "max" or int(quota) > int(requested) * int(period):
        raise RuntimeError(f"expected a CPU quota of at most {requested} cores")
    if memory == "max" or int(memory) > 4 * 1024**3 or swap != "0":
        raise RuntimeError("expected at most 4 GiB RAM and zero swap")
    budget = max(1, int(quota) // int(period))
    allowed = sorted(os.sched_getaffinity(0))
    # Prefer distinct physical cores on one socket before using SMT siblings.
    physical = {}
    for cpu in allowed:
        topology = Path(f"/sys/devices/system/cpu/cpu{cpu}/topology")
        try:
            key = (int((topology / "physical_package_id").read_text()), int((topology / "core_id").read_text()))
        except (OSError, ValueError):
            key = (0, cpu)
        physical.setdefault(key, cpu)
    primary = [physical[key] for key in sorted(physical)]
    return (primary + [cpu for cpu in allowed if cpu not in primary])[:budget]


def clip_name(text):
    return hashlib.sha256(text.encode()).hexdigest() + ".mp3"


class Clip(NamedTuple):
    text: str
    headword: bool


def reading_revision(clip):
    return b"word-pauses-1" if clip.headword else b""


def batches(dataset):
    def rows(name):
        with (dataset / name).open(encoding="utf-8") as stream:
            for line in stream:
                if line.strip():
                    yield json.loads(line)

    example_rows = rows("example.jsonl") if (dataset / "example.jsonl").exists() else ()
    examples = {(row["word"], row["hanja"]): row.get("example_ko") for row in example_rows}
    entries = [(row["word"], row["hanja"]) for row in rows("word.jsonl")]
    headwords = {word for word, _ in entries}
    words = iter(entries)
    seen = set()
    for index, group in enumerate(iter(lambda: list(islice(words, 10)), [])):
        clips = {}
        for word, hanja in group:
            for text in (word, examples.get((word, hanja))):
                if text and text not in seen:
                    clips[clip_name(text)] = Clip(text, text in headwords)
                    seen.add(text)
        yield dataset / "audio" / "ko" / f"{index:05d}.zip", clips


def spoken_text(text):
    from num2words import num2words

    text = re.sub(r"\([一-鿿]+\)", "", text)
    text = text.translate(str.maketrans({"‘": "", "’": "", "“": "", "”": "", "·": ",", "-": " "}))
    def number(digits):
        return num2words(int(digits), lang="ko")

    text = re.sub(r"\bcoffee(?=[가-힣\s]|$)", "커피", text)
    text = re.sub(r"(\d+)/(\d+)", lambda m: number(m[2]) + " 분의 " + number(m[1]), text)
    text = re.sub(r"(?<!\d)(6|10)월", lambda m: "유월" if m[1] == "6" else "시월", text)
    text = re.sub(r"\d+", lambda m: number(m[0]), text)
    if re.search(r"[^가-힣 .,?!]", text):
        raise ValueError(f"Review Korean pronunciation for {text!r}")
    return text


def load_models(model_dir):
    import torch
    from g2pkk import G2p
    from melo.models import SynthesizerTrn
    from melo.text import korean
    from transformers import AutoModel

    torch.set_num_threads(len(os.sched_getaffinity(0)))
    torch.set_num_interop_threads(1)
    checkpoint = model_dir / "checkpoint.pth"
    with checkpoint.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != CHECKPOINT_SHA256:
            raise ValueError("Unexpected MeloTTS Korean checkpoint")
    cfg = json.loads((model_dir / "config.json").read_text())
    model = SynthesizerTrn(len(cfg["symbols"]), cfg["data"]["filter_length"] // 2 + 1,
                           cfg["train"]["segment_size"] // cfg["data"]["hop_length"],
                           n_speakers=cfg["data"]["n_speakers"], num_tones=cfg["num_tones"],
                           num_languages=cfg["num_languages"], **cfg["model"]).eval()
    model.load_state_dict(torch.load(checkpoint, map_location="cpu", weights_only=True)["model"])
    for module in model.modules():
        if hasattr(module, "weight_g"):
            torch.nn.utils.remove_weight_norm(module)
    korean.g2p_kr = G2p()
    bert = AutoModel.from_pretrained(korean.model_id, add_pooling_layer=False).eval()
    # On AMX hosts, the 1D vocoder convolutions can run in bfloat16.
    # Keep BERT and the duration/flow models in full precision.
    if "amx_bf16" in Path("/proc/cpuinfo").read_text().split():
        model.dec.bfloat16()
        def vocoder_inputs(_module, args, kwargs):
            return (args[0].bfloat16(),), {"g": kwargs["g"].bfloat16()}
        model.dec.register_forward_pre_hook(vocoder_inputs, with_kwargs=True)
    return model, bert, {s: i for i, s in enumerate(cfg["symbols"])}, cfg["data"]["sampling_rate"]


def pause_between_syllables(wave, rate, phones, durations, marked):
    """Keep the word's connected pronunciation and briefly separate its spoken syllables."""
    import numpy as np

    # The front end produces decomposed Hangul. Every pronounced syllable has
    # one initial jamo, including silent ieung in a vowel-initial syllable.
    onsets = [i for i, phone in enumerate(phones) if "ᄀ" <= phone <= "ᄒ"]
    if len(onsets) < 2:
        return wave
    hop = rate // 200
    frames = wave[:len(wave) // hop * hop].reshape(-1, hop)
    rms = np.sqrt(np.mean(frames**2, axis=1))
    active = np.flatnonzero(rms > max(0.001, rms.max() * 0.025))
    if len(active) < 2:
        raise ValueError("Missing speech in headword")
    if marked:
        # The explicitly punctuated reading has a true pause. Shorten only
        # its quiet interior and leave 30 ms on either side of the cut.
        gap = int(np.argmax(np.diff(active)))
        left, right = (active[gap] + 1) * hop, active[gap + 1] * hop
        keep = round(rate * 0.030)
        if right - left < 4 * keep:
            raise ValueError("Missing pause in the marked headword")
        return np.concatenate((wave[:left + keep], wave[right - keep:]))

    # The aligner includes blanks between phones and attributes some trailing
    # silence to the final vowel. Map the relative timings to the audible span.
    edges = np.cumsum(durations)
    def midpoint(i):
        return (edges[2 * i - 1] + edges[2 * i]) / 2

    start = midpoint(onsets[0])
    end = midpoint(len(phones) - 2)  # the sentence-final period
    cuts = []
    for onset in onsets[1:]:
        fraction = (midpoint(onset) - start) / (end - start)
        center = int(round(active[0] + fraction * (active[-1] - active[0])))
        lo, hi = max(active[0], center - 3), min(active[-1], center + 3)
        cuts.append((lo + int(np.argmin(rms[lo:hi + 1]))) * hop)
    pieces = np.split(wave, cuts)
    silence = np.zeros(round(rate * 0.055), dtype=wave.dtype)
    result = [pieces[0]]
    for previous, following in zip(pieces, pieces[1:]):
        fade = min(round(rate * 0.006), len(previous) // 2, len(following) // 2)
        if fade:
            ramp = np.linspace(0, 1, fade, dtype=wave.dtype)
            previous[-fade:] *= ramp[::-1]
            following[:fade] *= ramp
        result.extend((silence, following))
    return np.concatenate(result)


def synthesize(clip):
    import lameenc
    import numpy as np
    import torch
    from melo import commons
    from melo.text import cleaned_text_to_sequence, korean

    model, bert, symbols, rate = models
    text = clip.text
    marked = clip.headword and text == "가의"
    # 可矣 is a lexical entry. Its noninitial 의 admits [이] (표준 발음법 §5).
    reading = text
    if clip.headword:
        reading = "가, 이." if marked else text + "."
    transcript = korean.text_normalize(spoken_text(reading))
    if "[UNK]" in korean.tokenizer.tokenize(transcript):
        raise ValueError(f"Unpronounceable token in {text!r}")
    phones, tones, alignment = korean.g2p(transcript)
    ids = cleaned_text_to_sequence(phones, tones, "KR", symbols)
    x, tone, lang = [torch.tensor([commons.intersperse(seq, 0)]) for seq in ids]
    alignment = [n * 2 for n in alignment]
    alignment[0] += 1
    with torch.inference_mode():
        torch.manual_seed(int(clip_name(reading)[:15], 16))
        inputs = korean.tokenizer(transcript, return_tensors="pt")
        features = bert(**inputs, output_hidden_states=True).hidden_states[-3][0]
        features = features.repeat_interleave(torch.tensor(alignment), dim=0).T.unsqueeze(0)
        length = x.size(1)
        result = model.infer(x, torch.tensor([length]), torch.tensor([0]), tone, lang,
                             torch.zeros(1, 1024, length), features, sdp_ratio=0.2,
                             length_scale=1.16 if clip.headword else 1.0,
                             noise_scale=0.35 if marked else 0.6, noise_scale_w=0.8)
        wave = result[0][0, 0].float().numpy()
        if clip.headword:
            wave = pause_between_syllables(wave, rate, phones, result[1][0, 0].sum(0).numpy(), marked)
    if not np.isfinite(wave).all() or np.max(np.abs(wave)) < 0.01:
        raise ValueError(f"Invalid waveform for {text!r}")
    encoder = lameenc.Encoder()
    encoder.set_channels(1)
    encoder.set_in_sample_rate(rate)
    encoder.set_out_sample_rate(24000)
    encoder.set_bit_rate(40)
    encoder.set_quality(2)
    pcm = (wave.clip(-1, 1) * 32767).astype(np.int16)
    return bytes(encoder.encode(pcm.tobytes()) + encoder.flush())


def verify_clip(data, text):
    import numpy as np
    import soundfile as sf

    with sf.SoundFile(io.BytesIO(data)) as audio:
        signal = audio.read(dtype="float32")
        if (audio.format != "MP3" or audio.channels != 1 or audio.samplerate != 24000
                or not 0.12 <= len(signal) / audio.samplerate <= 60
                or not np.isfinite(signal).all() or np.max(np.abs(signal)) < 0.01):
            raise ValueError(f"Invalid MP3 for {text!r}")


def read_member(archive, name, clip):
    info = archive.getinfo(name)
    if info.compress_type != zipfile.ZIP_STORED or info.comment != reading_revision(clip):
        raise ValueError(f"Outdated or invalid recording for {clip.text!r}")
    data = archive.read(info)
    verify_clip(data, clip.text)
    return data


def verify(path, clips):
    with zipfile.ZipFile(path) as archive:
        if sorted(archive.namelist()) != sorted(clips):
            raise ValueError(f"Transcript list differs in {path}")
        for name, clip in clips.items():
            read_member(archive, name, clip)


def published(batch):
    try:
        verify(*batch)
        return True
    except (FileNotFoundError, ValueError, RuntimeError, zipfile.BadZipFile):
        return False


def prepare_clips(items, model_dir, pending, cpus):
    os.sched_setaffinity(0, cpus)
    os.environ["OMP_NUM_THREADS"] = os.environ["MKL_NUM_THREADS"] = str(len(cpus))
    global models
    for name, clip in items:
        cached = pending_path(pending, name, clip)
        try:
            verify_clip(cached.read_bytes(), clip.text)
            continue
        except (FileNotFoundError, ValueError, RuntimeError):
            pass
        if models is None:
            models = load_models(model_dir)
        data = synthesize(clip)
        verify_clip(data, clip.text)
        chunk = cached.with_suffix(".part")
        chunk.write_bytes(data)
        os.replace(chunk, cached)


def pending_path(pending, name, clip):
    revision = reading_revision(clip)
    return pending / (revision.hex() + "-" + name if revision else name)


def reusable_clips(path, clips):
    recordings = {}
    try:
        with zipfile.ZipFile(path) as archive:
            for name, clip in clips.items():
                try:
                    recordings[name] = read_member(archive, name, clip)
                except (KeyError, ValueError, RuntimeError, zipfile.BadZipFile):
                    continue
    except (FileNotFoundError, zipfile.BadZipFile):
        pass
    return recordings


def build(batch, model_dir, pending, cpus):
    path, clips = batch
    path.parent.mkdir(parents=True, exist_ok=True)
    pending.mkdir(parents=True, exist_ok=True)
    recordings = reusable_clips(path, clips)
    items = [(name, clip) for name, clip in clips.items() if name not in recordings]
    if len(cpus) == MAX_CPUS and len(items) > 1:
        # Keep each model on its own eight cores. Interleave long examples
        # and short headwords so both workers finish at about the same time.
        items.sort(key=lambda item: len(item[1].text), reverse=True)
        with ProcessPoolExecutor(max_workers=2, mp_context=multiprocessing.get_context("spawn")) as pool:
            jobs = [pool.submit(prepare_clips, items[i::2], model_dir, pending, cores)
                    for i, cores in enumerate((cpus[:8], cpus[8:]))]
            for job in jobs:
                job.result()
    else:
        prepare_clips(items, model_dir, pending, cpus)

    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".building-", delete=False) as tmp:
        staging = Path(tmp.name)
    try:
        with zipfile.ZipFile(staging, "w") as archive:
            for name, clip in clips.items():
                info = zipfile.ZipInfo(name)
                info.comment = reading_revision(clip)
                data = recordings[name] if name in recordings else pending_path(pending, name, clip).read_bytes()
                archive.writestr(info, data)
        verify(staging, clips)
        staging.chmod(0o644)
        os.replace(staging, path)
        for name, clip in items:
            pending_path(pending, name, clip).unlink(missing_ok=True)
    finally:
        staging.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=ROOT / "dataset")
    parser.add_argument("--model-dir", type=Path, help="Pinned Korean config.json and checkpoint.pth")
    parser.add_argument("--check-limits", action="store_true")
    parser.add_argument("--check", action="store_true", help="Decode every published clip without loading TTS")
    parser.add_argument("--batch", type=int, help="Process a single zero-based batch of ten entries")
    args = parser.parse_args()
    try:
        cpus = check_limits()
    except (OSError, RuntimeError) as exc:
        parser.exit(1, f"CPU and memory limits unavailable. Run bash scripts/korean-audio.sh ({exc})\n")
    if args.check_limits:
        print(",".join(map(str, cpus)))
        return
    os.sched_setaffinity(0, cpus)
    if not args.check and not args.model_dir:
        parser.error("--model-dir is required to generate clips")
    def stop(signum, _frame):
        raise SystemExit(128 + signum)

    signal.signal(signal.SIGTERM, stop)
    work = list(batches(args.dataset))
    if args.batch is not None:
        if not 0 <= args.batch < len(work):
            parser.error("--batch outside corpus")
        work = [work[args.batch]]
    if args.batch is None:
        expected = {path for path, _ in work}
        published_paths = set((args.dataset / "audio" / "ko").glob("*.zip"))
        if published_paths - expected or (args.check and expected - published_paths):
            raise ValueError("Missing or unexpected Korean audio batch")
    for count, batch in enumerate(work, 1):
        if args.check:
            verify(*batch)
        elif not published(batch):
            if args.batch is None:
                # Exiting after ten entries releases model and convolution workspaces.
                subprocess.run([sys.executable, __file__, "--dataset", str(args.dataset),
                                "--model-dir", str(args.model_dir), "--batch", str(count - 1)], check=True)
            else:
                build(batch, args.model_dir, args.model_dir.parent / "pending", cpus)
        print(f"{batch[0].name}: {count}/{len(work)} batches verified", flush=True)
    print(f"{sum(len(clips) for _, clips in work)} clips", flush=True)


models = None

if __name__ == "__main__":
    main()
