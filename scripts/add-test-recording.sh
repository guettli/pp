#!/bin/bash
# Add a user recording as a test case
# Usage: ./scripts/add-test-recording.sh ~/Downloads/Brot_20260131T073450_de.webm
#    OR: ./scripts/add-test-recording.sh --record

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Check if recording mode
RECORD_MODE=false
if [ "$1" == "--record" ]; then
    RECORD_MODE=true
fi

if [ "$RECORD_MODE" == "false" ]; then
    # File mode
    if [ -z "$1" ]; then
        echo "Usage: $0 <recording-file>"
        echo "   OR: $0 --record"
        echo "Example: $0 ~/Downloads/Brot_20260131T073450_de.webm"
        exit 1
    fi

    INPUT_FILE="$1"

    if [ ! -f "$INPUT_FILE" ]; then
        echo "Error: File not found: $INPUT_FILE"
        exit 1
    fi

    # Ensure dist-node is built
    echo "Building dist-node..."
    (cd "$PROJECT_DIR" && pnpm build:node)
    echo ""

    # Parse filename: Phrase_Timestamp_Lang.webm (optional IPA notation after lang)
    # Phrase can contain underscores, so we split at _YYYYMMDDTHHMMSS_ (timestamp pattern)
    BASENAME=$(basename "$INPUT_FILE" .webm)

    if [[ $BASENAME =~ ^(.*)_([0-9]{8}T[0-9]{6})_([a-z]{2,3})(_.*)?$ ]]; then
        PHRASE="${BASH_REMATCH[1]}"
        TIMESTAMP="${BASH_REMATCH[2]}"
        LANG="${BASH_REMATCH[3]}"
        # Convert underscores in phrase to spaces
        PHRASE="${PHRASE//_/ }"
    else
        echo "Error: Could not parse filename. Expected format: Phrase_YYYYMMDDTHHMMSS_Lang.webm"
        echo "Example: Hello_World_20260131T073450_de.webm"
        exit 1
    fi

    echo "Parsed from filename:"
    echo "  Phrase: $PHRASE"
    echo "  Language: $LANG"
    echo "  Timestamp: $TIMESTAMP"
    echo ""

    # Ask for source name
    read -r -p "Source name (default: user-recording): " SOURCE
    SOURCE=${SOURCE:-user-recording}
else
    # Recording mode
    echo "=== Recording Mode ==="
    echo ""

    # Ensure dist-node is built
    echo "Building dist-node..."
    (cd "$PROJECT_DIR" && pnpm build:node)
    echo ""

    # Ask for details first
    read -r -p "Phrase to pronounce: " PHRASE
    if [ -z "$PHRASE" ]; then
        echo "Error: Phrase is required"
        exit 1
    fi

    read -r -p "Language code (e.g., de, en): " LANG
    if [ -z "$LANG" ]; then
        echo "Error: Language is required"
        exit 1
    fi

    # Generate timestamp
    TIMESTAMP=$(date +%Y%m%dT%H%M%S)

    # Ask for source name
    read -r -p "Source name (default: user-recording): " SOURCE
    SOURCE=${SOURCE:-user-recording}

    echo ""
    echo "Recording details:"
    echo "  Phrase: $PHRASE"
    echo "  Language: $LANG"
    echo "  Timestamp: $TIMESTAMP"
    echo "  Source: $SOURCE"
    echo ""

    # Create temporary file for recording
    TEMP_DIR=$(mktemp -d)
    # Note: temp files will NOT be deleted automatically for debugging
    # trap 'rm -rf "$TEMP_DIR"' EXIT

    RAW_RECORDING="$TEMP_DIR/recording_raw.wav"
    NORMALIZED="$TEMP_DIR/recording_normalized.wav"

    echo "Debug: Temporary files will be saved in: $TEMP_DIR"
    echo ""

    # Record audio
    echo "Press ENTER when ready to start recording..."
    read -r
    echo ""
    echo "Recording... Press Ctrl+C when done."
    echo ""

    # Record audio using arecord (16kHz, mono, wav format)
    arecord -f cd -c 1 -r 16000 "$RAW_RECORDING" || true

    echo ""
    echo "Recording complete."
    echo ""

    # Check if recording was created
    if [ ! -f "$RAW_RECORDING" ] || [ ! -s "$RAW_RECORDING" ]; then
        echo "Error: Recording failed or is empty"
        exit 1
    fi

    # Normalize loudness only (no silence trimming)
    echo "Normalizing loudness..."
    sox "$RAW_RECORDING" "$NORMALIZED" norm

    # Check if normalized file is valid
    if [ ! -f "$NORMALIZED" ] || [ ! -s "$NORMALIZED" ]; then
        echo "Error: Normalized recording is empty or was not created"
        exit 1
    fi

    # Check duration and show info
    DURATION=$(soxi -D "$NORMALIZED" 2>/dev/null || echo "unknown")
    echo "Audio duration: ${DURATION}s"

    # Fail if too short (minimum 0.3 seconds required for phoneme extraction)
    if [ "$DURATION" != "unknown" ]; then
        if awk "BEGIN {exit !($DURATION < 0.3)}"; then
            echo "Error: Audio is too short (${DURATION}s)"
            echo "The phoneme model requires at least 0.3 seconds of audio."
            echo "Please try again and record for longer."
            exit 1
        fi
    fi

    echo "Recording processed."
    echo ""

    # In recording mode, we'll use the normalized WAV directly
    # Set INPUT_FILE to the normalized recording for the FLAC conversion step
    INPUT_FILE="$NORMALIZED"
