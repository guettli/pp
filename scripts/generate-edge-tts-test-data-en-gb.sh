#!/usr/bin/env bash
# Generate edge-tts test data for en-GB using en-GB-RyanNeural voice.
# Processes all phrase folders in tests/data/en-GB/ and skips folders
# that already have an edge-tts-ryan FLAC file.

# Bash Strict Mode: https://github.com/guettli/bash-strict-mode
trap 'echo -e "\nError on line ($0:$LINENO): $(sed -n "${LINENO}p" "$0" 2>/dev/null || true)"; exit 3' ERR
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_DIR/tests/data/en-GB"
STUDY_LANG="en-GB"
VOICE_ID="en-GB-RyanNeural"
VOICE_NAME="ryan"
SOURCE="edge-tts"

# Ensure build/node is built
echo "Building build/node..."
(cd "$PROJECT_DIR" && ./run task node)
echo ""

for PHRASE_DIR in "$DATA_DIR"/*/; do
    PHRASE_SAFE="$(basename "$PHRASE_DIR")"
    PHRASE="${PHRASE_SAFE//_/ }"

    FLAC_FILE="$PHRASE_DIR${PHRASE_SAFE}-${SOURCE}-${VOICE_NAME}.flac"
    YAML_FILE="${FLAC_FILE}.yaml"

    if [ -f "$FLAC_FILE" ]; then
        echo "Skipping (exists): $PHRASE"
        continue
    fi

    echo "Generating: $PHRASE"

    TEMP_MP3="$(mktemp /tmp/edge-tts-XXXXXX.mp3)"

    edge-tts --voice "$VOICE_ID" --text "$PHRASE" --write-media "$TEMP_MP3"

    ffmpeg -y -i "$TEMP_MP3" -ar 16000 -ac 1 "$FLAC_FILE" 2>&1 | tail -3
    rm -f "$TEMP_MP3"

    PHONEME_JSON=$(cd "$PROJECT_DIR" && ./run tsx scripts/extract-and-compare.ts "$FLAC_FILE" "$PHRASE" "$STUDY_LANG")
    RECOGNIZED_IPA=$(echo "$PHONEME_JSON" | jq -r '.recognized_ipa // empty')
    SIMILARITY=$(echo "$PHONEME_JSON" | jq -r '.similarity // empty')

    {
        echo "phrase: $PHRASE"
        echo "lang: $STUDY_LANG"
        echo "source: $SOURCE"
        echo "voice: $VOICE_ID"
        if [ -n "$RECOGNIZED_IPA" ]; then
            echo "recognized_ipa: $RECOGNIZED_IPA"
        fi
        if [ -n "$SIMILARITY" ]; then
            echo "similarity: $SIMILARITY"
        fi
    } >"$YAML_FILE"

    echo "  -> IPA: $RECOGNIZED_IPA  similarity: $SIMILARITY"
done

echo ""
echo "Done."
