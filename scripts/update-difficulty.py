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

        return {
            "phrase": phrase,
            "score": result["difficulty_score"],
            "level": result["difficulty_level"],
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

    # Handle --list mode: recalculate and display phrases sorted by difficulty
    if args.list:
        num_cores = cpu_count()
        print(f"\n🔄 Recalculating difficulty for all {len(phrases)} entries using {num_cores} cores...\n")

        # Prepare arguments for parallel processing
        phrase_args = [(entry.get("phrase", ""), lang) for entry in phrases]

        # Process in parallel using all CPU cores
        with Pool(processes=num_cores) as pool:
            phrase_results = pool.map(calculate_phrase_difficulty, phrase_args)

        # Filter out errors and report them
        successful_results = []
        for result in phrase_results:
            if result.get("success"):
                successful_results.append(result)
            else:
                print(f"⚠️  Error calculating {result['phrase']}: {result.get('error')}", file=sys.stderr)

        phrase_results = successful_results

        # Sort by difficulty score (ascending)
        sorted_results = sorted(phrase_results, key=lambda p: p["score"])

        print(f"{'='*70}")
        print(f"Phrases sorted by difficulty (total: {len(sorted_results)})")
        print(f"{'='*70}\n")

        for i, result in enumerate(sorted_results, 1):
            score = result["score"]
            phrase = result["phrase"]
            level = result["level"]
            avg_aoa = result.get("avg_aoa", 0)
            word_count = result["word_count"]
            components = result.get("score_components", {})

            print(f"{i:2d}. {score:5.1f} ({level:10s}): {phrase}")

            # Show score breakdown
            print(f"    Score breakdown (total: {score:.1f}/100):")
            print(f"       • AoA:      {components.get('aoa_score', 0):4.1f}/40  (avg: {avg_aoa:.1f} years)")
            print(f"       • Length:   {components.get('length_score', 0):4.1f}/25  (avg: {result['avg_word_length']:.1f} chars/word)")
            print(f"       • Phoneme:  {components.get('phoneme_score', 0):4.1f}/15  (complexity: {result.get('phoneme_complexity', 0):.2f})")
            print(f"       • Syllable: {components.get('syllable_score', 0):4.1f}/10  (total: {result.get('total_syllables', 0)})")
            print(f"       • Words:    {components.get('word_count_score', 0):4.1f}/10  (count: {word_count})")

            # Show per-word breakdown
            print(f"    Word breakdown:")
            for wd in result["word_details"]:
                word = wd["word"]
                lemma = wd.get("lemma")
                english = wd.get("english")
                aoa = wd.get("aoa", 0)

                if lemma:
                    print(f"       • {word} → {lemma} → {english}: AoA {aoa:.1f}")
                elif english:
                    print(f"       • {word} → {english}: AoA {aoa:.1f}")
                else:
                    print(f"       • {word}: AoA {aoa:.1f}")
            print()

        sys.exit(0)

    # Determine which entries to update
    if args.update_all:
        print(f"\n🔄 Updating ALL {len(phrases)} entries...\n")
        entries_to_update = phrases
    else:
        # Find entries with missing difficulty
        entries_to_update = [p for p in phrases if "difficulty" not in p]

        if len(entries_to_update) == 0:
            print("✅ All entries have difficulty data!")
            print("💡 Use --update-all to recalculate all difficulty scores")
            sys.exit(0)

        print(f"\n🔍 Found {len(entries_to_update)} entries with missing difficulty:\n")

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
            score = result["score"]
            level = result["level"]
            print(f'  ✓ "{phrase}": {score}/100 ({level})')
            updates.append({
                "phrase": phrase,
                "difficulty_score": score,
                "difficulty_level": level,
            })
        else:
            print(f'  ✗ "{phrase}": {result.get("error")}')

    if len(updates) == 0:
        print("❌ Could not calculate difficulty for any entries")
        sys.exit(1)

    # Display results summary
    print(f"\n{'=' * 60}")
    print(f"Calculated difficulty for {len(updates)}/{len(entries_to_update)} entries\n")

    # Update the phrases array
    print("✍️  Updating file...")

    for update in updates:
        entry = next((p for p in phrases if p.get("phrase") == update["phrase"]), None)
        if entry:
            entry["difficulty"] = {
                "score": update["difficulty_score"],
                "level": update["difficulty_level"],
            }

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

    print(f"✅ Updated {file_path} with {len(updates)} difficulty entries")


if __name__ == "__main__":
    main()
