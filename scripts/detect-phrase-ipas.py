#!/usr/bin/env python3
"""Detect IPA from all pre-generated opus files in static/audio/.

Output: static/audio/ipas.json  (lang → voice → phrase → detected_ipa)

Usage:
    python scripts/detect-phrase-ipas.py [--workers N]

Resumable: re-running skips already-completed entries.
"""

import hashlib
import json
import multiprocessing as mp
import os
import re
import subprocess
import sys
from pathlib import Path

import yaml

_REPO_ROOT = Path(__file__).parent.parent
_SPECIAL_TOKENS = {"▁", "<blk>", "<sos/eos>"}

sys.path.insert(0, str(_REPO_ROOT / "zipa"))


def _read_model_name():
    config_file = _REPO_ROOT / "src" / "lib" / "model-config.ts"
    if config_file.exists():
        for line in config_file.read_text().splitlines():
            m = re.search(r'MODEL_NAME\s*=\s*"([^"]+)"', line)
            if m:
                return m.group(1)
    return "zipa-small-crctc-ns-700k"


def _phrase_hash(phrase: str) -> str:
    return hashlib.md5(phrase.encode("utf-8")).hexdigest()[:16]


def _build_hash_to_phrase():
    """Build {(lang, hash) -> phrase} from manifest and yaml files.

    Manifest takes priority (covers edge-tts voices whose hashes differ from
    the computed md5). The yaml-based fallback covers voices not in manifest
    (e.g. piper-kerstin).
    """
    lookup = {}

    # Fallback: compute from yaml phrase lists (covers piper voices)
    for yaml_file in sorted(_REPO_ROOT.glob("phrases-*.yaml")):
        lang = yaml_file.stem.replace("phrases-", "")
        with open(yaml_file) as f:
            phrases = yaml.safe_load(f)
        for entry in phrases:
            phrase = entry.get("phrase", "")
            if phrase:
                lookup[(lang, _phrase_hash(phrase))] = phrase

    # Primary: manifest has exact hash→phrase for all generated voices
    manifest_path = _REPO_ROOT / "static" / "audio" / "manifest.json"
    if manifest_path.exists():
        with open(manifest_path) as f:
            manifest = json.load(f)
        for lang, voices in manifest.items():
            for voice_data in voices.values():
                for phrase, h in voice_data.items():
                    lookup[(lang, h)] = phrase

    return lookup


# --- Worker process ---

_session = None
_vocab = None


def _init_worker(model_path, tokens_path):
    """Load ONNX model and vocab once per worker process."""
    global _session, _vocab
    import onnxruntime as ort
    from utils import load_tokens
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1
    opts.inter_op_num_threads = 1
    _session = ort.InferenceSession(model_path, sess_options=opts, providers=["CPUExecutionProvider"])
    _vocab = load_tokens(tokens_path)


def _detect_one(task):
    lang, voice, phrase, opus_path = task
    import numpy as np
    from utils import ctc_greedy_decode, get_fbank_extractor

    # Decode opus → float32 PCM at 16 kHz via ffmpeg
    proc = subprocess.run(
        ["ffmpeg", "-i", opus_path, "-f", "f32le", "-ar", "16000", "-ac", "1", "pipe:1"],
        capture_output=True,
    )
    if proc.returncode != 0 or not proc.stdout:
        return lang, voice, phrase, ""

    audio = np.frombuffer(proc.stdout, dtype=np.float32)

    fbank = get_fbank_extractor()
    fbank.accept_waveform(16000, audio.tolist())
    num_frames = fbank.num_frames_ready
    if num_frames == 0:
        return lang, voice, phrase, ""

    feature = np.array([fbank.get_frame(i) for i in range(num_frames)], dtype=np.float32)[np.newaxis]
    feat_lens = np.array([num_frames], dtype=np.int64)

    outputs = _session.run(None, {"x": feature, "x_lens": feat_lens})
    log_probs = outputs[0][0]

    phones = ctc_greedy_decode(log_probs, _vocab)
    ipa = "".join(p for p in phones if p not in _SPECIAL_TOKENS)
    return lang, voice, phrase, ipa


# --- Main ---

def main():
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workers", type=int, default=mp.cpu_count(),
                        help="Number of parallel workers (default: cpu count)")
    args = parser.parse_args()

    audio_dir = _REPO_ROOT / "static" / "audio"
    out_file = audio_dir / "ipas.json"

    model_name = _read_model_name()
    cache_dir = Path.home() / ".cache" / "phoneme-party" / "models"
    model_path = str(cache_dir / f"{model_name}.onnx")
    tokens_path = str(cache_dir / f"{model_name}.tokens.txt")

    hash_to_phrase = _build_hash_to_phrase()

    # Collect all tasks
    tasks = []
    for lang_dir in sorted(audio_dir.iterdir()):
        if not lang_dir.is_dir() or lang_dir.name == "manifest.json":
            continue
        lang = lang_dir.name
        for voice_dir in sorted(lang_dir.iterdir()):
            if not voice_dir.is_dir():
                continue
            voice = voice_dir.name
            for opus_file in sorted(voice_dir.glob("*.opus")):
                phrase = hash_to_phrase.get((lang, opus_file.stem))
                if phrase:
                    tasks.append((lang, voice, phrase, str(opus_file)))

    # Load existing results (resume support)
    results = {}
    if out_file.exists():
        with open(out_file) as f:
            results = json.load(f)
        already_done = sum(len(v) for lang_d in results.values() for v in lang_d.values())
        tasks = [
            (lang, voice, phrase, path)
            for lang, voice, phrase, path in tasks
            if results.get(lang, {}).get(voice, {}).get(phrase) is None
        ]
        print(f"Resuming: {already_done} done, {len(tasks)} remaining", flush=True)
    else:
        print(f"Processing {len(tasks)} audio files...", flush=True)

    if not tasks:
        print("All done!")
        return

    n_workers = min(args.workers, len(tasks))
    total = len(tasks) + sum(len(v) for lang_d in results.values() for v in lang_d.values())
    done = total - len(tasks)

    print(f"Workers: {n_workers}", flush=True)

    with mp.Pool(n_workers, initializer=_init_worker, initargs=(model_path, tokens_path)) as pool:
        for lang, voice, phrase, ipa in pool.imap_unordered(_detect_one, tasks, chunksize=8):
            results.setdefault(lang, {}).setdefault(voice, {})[phrase] = ipa
            done += 1
            if done % 100 == 0 or done == total:
                print(f"  {done}/{total}", flush=True)
                with open(out_file, "w") as f:
                    json.dump(results, f, ensure_ascii=False)

    with open(out_file, "w") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"Done. Written to {out_file}", flush=True)


if __name__ == "__main__":
    main()
