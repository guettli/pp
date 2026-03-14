#!/usr/bin/env python3
"""
Generate IPA from English Wiktionary for all 4 languages.

For phrases: each word is looked up individually; IPA for each pronunciation
variant is concatenated word-by-word.

Output: static/ipa/{lang}/wiktionary/pron-{N}/{stem}.txt
  pron-0 = first pronunciation of each word
  pron-1 = second pronunciation (only written if it differs from pron-0)

Cache: ~/.cache/phoneme-party/wiktionary/{lang}/{word_lower}.json

Usage: uv run python scripts/generate-ipa-wiktionary.py [lang]
  lang: optional, e.g. de-DE (defaults to all languages)
"""

import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import requests
from bs4 import BeautifulSoup
from lib.ipa_gen_utils import CACHE_DIR, LANGS, load_phrases, write_ipa, ipa_exists

# Language section heading on en.wiktionary.org
LANG_HEADING: dict[str, str] = {
    "de-DE": "German",
    "en-GB": "English",
    "fr-FR": "French",
    "it-IT": "Italian",
}

SESSION = requests.Session()
SESSION.headers["User-Agent"] = "phoneme-party/0.1 (https://github.com/; research)"

# Wiktionary cache root: ~/.cache/phoneme-party/wiktionary/{lang}/{word}.json
# Stores a list of IPA strings (may be empty if word not found).
WIKT_CACHE = CACHE_DIR / "wiktionary"

_last_request_time: float = 0.0
_BASE_DELAY = 0.1  # seconds between requests when not rate-limited


def _get_cache_path(study_lang: str, word: str) -> Path:
    safe = re.sub(r"[^a-zA-Z0-9À-ÿ_-]", "_", word)
    return WIKT_CACHE / study_lang / f"{safe}.json"


def _load_cache(study_lang: str, word: str) -> list[str] | None:
    p = _get_cache_path(study_lang, word)
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return None


def _save_cache(study_lang: str, word: str, ipas: list[str]) -> None:
    p = _get_cache_path(study_lang, word)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(ipas, ensure_ascii=False), encoding="utf-8")


def _fetch_wiktionary_html(word: str) -> str | None:
    """Fetch raw HTML for a Wiktionary page, with retry/back-off on 429."""
    global _last_request_time

    url = f"https://en.wiktionary.org/wiki/{word}"
    max_retries = 6
    delay = _BASE_DELAY

    for attempt in range(max_retries):
        # Polite delay
        elapsed = time.time() - _last_request_time
        if elapsed < delay:
            time.sleep(delay - elapsed)

        try:
            resp = SESSION.get(url, timeout=30)
            _last_request_time = time.time()
        except requests.RequestException as e:
            print(f"  network error for {word!r}: {e}", file=sys.stderr)
            time.sleep(delay)
            delay *= 2
            continue

        if resp.status_code == 200:
            return resp.text
        if resp.status_code == 404:
            return None  # word not in Wiktionary
        if resp.status_code == 429:
            retry_after = int(resp.headers.get("Retry-After", str(int(delay * 4))))
            print(f"  rate limited — waiting {retry_after}s", file=sys.stderr)
            time.sleep(retry_after)
            delay = max(delay * 2, 5.0)
            continue

        print(f"  HTTP {resp.status_code} for {word!r}", file=sys.stderr)
        time.sleep(delay)
        delay *= 2

    return None


