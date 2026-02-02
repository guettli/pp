#!/usr/bin/env python3
"""
Fetch IPA pronunciations from Wiktionary for German words.
This script queries the Wiktionary API to get IPA pronunciations for a list of German words.
"""

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
        {"word": "Katze", "emoji": "🐱", "ipas": []},
        {"word": "Hund", "emoji": "🐕", "ipas": []},
        {"word": "Haus", "emoji": "🏠", "ipas": []},
        {"word": "Baum", "emoji": "🌳", "ipas": []},
        {"word": "Blume", "emoji": "🌸", "ipas": []},
        {"word": "Sonne", "emoji": "☀️", "ipas": []},
        {"word": "Mond", "emoji": "🌙", "ipas": []},
        {"word": "Stern", "emoji": "⭐", "ipas": []},
        {"word": "Auto", "emoji": "🚗", "ipas": []},
        {"word": "Ball", "emoji": "⚽", "ipas": []},
        {"word": "Buch", "emoji": "📖", "ipas": []},
        {"word": "Apfel", "emoji": "🍎", "ipas": []},
        {"word": "Banane", "emoji": "🍌", "ipas": []},
        {"word": "Brot", "emoji": "🍞", "ipas": []},
        {"word": "Fisch", "emoji": "🐟", "ipas": []},
        {"word": "Vogel", "emoji": "🐦", "ipas": []},
        {"word": "Schmetterling", "emoji": "🦋", "ipas": []},
        {"word": "Schiff", "emoji": "🚢", "ipas": []},
        {"word": "Flugzeug", "emoji": "✈️", "ipas": []},
        {"word": "Zug", "emoji": "🚂", "ipas": []},
        {"word": "Fahrrad", "emoji": "🚲", "ipas": []},
        {"word": "Tür", "emoji": "🚪", "ipas": []},
        {"word": "Fenster", "emoji": "🪟", "ipas": []},
        {"word": "Tisch", "emoji": "🍽️", "ipas": []},
        {"word": "Bett", "emoji": "🛏️", "ipas": []},
        {"word": "Uhr", "emoji": "🕐", "ipas": []},
        {"word": "Schlüssel", "emoji": "🔑", "ipas": []},
        {"word": "Herz", "emoji": "❤️", "ipas": []},
        {"word": "Hand", "emoji": "✋", "ipas": []},
        {"word": "Fuß", "emoji": "🦶", "ipas": []},
    ]

    print("Fetching IPA pronunciations from Wiktionary...\n")

    # Fetch IPA for each word
    for entry in words:
        word = entry["word"]
        print(f"Fetching: {word}")
        ipa = fetch_wiktionary_ipa(word)
        if ipa:
            entry["ipas"].append({
                "ipa": ipa,
                "category": "standard"
            })
        # Be nice to Wiktionary servers
        time.sleep(0.5)

    # Save to YAML file
    output_file = "words-de.yaml"
    with open(output_file, "w", encoding="utf-8") as f:
        for i, entry in enumerate(words):
            f.write(f"- word: {entry['word']}\n")
            f.write(f"  emoji: {entry['emoji']}\n")
            f.write(f"  ipas:\n")
            for ipa_entry in entry["ipas"]:
                f.write(f"    - ipa: {ipa_entry['ipa']}\n")
                f.write(f"      category: {ipa_entry['category']}\n")
            if i < len(words) - 1:
                f.write("\n")

    print(f"\n✓ Saved {len(words)} words to {output_file}")

    # Report statistics
    found = sum(1 for w in words if w["ipas"])
    missing = len(words) - found
    print(f"\nStatistics:")
    print(f"  Found IPA: {found}/{len(words)}")
    print(f"  Missing IPA: {missing}/{len(words)}")

    if missing > 0:
        print(f"\nWords missing IPA:")
        for entry in words:
            if not entry["ipas"]:
                print(f"  - {entry['word']} {entry['emoji']}")


if __name__ == "__main__":
    main()
