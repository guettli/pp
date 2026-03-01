#!/usr/bin/env python3
"""
Generate pre-rendered MP3 audio files for all phrases in all languages.

Uses Piper neural TTS to produce high-quality audio that is served as
static assets, eliminating the need for in-browser TTS synthesis.

Directory structure:
  static/audio/{lang}/{voice}/{md5}.mp3
  static/audio/manifest.json

Voices:
  de-DE → piper-thorsten (de_DE-thorsten-high, male, 96.5% IPA accuracy)
         piper-kerstin  (de_DE-kerstin-low, female)
  en-GB → piper-alan   (en_GB-alan-low, male)
  fr-FR → piper-siwis  (fr_FR-siwis-low, female)

Usage (inside tts venv):
  python scripts/generate-phrase-audio.py [lang ...] [--voices v1,v2]
"""

import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
import urllib.request
import wave
from pathlib import Path

import yaml

PROJECT_DIR = Path(__file__).parent.parent
STATIC_AUDIO_DIR = PROJECT_DIR / "static" / "audio"
PIPER_MODEL_DIR = Path.home() / ".cache" / "phoneme-party" / "piper-models"

# ── Piper model registry ─────────────────────────────────────────────────────

HF_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main"

PIPER_MODELS: dict[str, dict] = {
    "piper-thorsten": {
        "name": "de_DE-thorsten-high",
        "onnx_url": f"{HF_BASE}/de/de_DE/thorsten/high/de_DE-thorsten-high.onnx",
        "json_url": f"{HF_BASE}/de/de_DE/thorsten/high/de_DE-thorsten-high.onnx.json",
        "label": "Thorsten ♂ (high)",
    },
    "piper-kerstin": {
        "name": "de_DE-kerstin-low",
        "onnx_url": f"{HF_BASE}/de/de_DE/kerstin/low/de_DE-kerstin-low.onnx",
        "json_url": f"{HF_BASE}/de/de_DE/kerstin/low/de_DE-kerstin-low.onnx.json",
        "label": "Kerstin ♀ (low)",
    },
    "piper-alan": {
        "name": "en_GB-alan-low",
        "onnx_url": f"{HF_BASE}/en/en_GB/alan/low/en_GB-alan-low.onnx",
        "json_url": f"{HF_BASE}/en/en_GB/alan/low/en_GB-alan-low.onnx.json",
        "label": "Alan ♂ (low)",
    },
    "piper-amy": {
        "name": "en_GB-amy-low",
        "onnx_url": f"{HF_BASE}/en/en_GB/amy/low/en_GB-amy-low.onnx",
        "json_url": f"{HF_BASE}/en/en_GB/amy/low/en_GB-amy-low.onnx.json",
        "label": "Amy ♀ (low)",
    },
    "piper-siwis": {
        "name": "fr_FR-siwis-low",
        "onnx_url": f"{HF_BASE}/fr/fr_FR/siwis/low/fr_FR-siwis-low.onnx",
        "json_url": f"{HF_BASE}/fr/fr_FR/siwis/low/fr_FR-siwis-low.onnx.json",
        "label": "Siwis ♀ (low)",
    },
    "piper-upmc": {
        "name": "fr_FR-upmc-low",
        "onnx_url": f"{HF_BASE}/fr/fr_FR/upmc/low/fr_FR-upmc-low.onnx",
        "json_url": f"{HF_BASE}/fr/fr_FR/upmc/low/fr_FR-upmc-low.onnx.json",
        "label": "UPMC ♂ (low)",
    },
}

# Which voice(s) to use per study language
LANG_VOICES: dict[str, list[str]] = {
    "de-DE": ["piper-thorsten", "piper-kerstin"],
    "en-GB": ["piper-alan", "piper-amy"],
    "fr-FR": ["piper-siwis", "piper-upmc"],
}

# Map study language → phrase YAML file
PHRASE_FILES: dict[str, Path] = {
    "de-DE": PROJECT_DIR / "phrases-de-DE.yaml",
    "en-GB": PROJECT_DIR / "phrases-en-GB.yaml",
    "fr-FR": PROJECT_DIR / "phrases-fr-FR.yaml",
}


# ── Helpers ──────────────────────────────────────────────────────────────────


def phrase_hash(phrase: str) -> str:
    """Return a 16-char hex MD5 of the phrase (UTF-8), used as filename."""
    return hashlib.md5(phrase.encode("utf-8")).hexdigest()[:16]


