#!/usr/bin/env python3
"""
Update difficulty entries in phrases-*.yaml files using phrase_difficulty analyzer

Usage:
    python update-difficulty.py phrases-de-DE.yaml              # Update missing difficulties only
    python update-difficulty.py phrases-de-DE.yaml --update-all # Recalculate all difficulties
    python update-difficulty.py phrases-de-DE.yaml --list       # List phrases sorted by difficulty
"""

import argparse
import sys
import re
from pathlib import Path
import yaml
from concurrent.futures import ThreadPoolExecutor
import time

# Import the analyzer from phrase_difficulty.py
from phrase_difficulty import PhraseDifficultyAnalyzer


def score_to_level(score: float, lang: str) -> int:
    """Convert difficulty score to level (1-1000) using per-language mapping."""
    # Score ranges determined from actual data
    score_ranges = {
        "en-GB": {"min": 16.8, "max": 48.3},
        "de-DE": {"min": 22.8, "max": 66.0},
        "fr-FR": {"min": 41.7, "max": 66.4},
    }

    if lang not in score_ranges:
        # Fallback for unsupported languages
        return max(1, min(1000, round(score * 10)))

    min_score = score_ranges[lang]["min"]
    max_score = score_ranges[lang]["max"]

    # Linear mapping: score range -> 1-1000
    # Formula: level = round((score - min) / (max - min) * 999) + 1
    normalized = (score - min_score) / (max_score - min_score)
    level = round(normalized * 999) + 1

    # Clamp to 1-1000 range
    return max(1, min(1000, level))


# Global analyzer instance (initialized once and reused)
_analyzer_instance = None

def get_analyzer():
    """Get or create the global analyzer instance."""
    global _analyzer_instance
    if _analyzer_instance is None:
        _analyzer_instance = PhraseDifficultyAnalyzer()
    return _analyzer_instance


def calculate_phrase_difficulty(args):
    """Worker function to calculate difficulty for a single phrase."""
    phrase, lang = args
    try:
        # Reuse global analyzer instance instead of creating new one
        analyzer = get_analyzer()

        result = analyzer.analyze_phrase(phrase, lang)

        score = result["difficulty_score"]
        level = score_to_level(score, lang)

        return {
            "phrase": phrase,
            "score": score,
            "level": level,
            "level_text": result["difficulty_level"],
            "avg_aoa": result.get("avg_aoa"),
            "word_count": result["word_count"],
            "avg_word_length": result["avg_word_length"],
            "total_syllables": result.get("total_syllables"),
            "phoneme_complexity": result.get("phoneme_complexity"),
            "word_details": result.get("word_details", []),
            "score_components": result.get("score_components", {}),
            "success": True
        }
    except Exception as e:
        return {
            "phrase": phrase,
            "success": False,
            "error": str(e)
        }


