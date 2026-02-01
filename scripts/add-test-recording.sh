#!/bin/bash
# Add a user recording as a test case
# Usage: ./scripts/add-test-recording.sh ~/Downloads/Brot_20260131T073450_de.webm

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <recording-file>"
    echo "Example: $0 ~/Downloads/Brot_20260131T073450_de.webm"
    exit 1
fi

INPUT_FILE="$1"

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: File not found: $INPUT_FILE"
    exit 1
fi

# Ensure dist-node is built
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
echo "Building dist-node..."
(cd "$PROJECT_DIR" && pnpm build:node)
echo ""

# Parse filename: Word_Timestamp_Lang.webm
BASENAME=$(basename "$INPUT_FILE" .webm)
WORD=$(echo "$BASENAME" | cut -d'_' -f1)
TIMESTAMP=$(echo "$BASENAME" | cut -d'_' -f2)
LANG=$(echo "$BASENAME" | cut -d'_' -f3)

if [ -z "$WORD" ] || [ -z "$LANG" ]; then
    echo "Error: Could not parse filename. Expected format: Word_Timestamp_Lang.webm"
    echo "Got: WORD=$WORD, TIMESTAMP=$TIMESTAMP, LANG=$LANG"
    exit 1
fi

echo "Parsed from filename:"
echo "  Word: $WORD"
echo "  Language: $LANG"
echo "  Timestamp: $TIMESTAMP"
echo ""

# Ask for source name
read -r -p "Source name (default: user-recording): " SOURCE
SOURCE=${SOURCE:-user-recording}

# Ask if mispronunciation (no default, must answer)
while true; do
    read -r -p "Is this a mispronunciation test? [y/n]: " IS_MISPRO
    if [[ "$IS_MISPRO" =~ ^[YyNn]$ ]]; then
        break
    fi
    echo "Please answer y or n"
done

SPOKEN_AS=""
EXPECTED_PHONEMES=""

if [[ "$IS_MISPRO" =~ ^[Yy] ]]; then
    read -r -p "Spoken as (what was actually said): " SPOKEN_AS
    if [ -z "$SPOKEN_AS" ]; then
        echo "Error: spoken_as is required for mispronunciation tests"
        exit 1
    fi
    read -r -p "Expected phonemes (space-separated, e.g., 'b l o ː t'): " EXPECTED_PHONEMES
    if [ -z "$EXPECTED_PHONEMES" ]; then
        echo "Error: expected_phonemes is required for mispronunciation tests"
        exit 1
    fi
fi

# Determine output paths
DATA_DIR="$PROJECT_DIR/tests/data/$LANG/$WORD"

if [[ "$IS_MISPRO" =~ ^[Yy] ]]; then
    SPOKEN_AS_LOWER=$(echo "$SPOKEN_AS" | tr '[:upper:]' '[:lower:]')
    OUTPUT_BASE="$WORD-mispro-$SPOKEN_AS_LOWER"
else
    OUTPUT_BASE="$WORD-$SOURCE"
fi

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
ffmpeg -y -i "$INPUT_FILE" -ar 16000 -ac 1 "$FLAC_FILE" 2>/dev/null

# Extract phonemes and calculate similarity
echo "Extracting phonemes and calculating similarity..."
echo " .... pnpm" tsx "$SCRIPT_DIR/extract-and-compare.ts" "$FLAC_FILE" "$WORD" "$LANG"
echo
if PHONEME_RESULT=$(pnpm tsx "$SCRIPT_DIR/extract-and-compare.ts" "$FLAC_FILE" "$WORD" "$LANG" 2>&1); then
    RECOGNIZED_IPA=$(echo "$PHONEME_RESULT" | grep -o '"recognized_ipa":"[^"]*"' | cut -d'"' -f4)
    SIMILARITY=$(echo "$PHONEME_RESULT" | grep -o '"similarity":"[^"]*"' | cut -d'"' -f4)
    echo "Recognized IPA: $RECOGNIZED_IPA"
    echo "Similarity: $SIMILARITY"
else
    echo "Warning: Could not extract phonemes automatically: $PHONEME_RESULT"
    exit 1
fi

# Create YAML metadata
echo "Creating metadata..."
{
    echo "word: $WORD"
    if [[ "$IS_MISPRO" =~ ^[Yy] ]]; then
        echo "spoken_as: $SPOKEN_AS"
    fi
    echo "lang: $LANG"
    if [[ "$IS_MISPRO" =~ ^[Yy] ]]; then
        echo "mispronunciation: true"
        echo "expected_phonemes: $EXPECTED_PHONEMES"
    fi
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
