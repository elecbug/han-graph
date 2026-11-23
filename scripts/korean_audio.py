"""Build the public Korean listening corpus in verified sets of ten dictionary entries."""
import argparse
import hashlib
import io
from itertools import islice
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
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


def batches(dataset):
    def rows(name):
        with (dataset / name).open(encoding="utf-8") as stream:
            for line in stream:
                if line.strip():
                    yield json.loads(line)

    example_rows = rows("example.jsonl") if (dataset / "example.jsonl").exists() else ()
    examples = {(row["word"], row["hanja"]): row.get("example_ko") for row in example_rows}
    words = rows("word.jsonl")
    seen = set()
    for index, group in enumerate(iter(lambda: list(islice(words, 10)), [])):
        clips = {}
        for row in group:
            for text in (row["word"], examples.get((row["word"], row["hanja"]))):
                if text and text not in seen:
                    clips[clip_name(text)] = text
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


def synthesize(text):
    import lameenc
    import numpy as np
    import torch
    from melo import commons
    from melo.text import cleaned_text_to_sequence, korean

    model, bert, symbols, rate = models
    transcript = korean.text_normalize(spoken_text(text))
    if "[UNK]" in korean.tokenizer.tokenize(transcript):
        raise ValueError(f"Unpronounceable token in {text!r}")
    phones, tones, alignment = korean.g2p(transcript)
    ids = cleaned_text_to_sequence(phones, tones, "KR", symbols)
    x, tone, lang = [torch.tensor([commons.intersperse(seq, 0)]) for seq in ids]
    alignment = [n * 2 for n in alignment]
    alignment[0] += 1
    with torch.inference_mode():
        torch.manual_seed(int(clip_name(text)[:15], 16))
        inputs = korean.tokenizer(transcript, return_tensors="pt")
        features = bert(**inputs, output_hidden_states=True).hidden_states[-3][0]
        features = features.repeat_interleave(torch.tensor(alignment), dim=0).T.unsqueeze(0)
        length = x.size(1)
        wave = model.infer(x, torch.tensor([length]), torch.tensor([0]), tone, lang,
                           torch.zeros(1, 1024, length), features, sdp_ratio=0.2,
                           noise_scale=0.6, noise_scale_w=0.8)[0][0, 0].float().numpy()
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


def verify(path, clips):
    with zipfile.ZipFile(path) as archive:
        if sorted(archive.namelist()) != sorted(clips):
            raise ValueError(f"Transcript list differs in {path}")
        for name, text in clips.items():
            if archive.getinfo(name).compress_type != zipfile.ZIP_STORED:
                raise ValueError(f"Expected a stored MP3 in {path}: {name}")
            verify_clip(archive.read(name), text)


def published(batch):
    try:
        verify(*batch)
        return True
    except (FileNotFoundError, ValueError, RuntimeError, zipfile.BadZipFile):
        return False


def build(batch, model_dir, pending):
    path, clips = batch
    path.parent.mkdir(parents=True, exist_ok=True)
    global models
    pending.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".building-", delete=False) as tmp:
        staging = Path(tmp.name)
    try:
        with zipfile.ZipFile(staging, "w") as archive:
            for name, text in clips.items():
                clip = pending / name
                try:
                    data = clip.read_bytes()
                    verify_clip(data, text)
                except (FileNotFoundError, ValueError, RuntimeError):
                    if models is None:
                        models = load_models(model_dir)
                    chunk = clip.with_suffix(".part")
                    data = synthesize(text)
                    verify_clip(data, text)
                    chunk.write_bytes(data)
                    os.replace(chunk, clip)
                archive.writestr(zipfile.ZipInfo(name), data)
        verify(staging, clips)
        staging.chmod(0o644)
        os.replace(staging, path)
        for name in clips:
            (pending / name).unlink(missing_ok=True)
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
                build(batch, args.model_dir, args.model_dir.parent / "pending")
        print(f"{batch[0].name}: {count}/{len(work)} batches verified", flush=True)
    print(f"{sum(len(clips) for _, clips in work)} clips", flush=True)


models = None

if __name__ == "__main__":
    main()
