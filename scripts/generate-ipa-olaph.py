#!/usr/bin/env python3
"""
Generate IPA using OLaPh for de-DE, en-GB, fr-FR (Italian not supported).
Output: static/ipa/{lang}/olaph/default/{stem}.txt

Usage: uv run python scripts/generate-ipa-olaph.py [lang]
  lang: optional, e.g. de-DE (defaults to de-DE en-GB fr-FR)

Install requirements:
  uv add olaph
  uv run python -m spacy download de_core_news_sm
  uv run python -m spacy download en_core_web_sm
  uv run python -m spacy download fr_core_news_sm
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from olaph import Olaph
from lib.ipa_gen_utils import load_phrases, write_ipa, ipa_exists

SUPPORTED_LANGS = ["de-DE", "en-GB", "fr-FR", "es-ES"]

OLAPH_LANG: dict[str, str] = {
    "de-DE": "de",
    "en-GB": "en",
    "fr-FR": "fr",
    "es-ES": "es",
}


def main() -> None:
    target_lang = sys.argv[1] if len(sys.argv) > 1 else None

    if target_lang:
        if target_lang not in OLAPH_LANG:
            print(f"OLaPh does not support lang: {target_lang}", file=sys.stderr)
            sys.exit(1)
        langs = [target_lang]
    else:
        langs = SUPPORTED_LANGS

    phonemizer = Olaph()

    for study_lang in langs:
        olaph_lang = OLAPH_LANG[study_lang]
        print(f"\n[{study_lang}] olaph lang={olaph_lang}")
        phrases = load_phrases(study_lang)
        ok = 0
        skip = 0

        for i, row in enumerate(phrases):
            if ipa_exists(study_lang, "olaph", "default", row.stem):
                ok += 1
                continue
            try:
                ipa = phonemizer.phonemize_text(row.phrase, lang=olaph_lang)
            except Exception as e:
                print(f"  SKIP {row.phrase!r}: {e}")
                skip += 1
                continue

            if not ipa or not ipa.strip():
                skip += 1
                continue

            write_ipa(study_lang, "olaph", "default", row.stem, ipa.strip())
            ok += 1

            if (i + 1) % 50 == 0:
                print(f"  {i + 1}/{len(phrases)} phrases processed …")

        print(f"  wrote {ok}, skipped {skip}")


if __name__ == "__main__":
    main()
