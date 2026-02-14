import { test, expect } from "@playwright/test";
import {
  generatePhonemeComparisonHTML,
  normalizeIPAForComparison,
} from "../src/ui/phoneme-comparison-view.js";

/**
 * Test word boundary detection in phoneme comparison
 *
 * Regression test for bug where "Der Delfin" had incorrect word boundaries
 * because both words start with "d", causing the naive algorithm to break too early.
 */
test.describe("Word Boundary Detection", () => {
  test("Der Delfin: should correctly split phonemes into two words", () => {
    // This is the case that was failing:
    // "Der" (IPA: deːɐ̯) and "Delfin" (IPA: dɛlfɪn) both start with "d"
    const targetIPA = "/deːɐ̯ dˈɛlfɪn/";

    // Simulate phoneme comparison result (what panphon-distance-core produces)
    // After normalization: "deːɐ dɛlfɪn" -> phonemes: ["d", "eː", "ɐ", "d", "ɛ", "l", "f", "ɪ", "n"]
    // Note: combining diacritic ̯ is removed during normalization
    // Word boundaries are marked with wordBoundary: true
    const phonemeComparison = [
      { target: "d", actual: "d", distance: 0, match: true, wordBoundary: false }, // Der
      { target: "eː", actual: "eː", distance: 0, match: true, wordBoundary: false }, // Der
      { target: "ɐ", actual: null, distance: 0.5, match: false, wordBoundary: false }, // Der (missing in actual)
      { target: "d", actual: "d", distance: 0, match: true, wordBoundary: true }, // Delfin (starts new word)
      { target: "ɛ", actual: "ɛ", distance: 0, match: true, wordBoundary: false }, // Delfin
      { target: "l", actual: "l", distance: 0, match: true, wordBoundary: false }, // Delfin
      { target: "f", actual: "f", distance: 0, match: true, wordBoundary: false }, // Delfin
      { target: "ɪ", actual: "iː", distance: 0.1, match: true, wordBoundary: false }, // Delfin
      { target: "n", actual: "n", distance: 0, match: true, wordBoundary: false }, // Delfin
    ];

    const html = generatePhonemeComparisonHTML(phonemeComparison);

    // Count word blocks (each word should be in its own .phoneme-word-block div)
    const wordBlockCount = (html.match(/<div class="phoneme-word-block">/g) || []).length;

    // Should have exactly 2 word blocks (one for "Der", one for "Delfin")
    expect(wordBlockCount).toBe(2);

    // Verify the first word block contains the first 3 phonemes (d, eː, ɐ)
    // and the second block contains the remaining 6 phonemes
    // We can verify this by checking the structure

    // Extract the phoneme characters from each word block
    const wordBlocks = html.split('<div class="phoneme-word-block">').slice(1);

    // First word block should have 3 phonemes: d, eː, ɐ
    const firstBlock = wordBlocks[0];
    // Updated regex to handle optional title attribute
    const firstBlockPhonemes =
      firstBlock.match(/<span class="phoneme-char[^>]*>([^<]+)<\/span>/g) || [];
    // Each phoneme appears twice (target and actual rows), so we should have 6 spans total (3 * 2)
    expect(firstBlockPhonemes.length).toBe(6); // Exactly 6 spans in first block (3 phonemes × 2 rows)

    // Second word block should have 6 phonemes
    const secondBlock = wordBlocks[1];
    const secondBlockPhonemes =
      secondBlock.match(/<span class="phoneme-char[^>]*>([^<]+)<\/span>/g) || [];
    expect(secondBlockPhonemes.length).toBe(12); // Exactly 12 spans in second block (6 phonemes × 2 rows)
  });

  test("Single word: should have one word block", () => {
    const targetIPA = "/hʊnt/"; // Hund
    const phonemeComparison = [
      { target: "h", actual: "h", distance: 0, match: true, wordBoundary: false },
      { target: "ʊ", actual: "ʊ", distance: 0, match: true, wordBoundary: false },
      { target: "n", actual: "n", distance: 0, match: true, wordBoundary: false },
      { target: "t", actual: "t", distance: 0, match: true, wordBoundary: false },
    ];

    const html = generatePhonemeComparisonHTML(phonemeComparison);
    const wordBlockCount = (html.match(/<div class="phoneme-word-block">/g) || []).length;

    expect(wordBlockCount).toBe(1);
  });

  test("Three words starting with same phoneme: should correctly split", () => {
    // Test case: "der die das" - all start with "d"
    const targetIPA = "/deːɐ̯ diː das/";
    // Note: after normalization, ɐ̯ becomes ɐ (combining diacritic removed)
    const phonemeComparison = [
      { target: "d", actual: "d", distance: 0, match: true, wordBoundary: false }, // der
      { target: "eː", actual: "eː", distance: 0, match: true, wordBoundary: false }, // der
      { target: "ɐ", actual: "ɐ", distance: 0, match: true, wordBoundary: false }, // der
      { target: "d", actual: "d", distance: 0, match: true, wordBoundary: true }, // die (starts new word)
      { target: "iː", actual: "iː", distance: 0, match: true, wordBoundary: false }, // die
      { target: "d", actual: "d", distance: 0, match: true, wordBoundary: true }, // das (starts new word)
      { target: "a", actual: "a", distance: 0, match: true, wordBoundary: false }, // das
      { target: "s", actual: "s", distance: 0, match: true, wordBoundary: false }, // das
    ];

    const html = generatePhonemeComparisonHTML(phonemeComparison);
    const wordBlockCount = (html.match(/<div class="phoneme-word-block">/g) || []).length;

    // Should have exactly 3 word blocks
    expect(wordBlockCount).toBe(3);
  });

  test("normalizeIPAForComparison: should remove slashes and stress marks", () => {
    // Note: normalizeIPAForComparison also removes combining diacritics like ̯ (U+032F)
    expect(normalizeIPAForComparison("/deːɐ̯ dˈɛlfɪn/")).toBe("deːɐ dɛlfɪn");
    expect(normalizeIPAForComparison("/hʊnt/")).toBe("hʊnt");
    expect(normalizeIPAForComparison("/ˈʃtʁaːsə/")).toBe("ʃtʁaːsə");
  });
});
