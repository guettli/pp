#!/usr/bin/env python3
"""
CLI tool to calculate phrase difficulty for language learning.

Usage:
    python phrase_difficulty.py "Der Hund läuft" --language de
    python phrase_difficulty.py "The quick brown fox" --language en
"""

import argparse
import sys
import csv
import urllib.request
import json
import re
from typing import Dict, Optional
from pathlib import Path
import panphon

# Optional: Translation support
from deep_translator import GoogleTranslator


# Optional: Text-to-IPA for phoneme analysis
import epitran


class PhraseDifficultyAnalyzer:
    """Analyzes phrase difficulty based on multiple linguistic factors."""

    def __init__(self):
        self.ft = panphon.FeatureTable()
        base_cache = self._get_cache_dir()
        self.aoa_cache_dir = base_cache / "glasgow-norm"
        self._load_aoa_data()

        # HTTP request caches (Wiktionary API and Google Translate)
        self.wiktionary_cache_dir = self._get_cache_dir() / "wiktionary"
        self.wiktionary_cache_dir.mkdir(parents=True, exist_ok=True)

        self.translation_cache_dir = self._get_cache_dir() / "translations-to-en"
        self.translation_cache_dir.mkdir(parents=True, exist_ok=True)

        # Initialize translator if available
        self.translator = GoogleTranslator(source="auto", target="en")

        # Initialize text-to-IPA converters for supported languages
        self.epitran_converters = {}
        self.epitran_converters["en"] = epitran.Epitran("eng-Latn")
        self.epitran_converters["de"] = epitran.Epitran("deu-Latn")

    def _get_cache_dir(self) -> Path:
        """Get cache directory for AoA data."""
        cache_dir = Path.home() / ".cache" / "pp"
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir

    def _get_translation_cache_file(self, source_lang: str, word: str) -> Path:
        """Get cache file path for a translation (HTTP request)."""
        word_clean = "".join(c for c in word.lower() if c.isalnum())
        lang_dir = self.translation_cache_dir / source_lang
        lang_dir.mkdir(parents=True, exist_ok=True)
        return lang_dir / f"{word_clean}.txt"

    def _load_translation_from_cache(self, source_lang: str, word: str) -> Optional[str]:
        """Load translation from cache file."""
        cache_file = self._get_translation_cache_file(source_lang, word)
        if cache_file.exists():
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    return f.read().strip()
            except Exception:
                return None
        return None

    def _save_translation_to_cache(self, source_lang: str, word: str, translation: str):
        """Save translation to cache file."""
        cache_file = self._get_translation_cache_file(source_lang, word)
        with open(cache_file, "w", encoding="utf-8") as f:
            f.write(translation)

    def _get_wiktionary_cache_file(self, lang: str, word: str) -> Path:
        """Get cache file path for a Wiktionary lemma lookup."""
        word_clean = "".join(c for c in word.lower() if c.isalnum())
        lang_dir = self.wiktionary_cache_dir / lang
        lang_dir.mkdir(parents=True, exist_ok=True)
        return lang_dir / f"{word_clean}.txt"

    def _load_lemma_from_cache(self, lang: str, word: str) -> Optional[str]:
        """Load lemma from cache file."""
        cache_file = self._get_wiktionary_cache_file(lang, word)
        if cache_file.exists():
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    lemma = f.read().strip()
                    return lemma if lemma else None
            except Exception:
                return None
        return None

    def _save_lemma_to_cache(self, lang: str, word: str, lemma: str):
        """Save lemma to cache file."""
        cache_file = self._get_wiktionary_cache_file(lang, word)
        with open(cache_file, "w", encoding="utf-8") as f:
            f.write(lemma)

    def _extract_language_section(self, content: str, lang: str) -> Optional[str]:
        """
        Extract only the section for the specified language from Wiktionary content.

        Returns the text between the language header and the next language section.
        """
        if not content:
            return None

        # Language names in Wiktionary
        lang_names = {
            "de": "Deutsch",
            "en": "English"
        }

        if lang not in lang_names:
            return content

        lang_name = lang_names[lang]

        # Match pattern: == word ({{Sprache|Deutsch}}) ==
        pattern = rf"== [^=]+ \(\{{{{Sprache\|{lang_name}\}}}}\) =="
        match = re.search(pattern, content)

        if not match:
            # If no language section found, return full content
            return content

        # Get start position of this language section
        start = match.start()

        # Find the next language section (== word ({{Sprache|...}}) ==)
        next_section = re.search(r"== [^=]+ \(\{\{Sprache\|[^}]+\}\}\) ==", content[start + len(match.group()):])

        if next_section:
            # Extract up to the next language section
            end = start + len(match.group()) + next_section.start()
            return content[start:end]
        else:
            # No next section, take rest of content
            return content[start:]

    def _extract_lemma_from_wiktionary(self, content: str, lang: str) -> Optional[str]:
        """
        Extract the base form (lemma) from Wiktionary page content.

        For German, looks for patterns like:
        - des Verbs '''[[gehen]]'''
        - {{Grundformverweis Konj|gehen}}
        - {{Deutsch Verb Übersicht|gehen|...}}

        Note: Only returns a lemma if this is actually a declined/conjugated form.
        If no inflection markers are found, returns None (meaning the word is already its base form).
        """
        if not content:
            return None

        # Extract only the section for the requested language
        lang_content = self._extract_language_section(content, lang)
        if not lang_content:
            return None

        # German-specific patterns
        if lang == "de":
            # Extract only the FIRST subsection (the primary entry)
            # Subsections are marked with === ... ===
            # This prevents us from matching secondary entries (like declined forms of other words)
            # Match from === line to next line starting with == or === or end of string
            first_subsection_match = re.search(r'(===.*?)(?=\n===|\n==|$)', lang_content, re.DOTALL)
            if first_subsection_match:
                primary_content = first_subsection_match.group(1)
            else:
                primary_content = lang_content

            # First, check if the PRIMARY entry is marked as a declined/conjugated form
            # Look for "{{Wortart|Konjugierte Form|" or "{{Wortart|Deklinierte Form|"
            is_inflected = bool(
                re.search(r'\{\{Wortart\|(Konjugierte Form|Deklinierte Form)', primary_content)
            )

            # If not marked as inflected form, don't extract a lemma
            # (the word is likely already in its base form)
            if not is_inflected:
                return None

            # Use the primary content for extraction
            lang_content = primary_content

            # Look for "des Verbs '''[[lemma]]'''" pattern (most reliable)
            verb_ref_match = re.search(r"des Verbs '''?\[\[([^\]#]+)", lang_content)
            if verb_ref_match:
                return verb_ref_match.group(1).strip()

            # Look for "des Substantivs '''[[lemma]]'''" for nouns
            noun_ref_match = re.search(r"des Substantivs '''?\[\[([^\]#]+)", lang_content)
            if noun_ref_match:
                return noun_ref_match.group(1).strip()

            # Look for "des Adjektivs '''[[lemma]]'''" for adjectives
            adj_ref_match = re.search(r"des Adjektivs '''?\[\[([^\]#]+)", lang_content)
            if adj_ref_match:
                return adj_ref_match.group(1).strip()

            # Look for Grundformverweis template: {{Grundformverweis Konj|gehen}}
            grundform_match = re.search(r'\{\{Grundformverweis[^|]*\|([^|}]+)', lang_content)
            if grundform_match:
                return grundform_match.group(1).strip()

            # Look for verb conjugation template: {{Deutsch Verb Übersicht|infinitive|...}}
            verb_match = re.search(r'\{\{Deutsch Verb Übersicht\|([^|}]+)', lang_content)
            if verb_match:
                return verb_match.group(1).strip()

            # Look for "Konjugierte Form" (conjugated form) references
            konj_match = re.search(r'Konjugierte Form.*?\[\[([^\]#]+)', lang_content, re.IGNORECASE)
            if konj_match:
                return konj_match.group(1).strip()

        # English-specific patterns
        elif lang == "en":
            # Check if this is marked as an inflected form
            # In English Wiktionary, inflected forms often have "inflection of" template
            has_inflection_marker = bool(
                re.search(r'\{\{inflection of\|en\|', lang_content)
            )

            if not has_inflection_marker:
                return None

            # Look for inflection-of templates
            infl_match = re.search(r'\{\{inflection of\|en\|([^|}]+)', lang_content)
            if infl_match:
                return infl_match.group(1).strip()

            # Look for en-verb templates
            verb_match = re.search(r'\{\{en-verb.*?\|([^|}]+)', lang_content)
            if verb_match:
                return verb_match.group(1).strip()

        return None

    def get_lemma_from_wiktionary(self, word: str, lang: str) -> str:
        """
        Get the base form (lemma) of a word using Wiktionary API.

        Args:
            word: The inflected word (e.g., "gehe")
            lang: Language code (e.g., "de", "en")

        Returns:
            The base form (e.g., "gehen") or the original word if not found
        """
        # Check cache first
        cached = self._load_lemma_from_cache(lang, word)
        if cached is not None:
            return cached

        # Fetch from Wiktionary
        lang_domain = {"de": "de", "en": "en"}[lang]
        url = f"https://{lang_domain}.wiktionary.org/w/api.php"
        params = {
            "action": "query",
            "titles": word,
            "prop": "revisions",
            "rvprop": "content",
            "format": "json"
        }

        try:
            full_url = url + "?" + "&".join(f"{k}={v}" for k, v in params.items())
            req = urllib.request.Request(full_url, headers={"User-Agent": "PhraseDifficultyBot/1.0"})

            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))

                # Extract page content
                pages = data.get("query", {}).get("pages", {})
                for page_id, page_data in pages.items():
                    if page_id == "-1":
                        # Page doesn't exist
                        print(f"  [Wiktionary: {word} not found]", file=sys.stderr)
                        self._save_lemma_to_cache(lang, word, word)
                        return word

                    revisions = page_data.get("revisions", [])
                    if revisions:
                        content = revisions[0].get("*", "")
                        lemma = self._extract_lemma_from_wiktionary(content, lang)

                        if lemma:
                            print(f"  [Wiktionary: {word} -> {lemma}]", file=sys.stderr)
                            self._save_lemma_to_cache(lang, word, lemma)
                            return lemma
                        else:
                            print(f"  [Wiktionary: no lemma found for {word}, using as-is]", file=sys.stderr)
                            self._save_lemma_to_cache(lang, word, word)
                            return word

        except Exception as e:
            print(f"  [Wiktionary API error: {e}]", file=sys.stderr)
            # On error, use the word as-is and cache it
            self._save_lemma_to_cache(lang, word, word)
            return word

        # Default: return the original word
        self._save_lemma_to_cache(lang, word, word)
        return word

    def _download_glasgow_norms(self, csv_file: Path, cache_dir: Path) -> bool:
        """Download Glasgow Norms data and split into YAML files."""
        print(f"\nGlasgow Norms AoA data not found in cache.", file=sys.stderr)
        print(f"Downloading from Springer (CC BY 4.0 license)...", file=sys.stderr)

        url = "https://static-content.springer.com/esm/art%3A10.3758%2Fs13428-018-1099-3/MediaObjects/13428_2018_1099_MOESM2_ESM.csv"

        print(f"  Downloading from: {url}", file=sys.stderr)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as response:
            data = response.read()

            if data and len(data) > 10000:
                # Save CSV
                csv_file.parent.mkdir(parents=True, exist_ok=True)
                with open(csv_file, "wb") as f:
                    f.write(data)
                print(f"✓ Downloaded to {csv_file}", file=sys.stderr)

                # Split into YAML files
                cache_dir.mkdir(parents=True, exist_ok=True)
                count = 0
                with open(csv_file, "r", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        word = (
                            row.get("Words") or row.get("Word") or row.get("word") or ""
                        ).strip()

                        # Skip words with spaces
                        if not word or " " in word:
                            continue

                        aoa_str = (
                            row.get("AOA")
                            or row.get("AoA")
                            or row.get("aoa")
                            or row.get("Rating.Mean")
                        )
                        if not aoa_str:
                            continue

                        aoa = float(aoa_str)
                        word_file = cache_dir / f"{word.lower()}.yaml"
                        with open(word_file, "w", encoding="utf-8") as wf:
                            wf.write(f"word: {word}\naoa: {aoa}\n")
                        count += 1

                print(f"✓ Created {count} word files in {cache_dir}", file=sys.stderr)
                print(
                    f"  License: CC BY 4.0 (Free to use with attribution)",
                    file=sys.stderr,
                )
                print(
                    f"  Citation: Scott et al. (2019), Behavior Research Methods",
                    file=sys.stderr,
                )
                return True
            else:
                print(f"\n❌ Download failed: {url}", file=sys.stderr)
                print(f"   Downloaded data doesn't look like CSV", file=sys.stderr)
                return False

    def _load_aoa_data(self):
        """
        Setup Glasgow Norms cache directory.

        Glasgow Norms: Scott et al. (2019)
        - 5,500 English words
        - License: CC BY 4.0
        - Source: https://osf.io/py3wk/
        """
        csv_file = self.aoa_cache_dir.parent / "glasgow-norm.csv"

        # Download if not present
        if not self.aoa_cache_dir.exists():
            if not self._download_glasgow_norms(csv_file, self.aoa_cache_dir):
                print(
                    "\n❌ Cannot continue without AoA data.",
                    file=sys.stderr,
                )
                sys.exit(1)

    def translate_to_english(self, word: str, source_lang: str) -> str:
        """
        Translate a word to English for AoA lookup.
        Uses Google Translate via deep-translator (free, no API key).
        Caches HTTP requests to avoid repeated API calls.
        """
        if source_lang == "en":
            return word.lower()

        # Check cache first (HTTP requests are cached)
        cached = self._load_translation_from_cache(source_lang, word)
        if cached is not None:
            return cached

        # Make HTTP request to Google Translate
        self.translator.source = source_lang
        translated = self.translator.translate(word)

        if translated and translated.lower() != word.lower():
            result = translated.lower()
            print(f"  [Translated: {word} -> {translated}]", file=sys.stderr)
        else:
            result = word.lower()
            print(f"  [Translation: {word} -> {result} (no change)]", file=sys.stderr)

        # Cache the HTTP response
        self._save_translation_to_cache(source_lang, word, result)
        return result

    def get_aoa(self, word: str, use_adult_fallback: bool = True) -> Optional[float]:
        """
        Get Age of Acquisition for a word (in years) from YAML cache.
        Returns None if not found and use_adult_fallback=False.
        Returns 16.0 (Adult AoA) if not found and use_adult_fallback=True.
        """
        word_lower = word.lower().strip()

        # Try direct lookup
        word_file = self.aoa_cache_dir / f"{word_lower}.yaml"
        if word_file.exists():
            with open(word_file, "r", encoding="utf-8") as f:
                content = f.read()
                for line in content.split("\n"):
                    if line.startswith("aoa:"):
                        return float(line.split(":")[1].strip())
        print(
            f"  [AoA not found for: {word} ({word_file} does not exist)]",
            file=sys.stderr,
        )

        if use_adult_fallback:
            adult_aoa = 16.0  # Adult-learned words
            print(f"  [Using Adult AoA: {adult_aoa} years]", file=sys.stderr)
            return adult_aoa

        return None

    def text_to_ipa(self, text: str, language: str) -> Optional[str]:
        """
        Convert text to IPA notation using epitran.
        Returns None if conversion not available.
        """

        if language not in self.epitran_converters:
            return None

        converter = self.epitran_converters[language]
        return converter.transliterate(text)

    def calculate_phoneme_complexity(self, ipa: str) -> float:
        """
        Calculate phoneme complexity based on articulatory features.

        Uses PanPhon to compute:
        - Number of marked features (non-zero values)
        - Presence of rare or difficult phonemes
        """
        phonemes = self.ft.ipa_segs(ipa)

        if not phonemes:
            return 0.0

        total_complexity = 0.0

        for phoneme in phonemes:
            # Get feature vector for this phoneme
            features = self.ft.word_to_vector_list(phoneme)

            if not features:
                # Unknown phoneme - mark as complex
                total_complexity += 1.0
                continue

            # Count marked features (non-zero, non-NA)
            feature_vec = features[0]
            marked_features = sum(1 for f in feature_vec if f != 0)

            # Normalize by total number of features
            complexity = marked_features / len(feature_vec)
            total_complexity += complexity

        # Return average complexity
        return total_complexity / len(phonemes) if phonemes else 0.0

    def calculate_syllable_count(self, word: str) -> int:
        """
        Estimate syllable count.

        TODO: Use pyphen or similar for proper syllabification.
        For now, use simple vowel counting heuristic.
        """
        vowels = "aeiouäöüAEIOUÄÖÜ"
        count = 0
        prev_was_vowel = False

        for char in word:
            is_vowel = char in vowels
            if is_vowel and not prev_was_vowel:
                count += 1
            prev_was_vowel = is_vowel

        return max(1, count)  # At least one syllable

    def analyze_phrase(self, phrase: str, language: str) -> Dict:
        """
        Analyze phrase difficulty across multiple dimensions.

        Returns a dictionary with:
        - word_count: number of words
        - char_count: total characters (excluding spaces)
        - avg_word_length: average word length
        - syllable_count: estimated total syllables
        - avg_aoa: average age of acquisition (if available)
        - phoneme_complexity: average phoneme complexity
        - difficulty_score: composite score (0-100)
        """
        words = phrase.split()

        if not words:
            return {"error": "Empty phrase", "difficulty_score": 0}

        # Basic metrics
        word_count = len(words)
        char_count = sum(len(w) for w in words)
        avg_word_length = char_count / word_count

        # Syllable count
        total_syllables = sum(self.calculate_syllable_count(w) for w in words)

        # AoA analysis (if available) - collect per-word details
        aoa_scores = []
        word_details = []

        for word in words:
            # First, get the lemma (base form) from Wiktionary
            lemma = self.get_lemma_from_wiktionary(word, language)

            # Then translate the lemma to English
            english_word = self.translate_to_english(lemma, language)
            aoa = self.get_aoa(english_word)
            syllables = self.calculate_syllable_count(word)
            ipa = self.text_to_ipa(word, language)
            phoneme_complexity = None

            if ipa:
                phoneme_complexity = self.calculate_phoneme_complexity(ipa)

            word_details.append(
                {
                    "word": word,
                    "lemma": lemma if lemma != word else None,
                    "english": english_word if language != "en" else None,
                    "aoa": aoa,
                    "syllables": syllables,
                    "phoneme_complexity": phoneme_complexity,
                    "ipa": ipa,
                }
            )

            if aoa is not None:
                aoa_scores.append(aoa)

        # AoA should always be available due to adult fallback
        avg_aoa = sum(aoa_scores) / len(aoa_scores) if aoa_scores else 16.0

        # Phoneme complexity (aggregate)
        phoneme_complexities = [
            wd["phoneme_complexity"]
            for wd in word_details
            if wd["phoneme_complexity"] is not None and wd["phoneme_complexity"] > 0
        ]

        # If no phoneme data available, use adult default (higher complexity)
        if phoneme_complexities:
            phoneme_complexity = sum(phoneme_complexities) / len(phoneme_complexities)
        else:
            phoneme_complexity = 0.75  # Adult-level phoneme complexity default
            print("  [Using Adult phoneme complexity: 0.75]", file=sys.stderr)

        # Composite difficulty score (0-100)
        # Weight different factors:
        # - Length (longer = harder): 0-25 points
        # - AoA (later = harder): 0-40 points
        # - Syllable complexity: 0-10 points
        # - Phoneme complexity: 0-15 points
        # - Word count: 0-10 points

        difficulty_score = 0.0

        # Length component (0-25 points)
        # Average word length: 1-15 characters
        length_score = min(25, (avg_word_length / 15) * 25)
        difficulty_score += length_score

        # Word count component (0-10 points)
        # 1-10 words
        word_count_score = min(10, (word_count / 10) * 10)
        difficulty_score += word_count_score

        # AoA component (0-40 points) - most important factor
        # AoA is always available (with Adult fallback)
        # AoA ranges from ~2 to ~18 years (adult learning)
        aoa_score = min(40, ((avg_aoa - 2) / 16) * 40)
        difficulty_score += aoa_score

        # Syllable density (0-10 points)
        syllable_density = total_syllables / word_count
        syllable_score = min(10, (syllable_density / 4) * 10)
        difficulty_score += syllable_score

        # Phoneme complexity (0-15 points)
        # Phoneme complexity is always available (with Adult fallback)
        # Phoneme complexity ranges from 0 to 1
        phoneme_score = phoneme_complexity * 15
        difficulty_score += phoneme_score

        return {
            "phrase": phrase,
            "language": language,
            "word_count": word_count,
            "char_count": char_count,
            "avg_word_length": round(avg_word_length, 2),
            "total_syllables": total_syllables,
            "avg_syllables_per_word": round(syllable_density, 2),
            "avg_aoa": round(avg_aoa, 2) if avg_aoa else None,
            "aoa_available_for": f"{len(aoa_scores)}/{word_count} words",
            "phoneme_complexity": phoneme_complexity,
            "difficulty_score": round(difficulty_score, 1),
            "difficulty_level": self._get_difficulty_level(difficulty_score),
            "word_details": word_details,
            # Score components breakdown
            "score_components": {
                "length_score": round(length_score, 1),
                "word_count_score": round(word_count_score, 1),
                "aoa_score": round(aoa_score, 1),
                "syllable_score": round(syllable_score, 1),
                "phoneme_score": round(phoneme_score, 1),
            },
        }

    def _get_difficulty_level(self, score: float) -> str:
        """Convert numeric score to difficulty level."""
        if score < 20:
            return "Very Easy"
        elif score < 40:
            return "Easy"
        elif score < 60:
            return "Medium"
        elif score < 80:
            return "Hard"
        else:
            return "Very Hard"


def main():
    parser = argparse.ArgumentParser(
        description="Analyze phrase difficulty for language learning"
    )
    parser.add_argument("language", help="Language code (en, de)")
    parser.add_argument("phrase", help="The phrase to analyze")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    analyzer = PhraseDifficultyAnalyzer()
    supported_languages = ["de", "en"]
    if args.language not in supported_languages:
        print(
            f"{args.language} not a supported language. Supported: {supported_languages}"
        )
        sys.exit(1)
    result = analyzer.analyze_phrase(args.phrase, args.language)

    if args.json:
        import json

        print(json.dumps(result, indent=2))
        return
    # Pretty print results
    print(f"\n{'='*60}")
    print(f"Phrase Difficulty Analysis")
    print(f"{'='*60}")
    print(f"Phrase: {result['phrase']}")
    print(f"Language: {result['language']}")
    print(f"\n{'Basic Metrics':-^60}")
    print(f"  Words: {result['word_count']}")
    print(f"  Characters: {result['char_count']}")
    print(f"  Total syllables: {result['total_syllables']}")
    print(f"  Avg. syllables/word: {result['avg_syllables_per_word']}")

    # Per-word breakdown
    print(f"\n{'Per-Word Analysis':-^60}")
    for i, wd in enumerate(result["word_details"], 1):
        print(f"  Word {i}: {wd['word']}")
        if wd.get("lemma"):
            print(f"    → Lemma: {wd['lemma']}")
        if wd["english"] and wd["english"] != wd["word"].lower():
            print(f"    → English: {wd['english']}")
        print(f"    Syllables: {wd['syllables']}")
        if wd["aoa"] is not None:
            print(f"    AoA: {wd['aoa']:.1f} years")
        else:
            print(f"    AoA: not found")
        if wd["phoneme_complexity"] is not None:
            print(f"    Phoneme complexity: {wd['phoneme_complexity']:.3f}")
        if wd["ipa"]:
            print(f"    IPA: {wd['ipa']}")

    if result["avg_aoa"] is not None:
        print(f"\n{'Aggregate Scores':-^60}")
        print(f"  Average AoA: {result['avg_aoa']} years")
        print(f"  Data available: {result['aoa_available_for']}")

    if result["phoneme_complexity"] is not None:
        if result["avg_aoa"] is None:
            print(f"\n{'Aggregate Scores':-^60}")
        print(
            f"  Avg. phoneme complexity: {result['phoneme_complexity']:.3f} (0=simple, 1=complex)"
        )

    print(f"\n{'Difficulty Assessment':-^60}")
    print(f"  Score: {result['difficulty_score']}/100")
    print(f"  Level: {result['difficulty_level']}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
