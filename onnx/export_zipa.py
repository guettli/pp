"""
Export ZIPA small CTC model to ONNX with INT8 quantization.

ZIPA: A family of efficient speech models for multilingual phone recognition
https://github.com/lingjzhu/zipa

This script:
1. Downloads the ZIPA small CTC model (64M params, ~257MB)
2. Exports to ONNX format using official Icefall code
3. Quantizes to INT8 (~130MB)
4. Converts BPE tokenizer to JSON for browser use

Requirements:
    pip install torch onnx onnxruntime sentencepiece huggingface_hub
    pip install git+https://github.com/k2-fsa/icefall.git

Usage:
    python onnx/export_zipa.py
"""

import json
import logging
import os
import sys
from pathlib import Path
from typing import Dict, Tuple

SCRIPT_DIR = Path(__file__).parent
ZIPA_DIR = SCRIPT_DIR / "zipa-small-ctc"
ZIPA_ONNX_DIR = SCRIPT_DIR / "zipa-small-ctc-onnx"
ZIPA_INT8_DIR = SCRIPT_DIR / "zipa-small-ctc-int8"
ZIPA_REPO_DIR = SCRIPT_DIR / "zipa-repo"

# HuggingFace model info
HF_REPO = "anyspeech/zipa-small-crctc-500k"
MODEL_FILENAME = "zipa_small_crctc_500000_avg10.pth"

# Tokenizer from ZIPA repo
TOKENIZER_URL = "https://raw.githubusercontent.com/lingjzhu/zipa/main/ipa_simplified/bpe.model"

# ZIPA small model architecture parameters
SMALL_MODEL_PARAMS = {
    "num_encoder_layers": "2,2,4,5,4,2",
    "feedforward_dim": "384,512,768,1024,768,512",
    "encoder_dim": "192,256,384,512,384,256",
    "encoder_unmasked_dim": "192,192,256,320,256,192",
    "num_heads": "4,4,4,8,4,4",
    "cnn_module_kernel": "31,31,31,31,31,31",
    "query_head_dim": 32,
    "value_head_dim": 12,
    "pos_head_dim": 4,
    "pos_dim": 48,
    "downsampling_factor": "1,2,4,8,4,2",
}


def download_model():
    """Download the ZIPA small CTC model from HuggingFace."""
    from huggingface_hub import hf_hub_download

    print(f"Downloading model from {HF_REPO}...")

    ZIPA_DIR.mkdir(parents=True, exist_ok=True)

    model_path = hf_hub_download(
        repo_id=HF_REPO,
        filename=MODEL_FILENAME,
        local_dir=ZIPA_DIR,
    )

    print(f"Model downloaded to: {model_path}")
    return Path(model_path)


def download_tokenizer():
    """Download the BPE tokenizer from ZIPA repo."""
    import urllib.request

    tokenizer_path = ZIPA_DIR / "bpe.model"

    if not tokenizer_path.exists():
        print(f"Downloading tokenizer...")
        urllib.request.urlretrieve(TOKENIZER_URL, tokenizer_path)
        print(f"Tokenizer saved to: {tokenizer_path}")

    return tokenizer_path


def convert_tokenizer_to_json(bpe_model_path: Path, output_dir: Path):
    """Convert SentencePiece BPE model to JSON vocab for browser use."""
    import sentencepiece as spm

    sp = spm.SentencePieceProcessor()
    sp.Load(str(bpe_model_path))

    vocab = {}
    for i in range(sp.GetPieceSize()):
        piece = sp.IdToPiece(i)
        vocab[piece] = i

    output_dir.mkdir(parents=True, exist_ok=True)
    vocab_path = output_dir / "vocab.json"
    with open(vocab_path, 'w', encoding='utf-8') as f:
        json.dump(vocab, f, ensure_ascii=False, indent=2)

    print(f"Tokenizer vocab ({len(vocab)} tokens) saved to: {vocab_path}")
    return vocab


