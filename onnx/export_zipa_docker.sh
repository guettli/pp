#!/usr/bin/env bash
# Export ZIPA model to ONNX using Docker
# This uses a PyTorch+CUDA container with k2 pre-installed
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ZIPA_DIR="$SCRIPT_DIR/zipa-small-ctc"
ZIPA_REPO_DIR="$SCRIPT_DIR/zipa-repo"
OUTPUT_DIR="$SCRIPT_DIR/zipa-small-ctc-onnx"

echo "============================================================"
echo "ZIPA ONNX Export via Docker"
echo "============================================================"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed"
    exit 1
fi

# Check if model exists
MODEL_FILE="$ZIPA_DIR/zipa_small_crctc_500000_avg10.pth"
if [[ ! -f "$MODEL_FILE" ]]; then
    echo "ERROR: Model not found: $MODEL_FILE"
    echo "Run 'python onnx/export_zipa.py' first to download it"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Create tokens.txt from vocab.json if not exists
TOKENS_FILE="$ZIPA_DIR/tokens.txt"
if [[ ! -f "$TOKENS_FILE" ]]; then
    echo "Creating tokens.txt from vocab.json..."
    # Use the already-exported vocab.json
    VOCAB_JSON="$SCRIPT_DIR/zipa-small-ctc-int8/vocab.json"
    if [[ -f "$VOCAB_JSON" ]]; then
        python3 -c "
import json
with open('$VOCAB_JSON') as f:
    vocab = json.load(f)
with open('$TOKENS_FILE', 'w', encoding='utf-8') as f:
    for token, idx in sorted(vocab.items(), key=lambda x: x[1]):
        f.write(f'{token} {idx}\n')
print(f'Created {len(vocab)} tokens')
"
    else
        echo "ERROR: vocab.json not found. Run 'onnx/run_export.sh' first"
        exit 1
    fi
fi

# Create exp directory with symlinked checkpoint
EXP_DIR="$ZIPA_DIR/exp"
mkdir -p "$EXP_DIR"
ln -sf "$(realpath "$MODEL_FILE")" "$EXP_DIR/epoch-999.pt"

echo ""
echo "Using Docker image: k2fsa/icefall:torch2.4.0-cuda12.4"
echo "This will download ~15GB on first run..."
echo ""

# Run export in Docker container
docker run --rm \
    -v "$ZIPA_REPO_DIR:/workspace/zipa:ro" \
    -v "$ZIPA_DIR:/workspace/model" \
    -v "$OUTPUT_DIR:/workspace/output" \
    k2fsa/icefall:torch2.4.0-cuda12.4 \
    bash -c '
set -e
cd /workspace/zipa/zipformer_crctc

echo "Running ONNX export..."

python export-onnx-ctc.py \
    --exp-dir /workspace/model/exp \
    --tokens /workspace/model/tokens.txt \
    --epoch 999 \
    --avg 1 \
    --use-averaged-model 0 \
    --num-encoder-layers "2,2,4,5,4,2" \
    --feedforward-dim "384,512,768,1024,768,512" \
    --encoder-dim "192,256,384,512,384,256" \
    --encoder-unmasked-dim "192,192,256,320,256,192" \
    --num-heads "4,4,4,8,4,4" \
    --cnn-module-kernel "31,31,31,31,31,31" \
    --query-head-dim 32 \
    --value-head-dim 12 \
    --pos-head-dim 4 \
    --pos-dim 48 \
    --downsampling-factor "1,2,4,8,4,2" \
    --causal False \
    --use-transducer 0 \
    --use-ctc 1

# Copy output
cp /workspace/model/exp/model.onnx /workspace/output/
if [[ -f /workspace/model/exp/model.int8.onnx ]]; then
    cp /workspace/model/exp/model.int8.onnx /workspace/output/
fi

echo "Export complete!"
ls -lh /workspace/output/
'

echo ""
echo "============================================================"
echo "Export complete!"
echo "============================================================"
echo "Output: $OUTPUT_DIR"
ls -lh "$OUTPUT_DIR"
