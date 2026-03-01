#!/usr/bin/env python3
"""Analyze detected IPAs from static/audio/ipas.json against expected IPAs.

Computes panphon feature distance between detected and expected IPA,
reports worst-performing phrases and voices.

Usage:
    python scripts/analyze-phrase-ipas.py [--top N] [--lang LANG] [--voice VOICE]
"""

import json
import re
import sys
from pathlib import Path
from statistics import mean

import panphon.distance
import yaml

_REPO_ROOT = Path(__file__).parent.parent

# Panphon distance calculator
_DIST = panphon.distance.Distance()

# Characters to strip from dictionary IPA before comparison
_STRIP_RE = re.compile(r"[ˈˌ̯ˠʰ̃̈ː̩̪̺̻ ‿.ʼ̴̰̝̞̟̠̹̤̥̬̻̪̙̘̈]")
_STRIP_CHARS = set("ˈˌ ‿.")


def _clean_ipa(ipa: str) -> str:
    """Strip stress marks, spaces, and other non-segment characters."""
    # Remove stress/tone markers and spaces
    cleaned = re.sub(r"[ˈˌ̯ˠ̃ ‿.]", "", ipa)
    return cleaned


def _panphon_similarity(ipa_a: str, ipa_b: str) -> float:
    """Return [0, 1] similarity score between two IPA strings via panphon."""
    a = _clean_ipa(ipa_a)
    b = _clean_ipa(ipa_b)
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    # hamming_feature_edit_distance_div_maxlen returns a distance in [0, 1]
    dist = _DIST.hamming_feature_edit_distance_div_maxlen(a, b)
    return max(0.0, 1.0 - dist)


def _load_expected_ipas():
    """Load {(lang, phrase) -> ipa} from phrases yaml files."""
    expected = {}
    for yaml_file in sorted(_REPO_ROOT.glob("phrases-*.yaml")):
        lang = yaml_file.stem.replace("phrases-", "")
        phrases = yaml.safe_load(yaml_file.read_text())
        for p in phrases:
            ipa_list = p.get("ipas", [])
            if ipa_list:
                ipa = ipa_list[0].get("ipa", "").strip("/")
                if ipa:
                    expected[(lang, p["phrase"])] = ipa
    return expected


def main():
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--top", type=int, default=20,
                        help="Number of worst phrases to show per voice")
    parser.add_argument("--lang", help="Filter by language (e.g. de-DE)")
    parser.add_argument("--voice", help="Filter by voice name")
    args = parser.parse_args()

    ipas_file = _REPO_ROOT / "static" / "audio" / "ipas.json"
    if not ipas_file.exists():
        print("ERROR: static/audio/ipas.json not found. Run detect-phrase-ipas.py first.")
        sys.exit(1)

    detected = json.loads(ipas_file.read_text())
    expected = _load_expected_ipas()

    # Compute scores
    voice_scores: dict[str, list[float]] = {}
    phrase_scores: dict[str, list[float]] = {}  # (lang, phrase) → scores across all voices
    worst_per_voice: dict[str, list[tuple[float, str, str, str]]] = {}

    total = sum(len(v) for lang_d in detected.values() for v in lang_d.values())
    done = 0

    for lang, voices in sorted(detected.items()):
        if args.lang and lang != args.lang:
            continue
        for voice, phrases in sorted(voices.items()):
            if args.voice and voice != args.voice:
                continue
            key = f"{lang}/{voice}"
            voice_scores[key] = []
            worst_per_voice[key] = []

            for phrase, det_ipa in phrases.items():
                exp_ipa = expected.get((lang, phrase), "")
                if not exp_ipa:
                    continue
                score = _panphon_similarity(det_ipa, exp_ipa)
                voice_scores[key].append(score)

                phrase_key = f"{lang}/{phrase}"
                phrase_scores.setdefault(phrase_key, []).append(score)
                worst_per_voice[key].append((score, phrase, det_ipa, exp_ipa))

                done += 1
                if done % 500 == 0:
                    print(f"  scoring {done}/{total}...", flush=True, file=sys.stderr)

            worst_per_voice[key].sort()  # ascending = worst first

    # --- Report ---
    print("=" * 70)
    print("VOICE SUMMARY (avg panphon similarity, higher = better)")
    print("=" * 70)
    for key, scores in sorted(voice_scores.items(), key=lambda x: mean(x[1]) if x[1] else 0):
        if scores:
            avg = mean(scores)
            low = sum(1 for s in scores if s < 0.5)
            print(f"  {key:<35} avg={avg:.3f}  low(<0.5): {low}/{len(scores)}")

    print()
    print("=" * 70)
    print(f"WORST {args.top} PHRASES PER VOICE")
    print("=" * 70)
    for key, worst in sorted(worst_per_voice.items()):
        print(f"\n--- {key} ---")
        for score, phrase, det, exp in worst[: args.top]:
            print(f"  {score:.2f}  {phrase:<25} detected={det}  expected={_clean_ipa(exp)}")

    # Phrases consistently bad across all voices
    print()
    print("=" * 70)
    print("CONSISTENTLY POORLY DETECTED PHRASES (avg across all voices < 0.4)")
    print("=" * 70)
    consistently_bad = [
        (mean(scores), key)
        for key, scores in phrase_scores.items()
        if scores and mean(scores) < 0.4
    ]
    consistently_bad.sort()
    for avg, key in consistently_bad[:30]:
        lang, phrase = key.split("/", 1)
        exp = _clean_ipa(expected.get((lang, phrase), ""))
        print(f"  {avg:.2f}  {phrase:<30} expected={exp}")


if __name__ == "__main__":
    main()
