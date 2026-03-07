#!/usr/bin/env python3
"""Flag blacklisted phrases in phrases-en-GB.yaml using word-boundary regex matching.

Loads blacklist.txt and checks each phrase for any blacklisted word using
case-insensitive whole-word matching (\b word boundary).

Flagged phrases get `blacklisted: true` added to the YAML — kept in the
file but excluded from the app at runtime via Phrase.blacklisted.

Run with -h for usage.
"""

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
BLACKLIST = REPO_ROOT / "blacklist.txt"
PHRASES_FILE = REPO_ROOT / "phrases-en-GB.yaml"


def load_blacklist() -> list[str]:
    words = []
    for line in BLACKLIST.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            words.append(line.lower())
    return words


def check_phrase(phrase: str, blacklist_words: list[str]) -> tuple[bool, str]:
    for word in blacklist_words:
        if re.search(rf"\b{re.escape(word)}\b", phrase, re.IGNORECASE):
            return True, f"contains blacklisted word {word!r}"
    return False, ""


def load_phrases() -> list[str]:
    return [
        m.group(1).strip()
        for line in PHRASES_FILE.read_text().splitlines()
        if (m := re.match(r"^- phrase:\s+(.+)$", line))
    ]


def load_already_flagged() -> set[str]:
    """Return set of phrase texts already marked 'blacklisted: true' in the YAML."""
    text = PHRASES_FILE.read_text()
    result: set[str] = set()
    for m in re.finditer(r"^- phrase: (.+)$", text, re.MULTILINE):
        phrase = m.group(1).strip()
        if "blacklisted: true" in text[m.end() : m.end() + 40]:
            result.add(phrase.lower())
    return result


def apply_flags(flagged: list[str]) -> None:
    text = PHRASES_FILE.read_text()
    flagged_lower = {p.lower() for p in flagged}
    applied: list[str] = []

    def replace_phrase(m: re.Match) -> str:
        phrase_text = m.group(1).strip()
        pos = m.end()
        if "blacklisted: true" in text[pos : pos + 40]:
            return m.group(0)
        if phrase_text.lower() in flagged_lower:
            applied.append(phrase_text)
            return f"- phrase: {phrase_text}\n  blacklisted: true"
        return m.group(0)

    new_text = re.sub(r"^- phrase: (.+)$", replace_phrase, text, flags=re.MULTILINE)
    PHRASES_FILE.write_text(new_text)
    print(f"\nFlagged {len(applied)} phrases in {PHRASES_FILE.name}:")
    for p in applied:
        print(f"  - {p}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Flag blacklisted phrases in phrases-en-GB.yaml using word-boundary regex.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
examples:
  %(prog)s              dry run (print flagged phrases, no changes)
  %(prog)s --apply      write 'blacklisted: true' into the YAML
        """,
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="write 'blacklisted: true' into phrases-en-GB.yaml (default: dry run)",
    )
    args = parser.parse_args()

    blacklist_words = load_blacklist()
    phrases = load_phrases()
    already_flagged = load_already_flagged()

    all_flagged: list[tuple[str, str]] = []
    for phrase in phrases:
        hit, reason = check_phrase(phrase, blacklist_words)
        if hit:
            all_flagged.append((phrase, reason))

    new_flagged = [(p, r) for p, r in all_flagged if p.lower() not in already_flagged]

    if new_flagged:
        print(f"ERROR: {len(new_flagged)} phrase(s) match the blacklist but are not flagged:")
        for phrase, reason in new_flagged:
            print(f"  - {phrase!r}  ({reason})")

    if args.apply:
        apply_flags([p for p, _ in new_flagged])
    elif new_flagged:
        print("\nRe-run with --apply to add `blacklisted: true` to flagged phrases.")
        sys.exit(1)


if __name__ == "__main__":
    main()