def create_tokens_file(bpe_model_path: Path, output_path: Path):
    """Create k2 tokens.txt file from BPE model."""
    import sentencepiece as spm

    sp = spm.SentencePieceProcessor()
    sp.Load(str(bpe_model_path))

    with open(output_path, 'w', encoding='utf-8') as f:
        for i in range(sp.GetPieceSize()):
            piece = sp.IdToPiece(i)
            f.write(f"{piece} {i}\n")

    print(f"Tokens file ({sp.GetPieceSize()} tokens) saved to: {output_path}")
    return output_path


def setup_exp_dir():
    """Set up the experiment directory with the model checkpoint."""
    exp_dir = ZIPA_DIR / "exp"
    exp_dir.mkdir(parents=True, exist_ok=True)

    # Link the averaged checkpoint as epoch-999.pt (using a high number)
    src = ZIPA_DIR / MODEL_FILENAME
    dst = exp_dir / "epoch-999.pt"

    if dst.exists():
        dst.unlink()

    # Create symlink
    dst.symlink_to(src.resolve())
    print(f"Linked {src} -> {dst}")

    return exp_dir


def export_with_icefall():
    """Export ZIPA using official Icefall-based approach."""
    import torch
    import torch.nn as nn
    import onnx
    from onnxruntime.quantization import QuantType, quantize_dynamic

    print("\n" + "=" * 60)
    print("Exporting with Icefall")
    print("=" * 60)

    # Add ZIPA repo to path for imports
    sys.path.insert(0, str(ZIPA_REPO_DIR / "zipformer_crctc"))

    try:
        import k2
        from scaling_converter import convert_scaled_to_non_scaled
        from train import add_model_arguments, get_model, get_params
        from zipformer import Zipformer2
        from icefall.checkpoint import load_checkpoint
        from icefall.utils import make_pad_mask, num_tokens, str2bool
    except ImportError as e:
        print(f"Import error: {e}")
        print("Make sure Icefall and K2 are installed:")
        print("  pip install git+https://github.com/k2-fsa/icefall.git")
        return False

    # Setup paths
    tokenizer_path = download_tokenizer()
    tokens_path = ZIPA_DIR / "tokens.txt"
    create_tokens_file(tokenizer_path, tokens_path)
    exp_dir = setup_exp_dir()

    # Create output directory
    ZIPA_ONNX_DIR.mkdir(parents=True, exist_ok=True)

    # Load token table
    token_table = k2.SymbolTable.from_file(str(tokens_path))
    blank_id = token_table["<blk>"]
    vocab_size = num_tokens(token_table) + 1

    print(f"Vocab size: {vocab_size}, blank_id: {blank_id}")

    # Build params namespace
    class Params:
        pass

    params = Params()
    # Set model architecture params
    params.num_encoder_layers = SMALL_MODEL_PARAMS["num_encoder_layers"]
    params.feedforward_dim = SMALL_MODEL_PARAMS["feedforward_dim"]
    params.encoder_dim = SMALL_MODEL_PARAMS["encoder_dim"]
    params.encoder_unmasked_dim = SMALL_MODEL_PARAMS["encoder_unmasked_dim"]
    params.num_heads = SMALL_MODEL_PARAMS["num_heads"]
    params.cnn_module_kernel = SMALL_MODEL_PARAMS["cnn_module_kernel"]
    params.query_head_dim = SMALL_MODEL_PARAMS["query_head_dim"]
    params.value_head_dim = SMALL_MODEL_PARAMS["value_head_dim"]
    params.pos_head_dim = SMALL_MODEL_PARAMS["pos_head_dim"]
    params.pos_dim = SMALL_MODEL_PARAMS["pos_dim"]
    params.downsampling_factor = SMALL_MODEL_PARAMS["downsampling_factor"]

    # Other required params
    params.vocab_size = vocab_size
    params.blank_id = blank_id
    params.context_size = 2
    params.use_transducer = False
    params.use_ctc = True
    params.decoder_dim = 512
    params.joiner_dim = 512
    params.causal = False
    params.chunk_size = "16,32,64,-1"
    params.left_context_frames = "64,128,256,-1"

    print("Creating model...")
    model = get_model(params)

    # Load checkpoint
    checkpoint_path = exp_dir / "epoch-999.pt"
    print(f"Loading checkpoint: {checkpoint_path}")

    load_checkpoint(str(checkpoint_path), model, strict=False)

    model.to("cpu")
    model.eval()

    # Convert scaled parameters
    convert_scaled_to_non_scaled(model, inplace=True, is_onnx=True)

    # Create ONNX wrapper
    class OnnxModel(nn.Module):
        def __init__(self, encoder, encoder_embed, ctc_output):
            super().__init__()
            self.encoder = encoder
            self.encoder_embed = encoder_embed
            self.ctc_output = ctc_output

        def forward(self, x: torch.Tensor, x_lens: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
            x, x_lens = self.encoder_embed(x, x_lens)
            src_key_padding_mask = make_pad_mask(x_lens)
            x = x.permute(1, 0, 2)
            encoder_out, log_probs_len = self.encoder(x, x_lens, src_key_padding_mask)
            encoder_out = encoder_out.permute(1, 0, 2)
            log_probs = self.ctc_output(encoder_out)
            return log_probs, log_probs_len

    onnx_model = OnnxModel(
        encoder=model.encoder,
        encoder_embed=model.encoder_embed,
        ctc_output=model.ctc_output,
    )

    num_param = sum([p.numel() for p in onnx_model.parameters()])
    print(f"Number of parameters: {num_param:,}")

    # Export to ONNX
    print("Exporting to ONNX...")
    x = torch.zeros(1, 100, 80, dtype=torch.float32)
    x_lens = torch.tensor([100], dtype=torch.int64)

    onnx_model = torch.jit.trace(onnx_model, (x, x_lens))

    onnx_path = ZIPA_ONNX_DIR / "model.onnx"
    torch.onnx.export(
        onnx_model,
        (x, x_lens),
        str(onnx_path),
        verbose=False,
        opset_version=13,
        input_names=["x", "x_lens"],
        output_names=["log_probs", "log_probs_len"],
        dynamic_axes={
            "x": {0: "N", 1: "T"},
            "x_lens": {0: "N"},
            "log_probs": {0: "N", 1: "T"},
            "log_probs_len": {0: "N"},
        },
    )

    # Add metadata
    onnx_model_file = onnx.load(str(onnx_path))
    meta_data = {
        "model_type": "zipa_small_ctc",
        "version": "1",
        "model_author": "lingjzhu/zipa",
        "comment": "ZIPA small CTC for multilingual phone recognition",
    }
    for key, value in meta_data.items():
        meta = onnx_model_file.metadata_props.add()
        meta.key = key
        meta.value = value
    onnx.save(onnx_model_file, str(onnx_path))

    print(f"ONNX model saved to: {onnx_path}")
    print(f"ONNX model size: {onnx_path.stat().st_size / 1024 / 1024:.1f} MB")

    # Quantize to INT8
    print("\nQuantizing to INT8...")
    ZIPA_INT8_DIR.mkdir(parents=True, exist_ok=True)
    int8_path = ZIPA_INT8_DIR / "model.onnx"

    quantize_dynamic(
        model_input=str(onnx_path),
        model_output=str(int8_path),
        op_types_to_quantize=["MatMul"],
        weight_type=QuantType.QInt8,
    )

    print(f"INT8 model saved to: {int8_path}")
    print(f"INT8 model size: {int8_path.stat().st_size / 1024 / 1024:.1f} MB")

    return True


def create_browser_config():
    """Create configuration file for browser integration."""
    config = {
        "model_type": "zipa-small-ctc",
        "input_type": "fbank",
        "input_dim": 80,
        "sample_rate": 16000,
        "frame_length_ms": 25,
        "frame_shift_ms": 10,
        "num_mel_bins": 80,
        "vocab_type": "bpe",
        "output_type": "ipa_phonemes",
        "input_names": ["x", "x_lens"],
        "output_names": ["log_probs", "log_probs_len"],
        "notes": [
            "Input 'x' is 80-dim Fbank features: shape (batch, time, 80)",
            "Input 'x_lens' is sequence lengths: shape (batch,)",
            "Use Mel spectrogram: 25ms window, 10ms hop, 80 mel bins",
            "Output tokens are IPA phonemes encoded with BPE",
            "Apply CTC decoding (collapse repeats, remove blank token 0)",
        ]
    }

    config_path = ZIPA_INT8_DIR / "config.json"
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)

    print(f"Browser config saved to: {config_path}")


