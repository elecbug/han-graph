#!/usr/bin/env bash
# Run offline corpus maintenance inside a user cgroup on Linux.
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
cd "$repo"
if [[ ${HAN_AUDIO_IN_UNIT:-} != 1 ]]; then
    mode=(--wait --pipe)
    if [[ ${1:-} == --background ]]; then
        mode=()
        shift
    fi
    exec systemd-run --user --service-type=exec --unit=han-graph-korean-audio \
        --collect "${mode[@]}" --working-directory="$repo" \
        -p CPUQuota=100% -p MemoryHigh=3G -p MemoryMax=4G -p MemorySwapMax=0 \
        -p Restart=on-abnormal -p RestartSec=30s -p StartLimitIntervalSec=15min -p StartLimitBurst=2 \
        -p Nice=15 -p CPUWeight=10 -p IOWeight=10 -p TasksMax=32 \
        --setenv=HAN_AUDIO_IN_UNIT=1 --setenv=PATH="$PATH" /bin/bash "$repo/scripts/korean-audio.sh" "$@"
fi

# Some numerical libraries size auxiliary thread pools from CPU affinity.
allowed=$(awk '/^Cpus_allowed_list:/{print $2}' /proc/self/status)
taskset -pc "${allowed%%[-,]*}" "$$" >/dev/null
cache=$repo/.audio-build
umask 022
mkdir -p "$cache"
exec 9>"$cache/job.lock"
flock -n 9 || { echo "Another Korean audio job is running" >&2; exit 1; }
export OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 NUMBA_NUM_THREADS=1
export TOKENIZERS_PARALLELISM=false ONEDNN_PRIMITIVE_CACHE_CAPACITY=64 MALLOC_ARENA_MAX=2
# Return large, short-lived sample buffers to the OS after each clip.
export MALLOC_MMAP_THRESHOLD_=262144
export UV_CACHE_DIR="$cache/uv" UV_CONCURRENT_DOWNLOADS=1 UV_CONCURRENT_BUILDS=1 UV_CONCURRENT_INSTALLS=1
export HF_HOME="$cache/hf" NLTK_DATA="$cache/nltk" PYTHONPATH="$cache/MeloTTS"
python3 scripts/korean_audio.py --check-limits

if [[ ! -x $cache/venv/bin/python ]]; then uv venv --python 3.11 "$cache/venv"; fi
py=$cache/venv/bin/python
uv pip install --python "$py" "numpy==1.26.4" "soundfile==0.14.0"
if [[ ${1:-} == --check ]]; then exec "$py" scripts/korean_audio.py "$@"; fi

source_rev=209145371cff8fc3bd60d7be902ea69cbdb7965a
model_rev=0207e5adfc90129a51b6b03d89be6d84360ed323
bert_rev=1779cc0982ada0216dd6de0dd4e86fb78201926d
if [[ ! -d $cache/MeloTTS/.git ]]; then git init -q "$cache/MeloTTS"; fi
if [[ $(git -C "$cache/MeloTTS" rev-parse --verify HEAD 2>/dev/null || true) != "$source_rev" ]]; then
    git -C "$cache/MeloTTS" fetch --depth 1 https://github.com/myshell-ai/MeloTTS.git "$source_rev"
    git -C "$cache/MeloTTS" checkout -q --detach "$source_rev"
fi
uv pip install --python "$py" --index-url https://download.pytorch.org/whl/cpu 'torch==2.5.1'
uv pip install --python "$py" 'transformers==4.44.2' 'numpy==1.26.4' 'numba==0.68.1' \
    'g2pkk==0.1.2' 'jamo==0.4.1' 'num2words==0.5.14' anyascii 'python-mecab-ko==1.3.7' \
    'python-mecab-ko-dic==2.1.1.post2' 'lameenc==1.9.0' 'soundfile==0.14.0'
download() {
    if [[ ! -s $2 ]]; then
        curl --fail --silent --show-error --location --retry 3 "$1" -o "$2.part"
        mv "$2.part" "$2"
    fi
}
model="$cache/model"
bert="$HF_HOME/hub/models--kykim--bert-kor-base"
mkdir -p "$model" "$bert/snapshots/$bert_rev" "$bert/refs"
for file in config.json checkpoint.pth; do
    download "https://huggingface.co/myshell-ai/MeloTTS-Korean/resolve/$model_rev/$file" "$model/$file"
done
for file in config.json vocab.txt tokenizer_config.json pytorch_model.bin; do
    download "https://huggingface.co/kykim/bert-kor-base/resolve/$bert_rev/$file" "$bert/snapshots/$bert_rev/$file"
done
printf '%s' "$bert_rev" > "$bert/refs/main"
mkdir -p -m 700 "$NLTK_DATA" "$NLTK_DATA/corpora"
download "https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/cmudict.zip" "$NLTK_DATA/corpora/cmudict.zip"
export HF_HUB_OFFLINE=1
exec "$py" scripts/korean_audio.py --model-dir "$model" "$@"
