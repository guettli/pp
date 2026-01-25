#!/usr/bin/env python3
"""
Fetch IPA pronunciations from Wiktionary for German words.
This script queries the Wiktionary API to get IPA pronunciations for a list of German words.
"""

import json
import re
import urllib.request
import urllib.parse
import time
from typing import Optional


def fetch_wiktionary_ipa(word: str, lang: str = "de") -> Optional[str]:
    """
    Fetch IPA pronunciation from Wiktionary for a given word.

    Args:
        word: The German word to look up
        lang: Language code (default: "de" for German)

    Returns:
        IPA string if found, None otherwise
    """
    # Use Wiktionary API to get page content
    url = f"https://{lang}.wiktionary.org/w/api.php"
    params = {
        "action": "parse",
        "page": word,
        "prop": "wikitext",
        "format": "json"
    }

    try:
        query_string = urllib.parse.urlencode(params)
        full_url = f"{url}?{query_string}"

        # Wiktionary requires a User-Agent header
        req = urllib.request.Request(
            full_url,
            headers={
                'User-Agent': 'PhonemePracticeBot/1.0 (Educational pronunciation tool; https://github.com/)'
            }
        )

        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode())

        if "parse" not in data or "wikitext" not in data["parse"]:
            print(f"  ⚠️  No data found for '{word}'")
            return None

        wikitext = data["parse"]["wikitext"]["*"]

        # Look for IPA patterns in the wikitext
        # German Wiktionary uses {{IPA|...}} or {{Lautschrift|...}}
        ipa_patterns = [
            r'\{\{IPA\|([^}]+)\}\}',
            r'\{\{Lautschrift\|([^}]+)\}\}',
            r'IPA:\s*\[([^\]]+)\]',
            r'/([^/]+)/'
        ]

        for pattern in ipa_patterns:
            matches = re.findall(pattern, wikitext)
            if matches:
                # Clean up the IPA string
                ipa = matches[0].strip()
                # Remove language codes and extra markup
                ipa = re.sub(r'\|[a-z]{2}', '', ipa)
                ipa = re.sub(r'\{\{.*?\}\}', '', ipa)
                ipa = ipa.strip()

                # Ensure it's wrapped in slashes if not already
                if not ipa.startswith('/') and not ipa.startswith('['):
                    ipa = f"/{ipa}/"

                print(f"  ✓ Found: {word} → {ipa}")
                return ipa

        print(f"  ⚠️  No IPA found for '{word}'")
        return None

    except Exception as e:
        print(f"  ✗ Error fetching '{word}': {e}")
        return None


def main():
    """Generate the German word list with emojis and fetch IPA pronunciations."""

    # Initial word list with emojis - simple, concrete nouns suitable for children
    words = [
        {"word": "Katze", "emoji": "🐱", "ipa": None},
        {"word": "Hund", "emoji": "🐕", "ipa": None},
        {"word": "Haus", "emoji": "🏠", "ipa": None},
        {"word": "Baum", "emoji": "🌳", "ipa": None},
        {"word": "Blume", "emoji": "🌸", "ipa": None},
        {"word": "Sonne", "emoji": "☀️", "ipa": None},
        {"word": "Mond", "emoji": "🌙", "ipa": None},
        {"word": "Stern", "emoji": "⭐", "ipa": None},
        {"word": "Auto", "emoji": "🚗", "ipa": None},
        {"word": "Ball", "emoji": "⚽", "ipa": None},
        {"word": "Buch", "emoji": "📖", "ipa": None},
        {"word": "Apfel", "emoji": "🍎", "ipa": None},
        {"word": "Banane", "emoji": "🍌", "ipa": None},
        {"word": "Brot", "emoji": "🍞", "ipa": None},
        {"word": "Fisch", "emoji": "🐟", "ipa": None},
        {"word": "Vogel", "emoji": "🐦", "ipa": None},
        {"word": "Schmetterling", "emoji": "🦋", "ipa": None},
        {"word": "Schiff", "emoji": "🚢", "ipa": None},
        {"word": "Flugzeug", "emoji": "✈️", "ipa": None},
        {"word": "Zug", "emoji": "🚂", "ipa": None},
        {"word": "Fahrrad", "emoji": "🚲", "ipa": None},
        {"word": "Tür", "emoji": "🚪", "ipa": None},
        {"word": "Fenster", "emoji": "🪟", "ipa": None},
        {"word": "Tisch", "emoji": "🪑", "ipa": None},
        {"word": "Bett", "emoji": "🛏️", "ipa": None},
        {"word": "Uhr", "emoji": "🕐", "ipa": None},
        {"word": "Schlüssel", "emoji": "🔑", "ipa": None},
        {"word": "Herz", "emoji": "❤️", "ipa": None},
        {"word": "Hand", "emoji": "✋", "ipa": None},
        {"word": "Fuß", "emoji": "🦶", "ipa": None},
    ]

    print("Fetching IPA pronunciations from Wiktionary...\n")

    # Fetch IPA for each word
    for entry in words:
        word = entry["word"]
        print(f"Fetching: {word}")
        ipa = fetch_wiktionary_ipa(word)
        entry["ipa"] = ipa
        # Be nice to Wiktionary servers
        time.sleep(0.5)

    # Save to JSON file
    output_file = "words-de.json"
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Saved {len(words)} words to {output_file}")

    # Report statistics
    found = sum(1 for w in words if w["ipa"])
    missing = len(words) - found
    print(f"\nStatistics:")
    print(f"  Found IPA: {found}/{len(words)}")
    print(f"  Missing IPA: {missing}/{len(words)}")

    if missing > 0:
        print(f"\nWords missing IPA:")
        for entry in words:
            if not entry["ipa"]:
                print(f"  - {entry['word']} {entry['emoji']}")


if __name__ == "__main__":
    main()
