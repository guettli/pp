#!/usr/bin/env python3
"""
Generate missing phrase translations for de-DE, fr-FR, and it-IT.

For every en-GB phrase that lacks a translation in a given language:
  1. Translate the phrase using Google Translate (deep_translator).
  2. Generate IPA using espeak-ng.
  3. Append the new phrase entry to the corresponding phrases-*.yaml file.

Usage:
  python scripts/generate-missing-phrases.py [--lang de-DE] [--dry-run]
"""

import argparse
import subprocess
import sys
import time
from pathlib import Path

import yaml
from deep_translator import GoogleTranslator

ROOT = Path(__file__).parent.parent

LANG_CONFIG = {
    "de-DE": {"google-translate": "de", "espeak": "de"},
    "fr-FR": {"google-translate": "fr", "espeak": "fr"},
    "it-IT": {"google-translate": "it", "espeak": "it"},
}


def get_ipa(text: str, espeak_lang: str) -> str:
    """Return espeak-ng IPA for text in given language, wrapped in /…/."""
    import re

    result = subprocess.run(
        ["espeak-ng", "-v", espeak_lang, "-q", "--ipa", text],
        capture_output=True,
        text=True,
    )
    ipa = result.stdout.strip()
    # Collapse multi-line output
    ipa = ipa.replace("\n", " ").strip()
    # Strip language markers embedded by espeak-ng, e.g. (en), (de), (fr-FR)
    ipa = re.sub(r"\([a-z]{2}(?:-[A-Z]{2})?\)", "", ipa).strip()
    if ipa and not ipa.startswith("/"):
        ipa = f"/{ipa}/"
    return ipa


def load_yaml(path: Path):
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or []


def append_phrase_yaml(path: Path, entry: dict) -> None:
    """Append a single phrase YAML block to the file."""
    with open(path, "a", encoding="utf-8") as f:
        f.write(f"- phrase: {entry['phrase']}\n")
        if entry.get("emoji"):
            f.write(f"  emoji: {entry['emoji']}\n")
        f.write("  ipas:\n")
        f.write(f"    - ipa: {entry['ipa']}\n")
        f.write(f"      category: standard\n")
        f.write(f"  level: {entry['level']}\n")
        f.write(f"  en-GB: {entry['en_gb']}\n")


def main():
    parser = argparse.ArgumentParser(description="Generate missing phrase translations")
    parser.add_argument("--lang", choices=list(LANG_CONFIG.keys()), help="Only process this language")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be added, do not write")
    args = parser.parse_args()

    langs = [args.lang] if args.lang else list(LANG_CONFIG.keys())

    en_phrases = load_yaml(ROOT / "phrases-en-GB.yaml")
    en_keys = {p["phrase"] for p in en_phrases}
    en_by_phrase = {p["phrase"]: p for p in en_phrases}

    for lang in langs:
        cfg = LANG_CONFIG[lang]
        target_path = ROOT / f"phrases-{lang}.yaml"
        existing = load_yaml(target_path)
        existing_en_keys = {p["en-GB"] for p in existing if p.get("en-GB")}

        missing = [p for p in en_phrases if p["phrase"] not in existing_en_keys]
        print(f"\n{lang}: {len(missing)} phrases to add")

        if not missing:
            print(f"  Nothing to do for {lang}.")
            continue

        translator = GoogleTranslator(source="en", target=cfg["google-translate"])

        for i, en_phrase in enumerate(missing):
            en_text = en_phrase["phrase"]
            emoji = en_phrase.get("emoji", "")
            level = en_phrase.get("level", 100)

            # Translate
            try:
                translated = translator.translate(en_text)
            except Exception as e:
                print(f"  [{i+1}/{len(missing)}] SKIP '{en_text}': translation error: {e}")
                continue

            if not translated or translated.lower() == en_text.lower():
                # If translation is same as English (e.g. international words), still add it
                pass

            # Get IPA
            ipa = get_ipa(translated, cfg["espeak"])
            if not ipa:
                print(f"  [{i+1}/{len(missing)}] SKIP '{en_text}': no IPA for '{translated}'")
                continue

            entry = {
                "phrase": translated,
                "emoji": emoji,
                "ipa": ipa,
                "level": level,
                "en_gb": en_text,
            }

            if args.dry_run:
                print(f"  [{i+1}/{len(missing)}] '{en_text}' → '{translated}' {ipa}")
            else:
                append_phrase_yaml(target_path, entry)
                if (i + 1) % 50 == 0:
                    print(f"  [{i+1}/{len(missing)}] added '{en_text}' → '{translated}'")
                # Small pause to avoid rate limiting
                time.sleep(0.05)

        if not args.dry_run:
            print(f"  Done. Added {len(missing)} phrases to {target_path.name}")


if __name__ == "__main__":
    main()
