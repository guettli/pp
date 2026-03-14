#!/usr/bin/env python3
"""
Bootstrap phrases-{lang}.yaml files by translating en-GB phrases via Google Translate.

Only use this to create a new language file from scratch. Existing files are NOT
overwritten unless --force is given.

After running, review the output for translation quality, then fix any duplicates
reported at the end and run the IPA + audio generation scripts.

Usage:
  uv run python scripts/generate-translated-phrases.py de-DE
  uv run python scripts/generate-translated-phrases.py de-DE fr-FR it-IT es-ES
  uv run python scripts/generate-translated-phrases.py --all          # all supported langs
  uv run python scripts/generate-translated-phrases.py es-ES --force  # overwrite existing
"""

import argparse
import sys
import time
from collections import Counter
from pathlib import Path

import yaml
from deep_translator import GoogleTranslator

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Maps study-language BCP-47 tag → Google Translate target-language code
LANG_TO_GOOGLE: dict[str, str] = {
    "de-DE": "de",
    "fr-FR": "fr",
    "it-IT": "it",
    "es-ES": "es",
}


def translate_lang(lang: str, force: bool) -> bool:
    """Translate all en-GB phrases into *lang* and write phrases-{lang}.yaml.
    Returns True on success, False if skipped or on error."""
    google_lang = LANG_TO_GOOGLE[lang]
    out_path = PROJECT_ROOT / f"phrases-{lang}.yaml"

    if out_path.exists() and not force:
        print(f"[{lang}] {out_path.name} already exists — skipping (use --force to overwrite)")
        return False

    en_path = PROJECT_ROOT / "phrases-en-GB.yaml"
    en_phrases: list[dict] = yaml.safe_load(en_path.read_text(encoding="utf-8"))

    translator = GoogleTranslator(source="en", target=google_lang)
    translated: list[dict] = []
    errors = 0

    for i, entry in enumerate(en_phrases):
        phrase_en: str = entry["phrase"]
        try:
            phrase_tgt = translator.translate(phrase_en)
            if not phrase_tgt:
                raise ValueError("empty translation")
        except Exception as e:
            print(f"  WARN {phrase_en!r}: {e} — keeping English text", file=sys.stderr)
            phrase_tgt = phrase_en
            errors += 1

        translated.append({
            "phrase": phrase_tgt,
            "emoji": entry["emoji"],
            "ipas": [],
            "level": entry.get("level", 500),
            "en-GB": phrase_en,
        })

        if (i + 1) % 50 == 0:
            print(f"  [{lang}] {i + 1}/{len(en_phrases)} translated …")
            time.sleep(0.5)  # avoid rate-limiting

    # Report duplicates so the user can fix them manually before running IPA/audio
    counts = Counter(p["phrase"] for p in translated)
    dupes = sorted(ph for ph, cnt in counts.items() if cnt > 1)
    if dupes:
        print(f"\n[{lang}] WARNING: {len(dupes)} duplicate translation(s) found — fix manually:")
        for dupe in dupes:
            originals = [p["en-GB"] for p in translated if p["phrase"] == dupe]
            print(f"  {dupe!r} ← {originals}")

    out_path.write_text(
        yaml.dump(translated, allow_unicode=True, default_flow_style=False, sort_keys=False),
        encoding="utf-8",
    )
    print(f"[{lang}] wrote {len(translated)} entries to {out_path.name}"
          + (f" ({errors} fallback(s))" if errors else "")
          + (f" — FIX {len(dupes)} DUPLICATE(S)" if dupes else ""))
    return True


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Bootstrap phrases-{lang}.yaml by translating en-GB phrases."
    )
    parser.add_argument(
        "langs",
        nargs="*",
        metavar="LANG",
        help=f"language(s) to generate, e.g. es-ES de-DE (choices: {', '.join(LANG_TO_GOOGLE)})",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="generate all supported languages",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="overwrite existing phrase files",
    )
    args = parser.parse_args()

    langs = list(LANG_TO_GOOGLE) if args.all else args.langs
    if not langs:
        parser.error("specify at least one LANG or use --all")

    unknown = [l for l in langs if l not in LANG_TO_GOOGLE]
    if unknown:
        parser.error(f"unsupported language(s): {', '.join(unknown)}. "
                     f"Supported: {', '.join(LANG_TO_GOOGLE)}")

    ok = 0
    for lang in langs:
        if translate_lang(lang, args.force):
            ok += 1

    if ok:
        print(f"\nNext steps:")
        print(f"  1. Fix any duplicate phrases listed above")
        print(f"  2. uv run python scripts/generate-ipa-olaph.py [lang]")
        print(f"  3. ./run tsx scripts/update-ipa-in-phrases-yaml-files.ts [lang]")
        print(f"  4. uv run python scripts/generate_edge_tts_audio.py create")


if __name__ == "__main__":
    main()
