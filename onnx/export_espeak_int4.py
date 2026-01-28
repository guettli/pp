"""
Export facebook/wav2vec2-lv-60-espeak-cv-ft to ONNX with INT4 quantization.

This uses ONNX Runtime's MatMul4BitsQuantizer for 4-bit weight quantization.

Usage:
    pip install onnxruntime>=1.17.0
    python onnx/export_espeak_int4.py

Output:
    onnx/wav2vec2-espeak-int4/  - INT4 quantized model (~170MB)
"""

from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
ONNX_DIR = SCRIPT_DIR / "wav2vec2-espeak-onnx"
INT4_DIR = SCRIPT_DIR / "wav2vec2-espeak-int4"

MODEL_ID = "facebook/wav2vec2-lv-60-espeak-cv-ft"


def quantize_to_int4(onnx_dir: Path):
    """Quantize the ONNX model to INT4 using MatMulNBitsQuantizer."""
    from onnxruntime.quantization.matmul_nbits_quantizer import (
        MatMulNBitsQuantizer,
        DefaultWeightOnlyQuantConfig,
    )
    from shutil import copy2

    print("Quantizing to INT4...")
    print(f"Input: {onnx_dir}")
    print(f"Output: {INT4_DIR}")

    # Create output directory
    INT4_DIR.mkdir(parents=True, exist_ok=True)

    onnx_model = onnx_dir / "model.onnx"
    output_model = INT4_DIR / "model.onnx"

    # Configure INT4 quantization
    algo_config = DefaultWeightOnlyQuantConfig(
        block_size=32,
        is_symmetric=True,
        accuracy_level=4,
        bits=4,  # 4-bit quantization
    )

    # INT4 quantization using MatMulNBitsQuantizer
    print("Running INT4 quantization...")
    quantizer = MatMulNBitsQuantizer(
        model=str(onnx_model),
        algo_config=algo_config,
    )
    quantizer.process()
    quantizer.model.save_model_to_file(str(output_model))

    # Copy config and vocab files
    for file in ["config.json", "preprocessor_config.json", "vocab.json"]:
        src = onnx_dir / file
        if src.exists():
            copy2(src, INT4_DIR / file)

    # Download vocab.json if not present
    if not (INT4_DIR / "vocab.json").exists():
        from huggingface_hub import hf_hub_download
        vocab_path = hf_hub_download(repo_id=MODEL_ID, filename="vocab.json")
        copy2(vocab_path, INT4_DIR / "vocab.json")

    print(f"INT4 quantization complete: {INT4_DIR}")
    return INT4_DIR


def validate_model(model_dir: Path):
    """Test the model with a sample audio."""
    import json
    import numpy as np
    import onnxruntime as ort

    print(f"Validating model in {model_dir}...")

    onnx_files = list(model_dir.glob("*.onnx"))
    if not onnx_files:
        print("No ONNX file found!")
        return

    model_path = onnx_files[0]
    print(f"Loading: {model_path}")

    # Load model
    session = ort.InferenceSession(str(model_path))

    # Create dummy audio (1 second at 16kHz)
    dummy_audio = np.random.randn(1, 16000).astype(np.float32)

    # Run inference
    outputs = session.run(None, {"input_values": dummy_audio})
    logits = outputs[0]

    # Decode using vocab.json
    predicted_ids = np.argmax(logits, axis=-1)[0]
    vocab_file = model_dir / "vocab.json"
    if vocab_file.exists():
        with open(vocab_file) as f:
            vocab = json.load(f)
        id_to_token = {v: k for k, v in vocab.items()}
        tokens = [id_to_token.get(i, "?") for i in predicted_ids]
        phonemes = []
        prev = None
        for t in tokens:
            if t != prev and t not in ("<pad>", "|", "<s>", "</s>"):
                phonemes.append(t)
            prev = t
        print(f"Decoded phonemes: {' '.join(phonemes[:20])}...")
    else:
        print(f"Predicted IDs (first 20): {predicted_ids[:20]}")

    print(f"Output shape: {logits.shape}")
    print(f"Model size: {model_path.stat().st_size / 1024 / 1024:.1f} MB")


def main():
    print("=" * 60)
    print("Wav2Vec2 IPA Phoneme Model - INT4 Quantization")
    print("=" * 60)

    # Check if FP32 ONNX model exists
    if not ONNX_DIR.exists():
        print(f"ERROR: FP32 ONNX model not found at {ONNX_DIR}")
        print("Run export_espeak_int8.py first to create the ONNX model.")
        return

    # Quantize to INT4
    if not INT4_DIR.exists():
        quantize_to_int4(ONNX_DIR)
    else:
        print(f"INT4 model already exists: {INT4_DIR}")

    # Validate
    print("\n" + "=" * 60)
    print("Validation")
    print("=" * 60)
    validate_model(INT4_DIR)


if __name__ == "__main__":
    main()
