#!/usr/bin/env python3
"""
Update difficulty entries in phrases-*.yaml files using phrase_difficulty analyzer

Usage:
    python update-difficulty.py phrases-de.yaml              # Update missing difficulties only
    python update-difficulty.py phrases-de.yaml --update-all # Recalculate all difficulties
    python update-difficulty.py phrases-de.yaml --list       # List phrases sorted by difficulty
"""

import argparse
import sys
import re
import os
from pathlib import Path
import yaml
from multiprocessing import Pool, cpu_count

# Import the analyzer from phrase_difficulty.py
from phrase_difficulty import PhraseDifficultyAnalyzer


def score_to_level(score: float, lang: str) -> int:
    """Convert difficulty score to level (1-1000) using per-language mapping."""
    # Score ranges determined from actual data
    score_ranges = {
        "en": {"min": 16.8, "max": 48.3},
        "de": {"min": 22.8, "max": 66.0},
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


def calculate_phrase_difficulty(args):
    """Worker function to calculate difficulty for a single phrase."""
    phrase, lang = args
    try:
        # Each process needs its own analyzer instance
        analyzer = PhraseDifficultyAnalyzer()

        # Suppress stderr
        old_stderr = sys.stderr
        sys.stderr = open(os.devnull, "w")

        try:
            result = analyzer.analyze_phrase(phrase, lang)
        finally:
            sys.stderr.close()
            sys.stderr = old_stderr

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

    args = parser.parse_args()
    file_path = Path(args.file)

    if not file_path.exists():
        print(f"Error: File not found: {file_path}", file=sys.stderr)
        sys.exit(1)

    # Extract language from filename (e.g., phrases-de.yaml -> de)
    basename = file_path.name
    lang_match = re.search(r"phrases-([a-z]+)\.yaml", basename)
    if not lang_match:
        print("Error: Could not determine language from filename", file=sys.stderr)
        print("Expected format: phrases-{lang}.yaml", file=sys.stderr)
        sys.exit(1)

    lang = lang_match.group(1)

    # Validate language is supported
    supported_languages = ["de", "en"]
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

    # Determine which entries to update
    if args.update_all:
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

    # Initialize analyzer
    num_cores = cpu_count()
    print(f"Processing {len(entries_to_update)} phrases using {num_cores} CPU cores...")

    # Prepare arguments for parallel processing
    phrase_args = [(entry.get("phrase", ""), lang) for entry in entries_to_update]

    # Process in parallel using all CPU cores
    with Pool(processes=num_cores) as pool:
        results = pool.map(calculate_phrase_difficulty, phrase_args)

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
