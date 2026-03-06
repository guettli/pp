#!/usr/bin/env python3
"""
TTS Audio Generator for German pronunciation testing.

Generates audio for 10 German test sentences using multiple TTS engines.
Output: tts-test/audio/<tts_variant>/<sentence_id>_<safe_text>.wav

TTS variants:
  1. espeak       - espeak-ng standard speed
  2. espeak-slow  - espeak-ng slow speed
  3. piper-thorsten  - Piper neural TTS, de_DE-thorsten-high
  4. piper-kerstin   - Piper neural TTS, de_DE-kerstin-low
  5. piper-ramona    - Piper neural TTS, de_DE-ramona-low
  6. edge-tts-male   - Microsoft Edge TTS, de-DE-ConradNeural
  7. edge-tts-female - Microsoft Edge TTS, de-DE-KatjaNeural
  8. gtts          - Google TTS (gTTS)
  9. gtts-slow     - Google TTS slow mode
"""

import asyncio
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
SENTENCES_FILE = SCRIPT_DIR / "sentences.json"
AUDIO_DIR = SCRIPT_DIR / "audio"

PIPER_MODEL_DIR = Path.home() / ".cache" / "phoneme-party" / "piper-models"
PIPER_MODEL_DIR.mkdir(parents=True, exist_ok=True)

PIPER_MODELS = {
    "piper-thorsten": {
        "name": "de_DE-thorsten-high",
        "onnx_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/high/de_DE-thorsten-high.onnx",
        "json_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/high/de_DE-thorsten-high.onnx.json",
    },
    "piper-kerstin": {
        "name": "de_DE-kerstin-low",
        "onnx_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/kerstin/low/de_DE-kerstin-low.onnx",
        "json_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/kerstin/low/de_DE-kerstin-low.onnx.json",
    },
    "piper-ramona": {
        "name": "de_DE-ramona-low",
        "onnx_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/ramona/low/de_DE-ramona-low.onnx",
        "json_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/ramona/low/de_DE-ramona-low.onnx.json",
    },
}


def safe_filename(text: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9\s]", "", text)
    text = text.strip().replace(" ", "_")[:40]
    return text


def run_cmd(cmd: list, **kwargs):
    print(f"  $ {' '.join(str(c) for c in cmd)}", flush=True)
    return subprocess.run(cmd, **kwargs)


