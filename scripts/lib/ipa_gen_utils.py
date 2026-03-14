"""Shared utilities for IPA generation scripts."""

import os
import re
from pathlib import Path
from typing import NamedTuple

import yaml

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
IPA_ROOT = PROJECT_ROOT / "static" / "ipa"

_xdg = os.environ.get("XDG_CACHE_HOME", "")
CACHE_DIR = Path(_xdg) / "phoneme-party" if _xdg else Path.home() / ".cache" / "phoneme-party"

LANGS = ["de-DE", "en-GB", "fr-FR", "it-IT"]


def djb2hex(s: str) -> str:
    """djb2 hash, 8 lowercase hex chars — matches TS phraseToFilename."""
    h = 5381
    for b in s.encode("utf-8"):
        h = ((h * 33) + b) & 0xFFFFFFFF
    return format(h, "08x")


def phrase_to_filename(en_gb_text: str) -> str:
    """Matches the TS phraseToFilename in scripts/lib/phrase-audio-utils.ts."""
    safe = re.sub(r"[^a-zA-Z0-9]", "_", en_gb_text)
    if len(safe) <= 25:
        return safe
    return safe[:25] + "_" + djb2hex(en_gb_text)


class PhraseRow(NamedTuple):
    phrase: str  # original phrase in study lang
    en_gb: str   # en-GB translation (used for filename)
    stem: str    # filename stem


def load_phrases(study_lang: str) -> list[PhraseRow]:
    yaml_path = PROJECT_ROOT / f"phrases-{study_lang}.yaml"
    with yaml_path.open(encoding="utf-8") as f:
        entries = yaml.safe_load(f)
    rows = []
    for entry in entries:
        phrase = entry["phrase"]
        en_gb = phrase if study_lang == "en-GB" else entry.get("en-GB", phrase)
        stem = phrase_to_filename(en_gb)
        rows.append(PhraseRow(phrase=phrase, en_gb=en_gb, stem=stem))
    return rows


def ipa_path(study_lang: str, engine: str, method: str, stem: str) -> Path:
    return IPA_ROOT / study_lang / engine / method / f"{stem}.txt"


def ipa_exists(study_lang: str, engine: str, method: str, stem: str) -> bool:
    return ipa_path(study_lang, engine, method, stem).exists()


def write_ipa(study_lang: str, engine: str, method: str, stem: str, ipa: str) -> None:
    p = ipa_path(study_lang, engine, method, stem)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(ipa, encoding="utf-8")