def main():
    parser = argparse.ArgumentParser(
        description="Update difficulty scores in phrases YAML files"
    )
    parser.add_argument("file", help="Path to phrases-{lang}.yaml file")
    parser.add_argument(
        "--update-all",
        action="store_true",
        help="Recalculate all difficulty scores (not just missing ones)",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List all phrases sorted by difficulty (lowest to highest)",
    )
    parser.add_argument(
        "--phrase",
        type=str,
        help="Update only a specific phrase (e.g., 'Katze')",
    )
    parser.add_argument(
        "--profile",
        action="store_true",
        help="Enable profiling to measure performance",
    )
    parser.add_argument(
        "--calibrate",
        action="store_true",
        help="Analyze all phrases and report min/max scores (without writing to file)",
    )

    args = parser.parse_args()
    file_path = Path(args.file)

    if not file_path.exists():
        print(f"Error: File not found: {file_path}", file=sys.stderr)
        sys.exit(1)

    # Extract language from filename (e.g., phrases-de-DE.yaml -> de-DE)
    basename = file_path.name
    lang_match = re.search(r"phrases-([a-zA-Z-]+)\.yaml", basename)
    if not lang_match:
        print("Error: Could not determine language from filename", file=sys.stderr)
        print("Expected format: phrases-{lang}.yaml", file=sys.stderr)
        sys.exit(1)

    lang = lang_match.group(1)

    # Validate language is supported
    supported_languages = ["de-DE", "en-GB", "fr-FR"]
    if lang not in supported_languages:
        print(
            f"Error: Language '{lang}' not supported. Supported: {supported_languages}",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"📖 Reading {file_path}...")

    # Load YAML file
    with open(file_path, "r", encoding="utf-8") as f:
        phrases = yaml.safe_load(f)

    if not isinstance(phrases, list):
        print("Error: Invalid YAML format - expected list of entries", file=sys.stderr)
        sys.exit(1)

    # Handle --list mode: use existing difficulty scores from YAML
    if args.list:
        print(f"\n📊 Listing {len(phrases)} phrases by difficulty...\n")

        # Extract existing level data from entries
        phrase_results = []
        for entry in phrases:
            phrase_text = entry.get("phrase", "")

            # Check for new format (level)
            if "level" in entry and isinstance(entry["level"], (int, float)):
                phrase_results.append({
                    "phrase": phrase_text,
                    "level": entry["level"],
                    "success": True,
                })
            # Check for old format (difficulty.score)
            elif "difficulty" in entry:
                difficulty = entry.get("difficulty", {})
                if isinstance(difficulty, dict) and "score" in difficulty:
                    # Convert old score to level for display
                    score = difficulty.get("score", 0)
                    level = score_to_level(score, lang)
                    phrase_results.append({
                        "phrase": phrase_text,
                        "level": level,
                        "success": True,
                    })
            else:
                # Skip phrases without difficulty data
                print(f"⚠️  No level data for: {phrase_text}", file=sys.stderr)

        # Sort by level (ascending)
        sorted_results = sorted(phrase_results, key=lambda p: p["level"])

        print(f"{'='*70}")
        print(f"Phrases sorted by level (total: {len(sorted_results)})")
        print(f"{'='*70}\n")

        for result in sorted_results:
            level = result["level"]
            phrase = result["phrase"]

            print(f"{level:4d} {phrase}")

        sys.exit(0)

    # Handle --calibrate mode: analyze all phrases, report min/max scores
    if args.calibrate:
        print(f"\n📐 Calibrating score ranges for {lang} ({len(phrases)} phrases)...\n")
        phrase_args = [(entry.get("phrase", ""), lang) for entry in phrases]
        num_workers = min(8, len(phrase_args))
        with ThreadPoolExecutor(max_workers=num_workers) as executor:
            results = list(executor.map(lambda a: calculate_phrase_difficulty(a), phrase_args))
        scores = [r["score"] for r in results if r.get("success")]
        if not scores:
            print("❌ No scores could be calculated")
            sys.exit(1)
        min_score = min(scores)
        max_score = max(scores)
        p5 = sorted(scores)[int(len(scores) * 0.05)]
        p95 = sorted(scores)[int(len(scores) * 0.95)]
        print(f"  Min score : {min_score:.1f}")
        print(f"  Max score : {max_score:.1f}")
        print(f"  5th pctile: {p5:.1f}")
        print(f"  95th pctile:{p95:.1f}")
        print(f"\n💡 Recommendation: add to score_ranges:")
        print(f'    "{lang}": {{"min": {p5:.1f}, "max": {p95:.1f}}},')
        sys.exit(0)

    # Determine which entries to update
    if args.phrase:
        # Update only the specified phrase
        matching = [p for p in phrases if p.get("phrase") == args.phrase]
        if not matching:
            print(f"❌ Phrase not found: {args.phrase}")
            sys.exit(1)
        entries_to_update = matching
        print(f"\n🔄 Updating phrase: {args.phrase}\n")
    elif args.update_all:
        print(f"\n🔄 Updating ALL {len(phrases)} entries...\n")
        entries_to_update = phrases
    else:
        # Find entries with missing level data
        entries_to_update = [p for p in phrases if "level" not in p]

        if len(entries_to_update) == 0:
            print("✅ All entries have level data!")
            print("💡 Use --update-all to recalculate all levels")
            sys.exit(0)

        print(f"\n🔍 Found {len(entries_to_update)} entries with missing level:\n")

    # Initialize threading
    num_workers = min(8, len(entries_to_update))  # Limit to 8 threads max
    print(f"Processing {len(entries_to_update)} phrases using {num_workers} threads...")

    # Prepare arguments for parallel processing
    phrase_args = [(entry.get("phrase", ""), lang) for entry in entries_to_update]

    # Profile if requested
    start_time = time.time() if args.profile else None

    # Process in parallel using thread pool
    with ThreadPoolExecutor(max_workers=num_workers) as executor:
        results = list(executor.map(lambda args: calculate_phrase_difficulty(args), phrase_args))

    if args.profile:
        elapsed = time.time() - start_time
        print(f"\n⏱️  Processing took {elapsed:.2f}s ({elapsed/len(entries_to_update):.3f}s per phrase)")

    # Display results and collect updates
    updates = []
    for result in results:
        phrase = result["phrase"]
        if result.get("success"):
            level = result["level"]
            level_text = result.get("level_text", "")
            print(f'  ✓ "{phrase}": Level {level}/1000 ({level_text})')
            updates.append({
                "phrase": phrase,
                "level": level,
            })
        else:
            print(f'  ✗ "{phrase}": {result.get("error")}')

    if len(updates) == 0:
        print("❌ Could not calculate difficulty for any entries")
        sys.exit(1)

    # Display results summary
    print(f"\n{'=' * 60}")
    print(f"Calculated levels for {len(updates)}/{len(entries_to_update)} entries\n")

    # Update the phrases array
    print("✍️  Updating file...")

    for update in updates:
        entry = next((p for p in phrases if p.get("phrase") == update["phrase"]), None)
        if entry:
            # Remove old difficulty field if it exists
            if "difficulty" in entry:
                del entry["difficulty"]
            # Set new level field
            entry["level"] = update["level"]

    # Write back to file
    with open(file_path, "w", encoding="utf-8") as f:
        yaml.dump(
            phrases,
            f,
            default_flow_style=False,
            allow_unicode=True,
            sort_keys=False,
            width=100,
        )

    print(f"✅ Updated {file_path} with {len(updates)} level entries")


if __name__ == "__main__":
    main()