def load_phrase_data(yaml_path: Path) -> list[dict]:
    with open(yaml_path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return [entry for entry in data if "phrase" in entry]


def download_piper_model(voice_key: str) -> tuple[Path, Path]:
    info = PIPER_MODELS[voice_key]
    name = info["name"]
    PIPER_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    onnx_path = PIPER_MODEL_DIR / f"{name}.onnx"
    json_path = PIPER_MODEL_DIR / f"{name}.onnx.json"

    if not onnx_path.exists():
        print(f"  Downloading {name}.onnx ...", flush=True)
        urllib.request.urlretrieve(info["onnx_url"], onnx_path)
        mb = onnx_path.stat().st_size // 1024 // 1024
        print(f"  Downloaded {mb} MB", flush=True)
    else:
        print(f"  Model cached: {onnx_path.name}", flush=True)

    if not json_path.exists():
        print(f"  Downloading {name}.onnx.json ...", flush=True)
        urllib.request.urlretrieve(info["json_url"], json_path)

    return onnx_path, json_path


def wav_to_opus(wav_path: Path, opus_path: Path) -> bool:
    """Convert WAV to 24 kbps mono Opus using ffmpeg."""
    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", str(wav_path),
            "-c:a", "libopus",
            "-b:a", "24k",
            "-ac", "1",
            str(opus_path),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode == 0


# ── Generation ───────────────────────────────────────────────────────────────


def generate_voice(
    lang: str,
    voice_key: str,
    phrase_data: list[dict],
) -> dict[str, str]:
    """
    Generate MP3 files for all phrases with the given voice.
    Returns a dict mapping phrase text → filename hash (no extension).
    """
    from piper import PiperVoice  # type: ignore[import-untyped]

    print(f"\n{'='*60}", flush=True)
    print(f"Lang: {lang}  Voice: {voice_key} ({PIPER_MODELS[voice_key]['label']})", flush=True)
    print(f"Phrases: {len(phrase_data)}", flush=True)
    print("=" * 60, flush=True)

    out_dir = STATIC_AUDIO_DIR / lang / voice_key
    out_dir.mkdir(parents=True, exist_ok=True)

    onnx_path, json_path = download_piper_model(voice_key)
    voice = PiperVoice.load(str(onnx_path), config_path=str(json_path), use_cuda=False)

    result: dict[str, str] = {}
    skipped = 0

    for i, entry in enumerate(phrase_data, 1):
        phrase = entry["phrase"]
        fhash = phrase_hash(phrase)
        out_file = out_dir / f"{fhash}.opus"

        if out_file.exists():
            result[phrase] = fhash
            skipped += 1
            continue

        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp_path = Path(tmp.name)

            with wave.open(str(tmp_path), "wb") as wav_file:
                voice.synthesize_wav(phrase, wav_file)

            if wav_to_opus(tmp_path, out_file):
                result[phrase] = fhash
            else:
                print(f"  [{i}/{len(phrase_data)}] ffmpeg failed: {phrase[:40]}", file=sys.stderr)
        except Exception as e:
            print(f"  [{i}/{len(phrase_data)}] ERROR for '{phrase[:40]}': {e}", file=sys.stderr)
        finally:
            if tmp_path.exists():
                tmp_path.unlink(missing_ok=True)

        if i % 50 == 0 or i == len(phrase_data):
            print(f"  {i}/{len(phrase_data)} done ({skipped} skipped)", flush=True)

    ok = len(result)
    print(f"  Completed: {ok}/{len(phrase_data)} OK", flush=True)
    return result


# ── Main ─────────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate phrase audio files using Piper TTS")
    parser.add_argument(
        "langs",
        nargs="*",
        choices=[*list(LANG_VOICES.keys()), []],
        help="Study languages to generate (default: all)",
    )
    parser.add_argument(
        "--voices",
        help="Comma-separated voice keys to use (e.g. piper-thorsten,piper-kerstin)",
    )
    args = parser.parse_args()

    langs = args.langs or list(LANG_VOICES.keys())
    voice_filter = set(args.voices.split(",")) if args.voices else None

    # Load existing manifest if present (allows resuming)
    manifest_path = STATIC_AUDIO_DIR / "manifest.json"
    STATIC_AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, dict[str, dict[str, str]]] = {}
    if manifest_path.exists():
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)

    for lang in langs:
        phrase_data = load_phrase_data(PHRASE_FILES[lang])
        print(f"\nLoaded {len(phrase_data)} phrases for {lang}")

        voices = LANG_VOICES[lang]
        if voice_filter:
            voices = [v for v in voices if v in voice_filter]
            if not voices:
                print(f"  No matching voices for {lang}, skipping")
                continue

        manifest.setdefault(lang, {})

        for voice_key in voices:
            voice_manifest = generate_voice(lang, voice_key, phrase_data)
            manifest[lang][voice_key] = voice_manifest

            # Write manifest after each voice so progress is saved
            with open(manifest_path, "w", encoding="utf-8") as f:
                json.dump(manifest, f, ensure_ascii=False, separators=(",", ":"))
            print(f"  Manifest updated: {manifest_path}", flush=True)

    total = sum(
        len(vm)
        for lm in manifest.values()
        for vm in lm.values()
    )
    print(f"\nDone. Total entries in manifest: {total}")
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
