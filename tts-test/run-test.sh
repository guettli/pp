#!/usr/bin/env bash
# ============================================================
#  TTS Test Runner
#  Tests multiple German TTS engines and ranks them by
#  IPA pronunciation accuracy (using ONNX phoneme model).
#
#  Usage:
#    ./tts-test/run-test.sh                          # all variants
#    ./tts-test/run-test.sh espeak piper-thorsten    # specific variants
#
#  Available TTS variants:
#    espeak, espeak-slow
#    piper-thorsten, piper-kerstin, piper-ramona
#    edge-tts-male, edge-tts-female
#    gtts, gtts-slow
#    silero-eva, silero-bernd, silero-karlsson
#
#  Requirements (auto-installed):
#    - espeak-ng (apt)
#    - Python venv at ~/.cache/phoneme-party/tts-venv
#      with: gtts, edge-tts, piper-tts, torch (CPU), omegaconf, scipy
#    - ffmpeg (must be in PATH)
#    - ONNX model: ~/.cache/phoneme-party/models/ (auto-downloaded)
#    - pnpm and tsx (already in project)
#
#  Output:
#    tts-test/audio/<variant>/<id>_<text>.wav
#    tts-test/results/audio-manifest.json
# ============================================================

set -euo pipefail
cd "$(dirname "$0")/.."   # project root

VENV="$HOME/.cache/phoneme-party/tts-venv"
PYTHON="$VENV/bin/python3"
PIP="$VENV/bin/pip"
GENERATE_SCRIPT=tts-test/generate-audio.py

# ── Parse flags ───────────────────────────────────────────────
VARIANTS=("$@")

# ── 1. Check required system tools ───────────────────────────
echo "==> Checking system tools..."

if ! command -v espeak-ng &>/dev/null; then
  echo "  Installing espeak-ng..."
  sudo apt-get install -y espeak-ng
fi

if ! command -v ffmpeg &>/dev/null; then
  echo "  ERROR: ffmpeg not found. Please install it."
  exit 1
fi

# ── 2. Set up Python venv with TTS packages ──────────────────
echo "==> Setting up Python environment at $VENV ..."

if [ ! -f "$PYTHON" ]; then
  python3 -m venv "$VENV"
  echo "  Created venv."
fi

echo "  Installing/updating Python TTS packages..."
"$PIP" install --quiet --upgrade \
  gtts \
  edge-tts \
  piper-tts \
  omegaconf \
  scipy

# Install PyTorch CPU (large, so only if not already installed)
if ! "$PYTHON" -c "import torch" &>/dev/null; then
  echo "  Installing PyTorch CPU (for Silero TTS)..."
  "$PIP" install --quiet torch \
    --index-url https://download.pytorch.org/whl/cpu
fi

echo "  Python TTS packages ready."

# ── 3. Download ONNX model if missing ────────────────────────
MODEL_DIR="$HOME/.cache/phoneme-party/models"
MODEL_NAME="zipa-small-crctc-ns-700k"
MODEL_ONNX="$MODEL_DIR/${MODEL_NAME}.onnx"
MODEL_VOCAB="$MODEL_DIR/${MODEL_NAME}.vocab.json"

if [ ! -f "$MODEL_ONNX" ] || [ ! -f "$MODEL_VOCAB" ]; then
  echo "==> Downloading ONNX phoneme model from HuggingFace..."
  mkdir -p "$MODEL_DIR"
  BASE_URL="https://huggingface.co/anyspeech/zipa-small-crctc-ns-700k/resolve/main"
  curl -L --progress-bar -o "$MODEL_ONNX" "$BASE_URL/${MODEL_NAME}.onnx"
  curl -L --progress-bar -o "$MODEL_VOCAB" "$BASE_URL/${MODEL_NAME}.vocab.json"
  echo "  Model downloaded."
else
  echo "  ONNX model already cached."
fi

# ── 4. Generate audio for all TTS variants ───────────────────
echo ""
echo "==> Generating audio files..."
if [ ${#VARIANTS[@]} -gt 0 ]; then
  "$PYTHON" "$GENERATE_SCRIPT" "${VARIANTS[@]}"
else
  "$PYTHON" "$GENERATE_SCRIPT"
fi

echo ""
echo "==> Done!"
echo "    Audio files:  tts-test/audio/"