def validate_onnx_model():
    """Validate the exported ONNX model."""
    import numpy as np
    import onnxruntime as ort

    print("\n" + "=" * 60)
    print("Validating ONNX model")
    print("=" * 60)

    int8_path = ZIPA_INT8_DIR / "model.onnx"
    if not int8_path.exists():
        print(f"Model not found: {int8_path}")
        return False

    print(f"Loading model: {int8_path}")
    session = ort.InferenceSession(str(int8_path))

    # Print input/output info
    print("\nInputs:")
    for inp in session.get_inputs():
        print(f"  {inp.name}: {inp.shape} ({inp.type})")

    print("\nOutputs:")
    for out in session.get_outputs():
        print(f"  {out.name}: {out.shape} ({out.type})")

    # Run inference with dummy input
    x = np.random.randn(1, 100, 80).astype(np.float32)
    x_lens = np.array([100], dtype=np.int64)

    outputs = session.run(None, {"x": x, "x_lens": x_lens})
    log_probs, log_probs_len = outputs

    print(f"\nInference test:")
    print(f"  Input shape: {x.shape}")
    print(f"  Output log_probs shape: {log_probs.shape}")
    print(f"  Output log_probs_len: {log_probs_len}")

    # Decode with vocab
    vocab_path = ZIPA_INT8_DIR / "vocab.json"
    if vocab_path.exists():
        with open(vocab_path) as f:
            vocab = json.load(f)
        id_to_token = {v: k for k, v in vocab.items()}

        predicted_ids = np.argmax(log_probs, axis=-1)[0]
        tokens = []
        prev = None
        for idx in predicted_ids:
            if idx != prev and idx != 0:  # Remove repeats and blank
                tokens.append(id_to_token.get(idx, f"[{idx}]"))
            prev = idx

        print(f"  Sample decoded tokens: {' '.join(tokens[:20])}...")

    return True


