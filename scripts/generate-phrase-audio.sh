#!/usr/bin/env bash
# Generate pre-rendered MP3 audio for all phrase files using Piper TTS.
#
# Reuses (or creates) the TTS Python venv at ~/.cache/phoneme-party/tts-venv.
# Requires: ffmpeg (must be in PATH)
#
# Usage:
#   ./run scripts/generate-phrase-audio.sh [lang...] [--voices v1,v2]
#
# Examples:
#   ./run scripts/generate-phrase-audio.sh              # all languages/voices
#   ./run scripts/generate-phrase-audio.sh de-DE           # German only
#   ./run scripts/generate-phrase-audio.sh de-DE --voices piper-thorsten

trap 'echo -e "\n🔥 Error on line $LINENO: $(sed -n "${LINENO}p" "$0" 2>/dev/null || true)"; exit 3' ERR
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VENV_DIR="$HOME/.cache/phoneme-party/tts-venv"

# ── Ensure ffmpeg is available ────────────────────────────────────────────────
if ! command -v ffmpeg &>/dev/null; then
    echo "ERROR: ffmpeg not found. Install it first." >&2
    exit 1
fi

# ── Set up Python venv ────────────────────────────────────────────────────────
if [[ ! -d "$VENV_DIR" ]]; then
    echo "Creating TTS venv at $VENV_DIR ..."
    python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

# Install required packages if missing
pip install --quiet --upgrade pip
pip install --quiet piper-tts pyyaml

# ── Run generator ─────────────────────────────────────────────────────────────
echo "Starting audio generation ..."
cd "$PROJECT_DIR"
python scripts/generate-phrase-audio.py "$@"