def to_wav_16k(src: Path, dst: Path):
    result = run_cmd(
        ["ffmpeg", "-y", "-i", str(src), "-ar", "16000", "-ac", "1", str(dst)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    if result.returncode != 0:
        print(f"  WARNING: ffmpeg conversion failed for {src}", file=sys.stderr)


# ── espeak-ng ────────────────────────────────────────────────

def generate_espeak(sentence: dict, out_dir: Path, speed: int = 150):
    out_file = out_dir / f"{sentence['id']:02d}_{safe_filename(sentence['text'])}.wav"
    if out_file.exists():
        print(f"  already exists: {out_file.name}")
        return out_file
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    run_cmd(["espeak-ng", "-v", "de", "-s", str(speed), "-w", str(tmp_path), sentence["text"]])
    to_wav_16k(tmp_path, out_file)
    tmp_path.unlink(missing_ok=True)
    return out_file


# ── Piper TTS ────────────────────────────────────────────────

def download_piper_model(variant_key: str) -> tuple:
    info = PIPER_MODELS[variant_key]
    name = info["name"]
    onnx_path = PIPER_MODEL_DIR / f"{name}.onnx"
    json_path = PIPER_MODEL_DIR / f"{name}.onnx.json"
    if not onnx_path.exists():
        print(f"  Downloading Piper model {name}.onnx ...")
        urllib.request.urlretrieve(info["onnx_url"], onnx_path)
        print(f"  Downloaded {onnx_path.stat().st_size // 1024 // 1024} MB")
    else:
        print(f"  Piper model cached: {onnx_path.name}")
    if not json_path.exists():
        print(f"  Downloading Piper config {name}.onnx.json ...")
        urllib.request.urlretrieve(info["json_url"], json_path)
    return onnx_path, json_path


def generate_piper(sentence: dict, out_dir: Path, variant_key: str):
    out_file = out_dir / f"{sentence['id']:02d}_{safe_filename(sentence['text'])}.wav"
    if out_file.exists():
        print(f"  already exists: {out_file.name}")
        return out_file

    try:
        from piper import PiperVoice
        import wave
    except ImportError:
        print("  ERROR: piper-tts not installed", file=sys.stderr)
        return None

    onnx_path, json_path = download_piper_model(variant_key)
    print(f"  Synthesising with Piper ({PIPER_MODELS[variant_key]['name']})...")

    voice = PiperVoice.load(str(onnx_path), config_path=str(json_path), use_cuda=False)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    with wave.open(str(tmp_path), "wb") as wav_file:
        voice.synthesize_wav(sentence["text"], wav_file)

    to_wav_16k(tmp_path, out_file)
    tmp_path.unlink(missing_ok=True)
    return out_file


# ── edge-tts ─────────────────────────────────────────────────

async def _edge_tts_async(text: str, voice: str, out_mp3: Path):
    import edge_tts
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(out_mp3))


def generate_edge_tts(sentence: dict, out_dir: Path, voice: str):
    out_file = out_dir / f"{sentence['id']:02d}_{safe_filename(sentence['text'])}.wav"
    if out_file.exists():
        print(f"  already exists: {out_file.name}")
        return out_file

    try:
        import edge_tts
    except ImportError:
        print("  ERROR: edge-tts not installed", file=sys.stderr)
        return None

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    print(f"  Synthesising with edge-tts (voice={voice})...")
    asyncio.run(_edge_tts_async(sentence["text"], voice, tmp_path))
    to_wav_16k(tmp_path, out_file)
    tmp_path.unlink(missing_ok=True)
    return out_file


# ── gTTS ─────────────────────────────────────────────────────

def generate_gtts(sentence: dict, out_dir: Path, slow: bool = False):
    suffix = "-slow" if slow else ""
    out_file = out_dir / f"{sentence['id']:02d}_{safe_filename(sentence['text'])}.wav"
    if out_file.exists():
        print(f"  already exists: {out_file.name}")
        return out_file

    try:
        from gtts import gTTS
    except ImportError:
        print("  ERROR: gtts not installed", file=sys.stderr)
        return None

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    print(f"  Synthesising with gTTS (slow={slow})...")
    tts = gTTS(text=sentence["text"], lang="de", slow=slow)
    tts.save(str(tmp_path))
    to_wav_16k(tmp_path, out_file)
    tmp_path.unlink(missing_ok=True)
    return out_file


# ── Silero TTS ───────────────────────────────────────────────

_silero_model_cache = {}


def _load_silero_model():
    if "model" not in _silero_model_cache:
        try:
            import torch
        except ImportError:
            raise ImportError("torch not installed. Run: pip install torch --index-url https://download.pytorch.org/whl/cpu")
        model, _ = torch.hub.load(
            "snakers4/silero-models",
            model="silero_tts",
            language="de",
            speaker="v3_de",
            trust_repo=True,
        )
        _silero_model_cache["model"] = model
    return _silero_model_cache["model"]


def generate_silero(sentence: dict, out_dir: Path, speaker: str = "eva_k"):
    out_file = out_dir / f"{sentence['id']:02d}_{safe_filename(sentence['text'])}.wav"
    if out_file.exists():
        print(f"  already exists: {out_file.name}")
        return out_file

    try:
        import torch
        import scipy.io.wavfile as wavfile
        import numpy as np
    except ImportError as e:
        print(f"  ERROR: missing dependency: {e}", file=sys.stderr)
        return None

    print(f"  Synthesising with Silero TTS (speaker={speaker})...")
    model = _load_silero_model()
    sample_rate = 48000
    audio = model.apply_tts(text=sentence["text"], speaker=speaker, sample_rate=sample_rate)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    audio_np = (audio.numpy() * 32768).astype(np.int16)
    wavfile.write(str(tmp_path), sample_rate, audio_np)
    to_wav_16k(tmp_path, out_file)
    tmp_path.unlink(missing_ok=True)
    return out_file


# ── Variant registry ─────────────────────────────────────────

TTS_VARIANTS = {
    "espeak": {
        "label": "eSpeak-NG (150 wpm, standard speed)",
        "fn": lambda s, d: generate_espeak(s, d, speed=150),
    },
    "espeak-slow": {
        "label": "eSpeak-NG (100 wpm, slow)",
        "fn": lambda s, d: generate_espeak(s, d, speed=100),
    },
    "piper-thorsten": {
        "label": "Piper TTS de_DE-thorsten-high (male, neural, high quality)",
        "fn": lambda s, d: generate_piper(s, d, "piper-thorsten"),
    },
    "piper-kerstin": {
        "label": "Piper TTS de_DE-kerstin-low (female, neural)",
        "fn": lambda s, d: generate_piper(s, d, "piper-kerstin"),
    },
    "piper-ramona": {
        "label": "Piper TTS de_DE-ramona-low (female, neural)",
        "fn": lambda s, d: generate_piper(s, d, "piper-ramona"),
    },
    "edge-tts-male": {
        "label": "Microsoft Edge TTS de-DE-ConradNeural (male, online)",
        "fn": lambda s, d: generate_edge_tts(s, d, "de-DE-ConradNeural"),
    },
    "edge-tts-female": {
        "label": "Microsoft Edge TTS de-DE-KatjaNeural (female, online)",
        "fn": lambda s, d: generate_edge_tts(s, d, "de-DE-KatjaNeural"),
    },
    "gtts": {
        "label": "Google TTS via gTTS (standard speed, online)",
        "fn": lambda s, d: generate_gtts(s, d, slow=False),
    },
    "gtts-slow": {
        "label": "Google TTS via gTTS (slow mode, online)",
        "fn": lambda s, d: generate_gtts(s, d, slow=True),
    },
    "silero-eva": {
        "label": "Silero TTS v3_de speaker=eva_k (female, local neural)",
        "fn": lambda s, d: generate_silero(s, d, speaker="eva_k"),
    },
    "silero-bernd": {
        "label": "Silero TTS v3_de speaker=bernd_ungerer (male, local neural)",
        "fn": lambda s, d: generate_silero(s, d, speaker="bernd_ungerer"),
    },
    "silero-karlsson": {
        "label": "Silero TTS v3_de speaker=karlsson (male, local neural)",
        "fn": lambda s, d: generate_silero(s, d, speaker="karlsson"),
    },
}


def main():
    selected = sys.argv[1:] if len(sys.argv) > 1 else list(TTS_VARIANTS.keys())
    unknown = [v for v in selected if v not in TTS_VARIANTS]
    if unknown:
        print(f"ERROR: Unknown variants: {', '.join(unknown)}")
        print(f"Available: {', '.join(TTS_VARIANTS.keys())}")
        sys.exit(1)

    with open(SENTENCES_FILE) as f:
        data = json.load(f)
    sentences = data["sentences"]

    results = {}

    for key in selected:
        variant = TTS_VARIANTS[key]
        print(f"\n{'='*60}\nTTS: {key}\n  {variant['label']}\n{'='*60}")
        out_dir = AUDIO_DIR / key
        out_dir.mkdir(parents=True, exist_ok=True)
        files = []
        for s in sentences:
            print(f"\n  [{s['id']:02d}] {s['text']}")
            try:
                f_out = variant["fn"](s, out_dir)
                if f_out and f_out.exists():
                    files.append({"id": s["id"], "text": s["text"],
                                  "audio_file": str(f_out.relative_to(PROJECT_DIR)),
                                  "status": "ok"})
                else:
                    files.append({"id": s["id"], "text": s["text"], "status": "failed"})
            except Exception as e:
                print(f"  ERROR: {e}", file=sys.stderr)
                files.append({"id": s["id"], "text": s["text"], "status": "error", "error": str(e)})
        results[key] = {"label": variant["label"], "files": files}

    manifest_path = SCRIPT_DIR / "results" / "audio-manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    # Merge with existing manifest if present
    if manifest_path.exists():
        with open(manifest_path) as f:
            existing = json.load(f)
        existing.update(results)
        results = existing

    with open(manifest_path, "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    ok = sum(1 for v in results.values() for fi in v["files"] if fi.get("status") == "ok")
    total = sum(len(v["files"]) for v in results.values())
    print(f"\nManifest: {manifest_path}")
    print(f"Generated: {ok}/{total} OK")


if __name__ == "__main__":
    main()