def _parse_ipas(html: str, lang_heading: str) -> list[str]:
    """Extract IPA strings from the given language section of a Wiktionary HTML page."""
    soup = BeautifulSoup(html, "html.parser")

    # Find the language section start element.
    # Modern Wiktionary wraps h2 in: <div class="mw-heading mw-heading2"><h2 id="German">...
    # Older Wiktionary: <h2><span class="mw-headline" id="German">...
    section_start = None
    for h2 in soup.find_all("h2"):
        # Modern: id on the h2 itself
        if h2.get("id") == lang_heading:
            # Use the wrapper div if it exists, else the h2 itself
            parent = h2.parent
            if parent and "mw-heading" in " ".join(parent.get("class") or []):
                section_start = parent
            else:
                section_start = h2
            break
        # Older: mw-headline span
        headline = h2.find("span", class_="mw-headline")
        if headline and headline.get_text().strip() == lang_heading:
            section_start = h2
            break

    if section_start is None:
        return []

    # Collect IPA spans from siblings until the next language-level heading
    ipas: list[str] = []
    seen: set[str] = set()
    for sibling in section_start.next_siblings:
        tag = getattr(sibling, "name", None)
        if not tag:
            continue
        # Stop at next language section (another mw-heading2 div or h2)
        if tag == "h2":
            break
        classes = " ".join(sibling.get("class") or [])
        if tag == "div" and "mw-heading2" in classes:
            break
        if hasattr(sibling, "find_all"):
            for span in sibling.find_all("span", class_="IPA"):
                text = span.get_text().strip()
                if text and text not in seen:
                    seen.add(text)
                    ipas.append(text)

    return ipas


def lookup_word(word: str, study_lang: str) -> list[str]:
    """Return a list of IPA strings for a word; uses cache."""
    cached = _load_cache(study_lang, word)
    if cached is not None:
        return cached

    lang_heading = LANG_HEADING[study_lang]
    html = _fetch_wiktionary_html(word)
    if html is None:
        _save_cache(study_lang, word, [])
        return []

    ipas = _parse_ipas(html, lang_heading)
    _save_cache(study_lang, word, ipas)
    return ipas


def _split_phrase(phrase: str) -> list[str]:
    """Split phrase into words (strip punctuation tokens)."""
    return [w for w in re.split(r"[\s\-]+", phrase) if re.search(r"\w", w)]


def phrase_ipas(phrase: str, study_lang: str) -> tuple[str | None, str | None]:
    """
    Return (pron0_ipa, pron1_ipa) for a phrase.
    Each is a space-joined concatenation of per-word pronunciations.
    pron1 is None if it equals pron0.
    """
    words = _split_phrase(phrase)
    word_prons: list[list[str]] = []

    for word in words:
        prons = lookup_word(word, study_lang)
        # Strip enclosing slashes/brackets for storage — keep them as-is
        word_prons.append(prons)

    if not word_prons:
        return None, None

    def combine(variant: int) -> str:
        parts = []
        for prons in word_prons:
            if not prons:
                continue
            p = prons[min(variant, len(prons) - 1)]
            # Strip outer / or [] delimiters for cleaner concatenation
            p = p.strip("/[]")
            if p:
                parts.append(p)
        return " ".join(parts)

    pron0 = combine(0)
    pron1 = combine(1)

    if not pron0:
        return None, None

    return pron0, (pron1 if pron1 != pron0 else None)


def main() -> None:
    target_lang = sys.argv[1] if len(sys.argv) > 1 else None
    langs = [target_lang] if target_lang else LANGS

    for study_lang in langs:
        if study_lang not in LANG_HEADING:
            print(f"Unknown lang: {study_lang}", file=sys.stderr)
            sys.exit(1)

        print(f"\n[{study_lang}] wiktionary (lang heading: {LANG_HEADING[study_lang]})")
        phrases = load_phrases(study_lang)
        ok0 = 0
        ok1 = 0
        skip = 0

        for i, row in enumerate(phrases):
            if ipa_exists(study_lang, "wiktionary", "pron-0", row.stem):
                ok0 += 1
                continue
            pron0, pron1 = phrase_ipas(row.phrase, study_lang)

            if pron0 is None:
                skip += 1
                continue

            write_ipa(study_lang, "wiktionary", "pron-0", row.stem, pron0)
            ok0 += 1

            if pron1 is not None:
                write_ipa(study_lang, "wiktionary", "pron-1", row.stem, pron1)
                ok1 += 1

            if (i + 1) % 50 == 0:
                print(f"  {i + 1}/{len(phrases)} phrases processed …")

        print(f"  pron-0: {ok0}, pron-1: {ok1}, skipped: {skip}")


if __name__ == "__main__":
    main()