def main():
    logging.basicConfig(
        format="%(asctime)s %(levelname)s [%(filename)s:%(lineno)d] %(message)s",
        level=logging.INFO,
    )

    print("=" * 60)
    print("ZIPA Small CTC Model - ONNX Export")
    print("=" * 60)

    # Create directories
    ZIPA_DIR.mkdir(parents=True, exist_ok=True)

    # Step 1: Download model and tokenizer
    print("\n[Step 1] Downloading model and tokenizer...")
    if not (ZIPA_DIR / MODEL_FILENAME).exists():
        download_model()
    else:
        print(f"Model already exists: {ZIPA_DIR / MODEL_FILENAME}")

    tokenizer_path = download_tokenizer()

    # Step 2: Convert tokenizer to JSON for browser
    print("\n[Step 2] Converting tokenizer to JSON...")
    convert_tokenizer_to_json(tokenizer_path, ZIPA_INT8_DIR)

    # Step 3: Export to ONNX
    print("\n[Step 3] Exporting model to ONNX...")
    success = export_with_icefall()

    if not success:
        print("\nExport failed. Please check the error messages above.")
        sys.exit(1)

    # Step 4: Create browser config
    print("\n[Step 4] Creating browser configuration...")
    create_browser_config()

    # Step 5: Validate
    print("\n[Step 5] Validating model...")
    validate_onnx_model()

    print("\n" + "=" * 60)
    print("Export complete!")
    print("=" * 60)
    print(f"FP32 ONNX model: {ZIPA_ONNX_DIR / 'model.onnx'}")
    print(f"INT8 ONNX model: {ZIPA_INT8_DIR / 'model.onnx'}")
    print(f"Vocab JSON: {ZIPA_INT8_DIR / 'vocab.json'}")
    print(f"Config JSON: {ZIPA_INT8_DIR / 'config.json'}")


if __name__ == "__main__":
    main()