fi

# Determine output paths (replace spaces with underscores in filenames and directories)
PHRASE_SAFE="${PHRASE// /_}"
DATA_DIR="$PROJECT_DIR/tests/data/$LANG/$PHRASE_SAFE"
OUTPUT_BASE="$PHRASE_SAFE-$SOURCE"

FLAC_FILE="$DATA_DIR/$OUTPUT_BASE.flac"
YAML_FILE="$DATA_DIR/$OUTPUT_BASE.flac.yaml"

# Check if files already exist
if [ -f "$FLAC_FILE" ]; then
    echo "Warning: $FLAC_FILE already exists"
    read -r -p "Overwrite? [y/N]: " OVERWRITE
    if [[ ! "$OVERWRITE" =~ ^[Yy] ]]; then
        echo "Aborted."
        exit 1
    fi
fi

# Create directory if needed
mkdir -p "$DATA_DIR"

# Convert webm to flac (16kHz mono)
echo ""
echo "Converting to FLAC..."
if ! ffmpeg -y -i "$INPUT_FILE" -ar 16000 -ac 1 "$FLAC_FILE" 2>&1 | tail -5; then
    echo "Error: Failed to convert to FLAC"
    exit 1
fi

# Check if FLAC file is valid
if [ ! -f "$FLAC_FILE" ] || [ ! -s "$FLAC_FILE" ]; then
    echo "Error: FLAC file is empty or was not created"
    exit 1
fi

# Extract phonemes and calculate similarity
echo ""
echo "Extracting phonemes and calculating similarity..."
if PHONEME_RESULT=$(pnpm tsx "$SCRIPT_DIR/extract-and-compare.ts" "$FLAC_FILE" "$PHRASE" "$LANG" 2>&1); then
    RECOGNIZED_IPA=$(echo "$PHONEME_RESULT" | jq -r '.recognized_ipa // empty')
    SIMILARITY=$(echo "$PHONEME_RESULT" | jq -r '.similarity // empty')
    echo "Recognized IPA: $RECOGNIZED_IPA"
    if [ -n "$SIMILARITY" ]; then
        echo "Similarity: $SIMILARITY"
    fi
else
    echo "Warning: Could not extract phonemes automatically"
    echo "$PHONEME_RESULT"
    exit 1
fi

# Create YAML metadata
echo "Creating metadata..."
{
    echo "phrase: $PHRASE"
    echo "lang: $LANG"
    echo "source: $SOURCE"
    echo "timestamp: $TIMESTAMP"
    if [ -n "$RECOGNIZED_IPA" ]; then
        echo "recognized_ipa: $RECOGNIZED_IPA"
    fi
    if [ -n "$SIMILARITY" ]; then
        echo "similarity: $SIMILARITY"
    fi
} >"$YAML_FILE"

echo ""
echo "Created:"
echo "  $FLAC_FILE"
echo "  $YAML_FILE"
echo ""
echo "Metadata:"
cat "$YAML_FILE"
