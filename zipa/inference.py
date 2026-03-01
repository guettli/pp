
import os
import re
import sys
import numpy as np
import onnxruntime as ort
import soundfile as sf
import soxr
import argparse

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from utils import load_tokens, ctc_greedy_decode, transducer_greedy_decode, get_fbank_extractor

_SPECIAL_TOKENS = {"▁", "<blk>", "<sos/eos>"}

def _read_model_name_from_ts_config():
    config_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "lib", "model-config.ts")
    if os.path.exists(config_file):
        with open(config_file) as f:
            for line in f:
                m = re.search(r'MODEL_NAME\s*=\s*"([^"]+)"', line)
                if m:
                    return m.group(1)
    return "zipa-small-crctc-ns-700k"  # fallback

def _default_model_path():
    model_name = _read_model_name_from_ts_config()
    cache_dir = os.path.join(os.path.expanduser("~"), ".cache", "phoneme-party", "models")
    return os.path.join(cache_dir, f"{model_name}.onnx")

def _default_tokens_path():
    model_name = _read_model_name_from_ts_config()
    cache_dir = os.path.join(os.path.expanduser("~"), ".cache", "phoneme-party", "models")
    return os.path.join(cache_dir, f"{model_name}.tokens.txt")

def main():
    parser = argparse.ArgumentParser(description="Run inference using ONNX models.")
    parser.add_argument("audio_file", help="Path to input audio file")
    parser.add_argument("--model-path", default=_default_model_path(), help="Path to ONNX model file (CTC) or directory (Transducer)")
    parser.add_argument("--model-type", choices=["ctc", "transducer"], default="ctc", help="Model architecture")
    parser.add_argument("--tokens", default=_default_tokens_path(), help="Path to tokens.txt")
    parser.add_argument("--suffix", default=".onnx", help="Search suffix for Transducer files (e.g. .fp16.onnx)")
    parser.add_argument("--dump-features", metavar="PATH", help="Save fbank features as .npy file for preprocessing comparison")
    args = parser.parse_args()

    if not os.path.exists(args.audio_file):
        print(f"Error: Audio file {args.audio_file} not found.")
        sys.exit(1)

    audio, sr = sf.read(args.audio_file)
    if len(audio.shape) > 1:
        audio = audio[:, 0]

    if sr != 16000:
        audio = soxr.resample(audio, sr, 16000)

    peak = np.max(np.abs(audio))
    if peak > 0:
        audio = audio / peak * 0.9

    fbank = get_fbank_extractor()
    fbank.accept_waveform(16000, audio.tolist())
    num_frames = fbank.num_frames_ready
    feature = np.array([fbank.get_frame(i) for i in range(num_frames)], dtype=np.float32)[np.newaxis]
    feat_lens = np.array([num_frames], dtype=np.int64)

    if args.dump_features:
        np.save(args.dump_features, feature)
        print(f"Fbank features saved to {args.dump_features}  shape={feature.shape}")

    vocab = load_tokens(args.tokens)
    if not vocab:
        print("Warning: Vocabulary empty or tokens file not found.")

    if args.model_type == "ctc":
        if not os.path.isfile(args.model_path):
             print(f"Error: For CTC, --model-path must be a file.")
             sys.exit(1)

        session = ort.InferenceSession(args.model_path)

        inputs = {"x": feature, "x_lens": feat_lens}
        outputs = session.run(None, inputs)
        log_probs = outputs[0][0]  # shape: (time, vocab)

        probs = np.exp(log_probs)
        def fmt_token(idx, prob):
            raw = vocab.get(idx, f"<{idx}>")
            char = "⎵" if raw in ("<blk>", "▁") else raw
            pct = min(int(prob * 100), 99)
            return f"{char}:{pct:02d}"
        lines = []
        for t in range(log_probs.shape[0]):
            top5 = np.argsort(probs[t])[-5:][::-1]
            visible = [(int(i), probs[t, i]) for i in top5 if probs[t, i] * 100 >= 8]
            space_entry = next(((idx, p) for idx, p in visible if vocab.get(idx, "") in ("<blk>", "▁")), None)
            non_space = [(idx, p) for idx, p in visible if vocab.get(idx, "") not in ("<blk>", "▁")]
            first_col = fmt_token(*space_entry) if space_entry else "    "
            rest = ("  " + "  ".join(fmt_token(idx, p) for idx, p in non_space)) if non_space else ""
            parts = first_col + rest
            lines.append((parts, not non_space))
        nonempty = [i for i, (_, blank) in enumerate(lines) if not blank]
        first_nonempty = nonempty[0] if nonempty else len(lines)
        last_nonempty = nonempty[-1] if nonempty else -1
        t = 0
        while t < len(lines):
            parts, blank = lines[t]
            if t < first_nonempty:
                end = first_nonempty - 1
                print(f"{t:03}..{end:03}: empty" if t < end else f"{t:03}: empty")
                t = first_nonempty
            elif t > last_nonempty:
                end = len(lines) - 1
                print(f"{t:03}..{end:03}: empty" if t < end else f"{t:03}: empty")
                break
            else:
                print(f"{t:03}: {parts}")
                t += 1

        phones = ctc_greedy_decode(log_probs, vocab)
        print("".join(p for p in phones if p not in _SPECIAL_TOKENS))

    elif args.model_type == "transducer":
        base_path = args.model_path
        enc_path, dec_path, join_path = None, None, None

        if os.path.isdir(base_path):
             search_term = args.suffix
             for f in os.listdir(base_path):
                if f.startswith("encoder-") and f.endswith(search_term):
                    if search_term == ".onnx" and (".fp16.onnx" in f or ".int8.onnx" in f):
                        continue

                    suffix = f.replace("encoder-", "")
                    enc_path = os.path.join(base_path, f)
                    dec_path = os.path.join(base_path, f.replace("encoder-", "decoder-"))
                    join_path = os.path.join(base_path, f.replace("encoder-", "joiner-"))
                    break
        else:
             print("Error: For Transducer, --model-path should be a directory containing the component ONNX files.")
             sys.exit(1)

        if enc_path and os.path.exists(enc_path) and os.path.exists(dec_path):
             sess_enc = ort.InferenceSession(enc_path)
             sess_dec = ort.InferenceSession(dec_path)
             sess_join = ort.InferenceSession(join_path)

             enc_out = sess_enc.run(None, {"x": feature, "x_lens": feat_lens})[0][0]
             decoded_phones = transducer_greedy_decode(enc_out, sess_dec, sess_join, vocab)
             print("".join(p for p in decoded_phones if p not in _SPECIAL_TOKENS))
        else:
             print(f"Could not find valid Transducer model files with suffix '{args.suffix}' in {base_path}")
             sys.exit(1)

if __name__ == "__main__":
    main()
