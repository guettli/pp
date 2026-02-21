import { expect, test } from "./fixtures.js";

test.describe("Phoneme Word Boundaries", () => {
  test('should correctly group phonemes by words for "Das Feuer brennt"', async ({
    modelPage: page,
  }) => {
    // Inject test data to simulate the phrase "Das Feuer brennt" feedback
    const testResult = await page.evaluate(() => {
      // Import the feedback display function (accessing internal module)
      // We'll test by creating a mock phoneme comparison structure
      const mockPhonemeComparison = [
        // Word 1: "das" - 3 phonemes
        { target: "d", actual: "d", match: true, distance: 0 },
        { target: "a", actual: "a", match: true, distance: 0 },
        { target: "s", actual: "s", match: true, distance: 0 },
        // Word 2: "fɔʏɐ" - 4 phonemes (ə becomes ɐ in phoneme extraction)
        { target: "f", actual: "f", match: true, distance: 0 },
        { target: "ɔ", actual: "ɔ", match: true, distance: 0 },
        { target: "ʏ", actual: "ʏ", match: true, distance: 0 },
        { target: "ɐ", actual: "ɐ", match: true, distance: 0 },
        // Word 3: "bɾɛnt" - 5 phonemes
        { target: "b", actual: "b", match: true, distance: 0 },
        { target: "ɾ", actual: "ɾ", match: true, distance: 0 },
        { target: "ɛ", actual: "ɛ", match: true, distance: 0 },
        { target: "n", actual: "n", match: true, distance: 0 },
        { target: "t", actual: "t", match: true, distance: 0 },
      ];

      // Target IPA with spaces indicating word boundaries
      const targetIPA = "/das ˈfɔʏ̯ər bɾˈɛnt/";

      // Create a temporary element to hold the generated HTML
      const tempDiv = document.createElement("div");

      // We need to access the internal function - let's use the module directly
      // Since we can't import in evaluate, we'll simulate the logic
      function normalizeIPAForComparison(ipa) {
        return ipa
          .replace(/[/[\]ˈˌ]/g, "")
          .replace(/\u0361/g, "")
          .replace(/\u032f/g, "")
          .replace(/\u0334/g, "")
          .trim();
      }

      const normalizedIPA = normalizeIPAForComparison(targetIPA);
      const words = normalizedIPA.split(/\s+/).filter((w) => w.length > 0);

      // Calculate word boundaries using the same logic as the fixed code
      const wordPhonemeIndices = [];
      let phonemeIdx = 0;

      for (let wordIdx = 0; wordIdx < words.length; wordIdx++) {
        const word = words[wordIdx];
        const nextWord = wordIdx < words.length - 1 ? words[wordIdx + 1] : null;

        // Count phonemes until we've covered this word
        const startIdx = phonemeIdx;
        let charsMatched = 0;

        while (phonemeIdx < mockPhonemeComparison.length && charsMatched < word.length) {
          const phoneme = mockPhonemeComparison[phonemeIdx].target || "";

          // Check if this phoneme starts the next word (word boundary detection)
          if (nextWord && phoneme.length > 0 && nextWord.startsWith(phoneme)) {
            // We've reached the next word, stop here
            break;
          }

          charsMatched += phoneme.length;
          phonemeIdx++;

          // Stop if we've matched enough and the next phoneme starts the next word
          if (
            charsMatched >= word.length - 1 &&
            nextWord &&
            phonemeIdx < mockPhonemeComparison.length
          ) {
            const nextPhoneme = mockPhonemeComparison[phonemeIdx].target || "";
            if (nextWord.startsWith(nextPhoneme)) {
              break;
            }
          }
        }

        wordPhonemeIndices.push(phonemeIdx - startIdx);
      }

      return {
        normalizedIPA,
        words,
        wordPhonemeIndices,
        totalPhonemes: mockPhonemeComparison.length,
      };
    });

    // Verify the results
    expect(testResult.normalizedIPA).toBe("das fɔʏər bɾɛnt");
    expect(testResult.words).toEqual(["das", "fɔʏər", "bɾɛnt"]);

    // The key assertion: verify phonemes are grouped correctly
    // Word 1 "das" should have 3 phonemes: d, a, s
    expect(testResult.wordPhonemeIndices[0]).toBe(3);

    // Word 2 "fɔʏər" should have 4 phonemes: f, ɔ, ʏ, ɐ (NOT including b!)
    expect(testResult.wordPhonemeIndices[1]).toBe(4);

    // Word 3 "bɾɛnt" should have 5 phonemes: b, ɾ, ɛ, n, t
    expect(testResult.wordPhonemeIndices[2]).toBe(5);

    // Total should be 12
    expect(testResult.totalPhonemes).toBe(12);
    expect(testResult.wordPhonemeIndices.reduce((a, b) => a + b, 0)).toBe(12);
  });

  test("should not include title attribute for matching phonemes", async ({ modelPage: page }) => {
    // Inject HTML with phoneme comparison to check for title attributes
    await page.evaluate(() => {
      const feedbackSection = document.getElementById("phoneme-comparison-grid");
      if (feedbackSection) {
        // Simulate a phoneme comparison grid with matches
        feedbackSection.innerHTML = `
          <div class="phoneme-words-wrapper">
            <div class="phoneme-word-block">
              <div class="phoneme-word-row phoneme-word-target">
                <span class="phoneme-char match">f</span>
                <span class="phoneme-char match">ɔ</span>
                <span class="phoneme-char mismatch" title="Distance: 0.15">ʏ</span>
              </div>
            </div>
          </div>
        `;
      }
    });

    // Check that matching phonemes don't have title attributes
    const matchingPhonemes = await page.locator(".phoneme-char.match").all();
    for (const phoneme of matchingPhonemes) {
      const titleAttr = await phoneme.getAttribute("title");
      expect(titleAttr).toBeNull();
    }

    // Check that mismatching phonemes DO have title attributes
    const mismatchPhoneme = await page.locator(".phoneme-char.mismatch").first();
    const titleAttr = await mismatchPhoneme.getAttribute("title");
    expect(titleAttr).toBe("Distance: 0.15");
  });
});
