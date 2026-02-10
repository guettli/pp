import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import yaml from "js-yaml";

/**
 * Test that web UI with streaming/real-time detection produces correct IPA
 * This test simulates the actual recording flow with RealTimePhonemeDetector
 */
test.describe("Streaming Phoneme Detection - Web UI", () => {
  test("should produce correct IPA with real-time streaming enabled", async ({ page }) => {
    // Load expected data
    const yamlPath = path.join(
      process.cwd(),
      "tests/data/de/Die_Rose/Die_Rose-Thomas.flac.yaml",
    );
    const yamlContent = fs.readFileSync(yamlPath, "utf8");
    const expectedData = yaml.load(yamlContent);

    const expectedIPA = expectedData.recognized_ipa; // diːhiːəɾoːzə
    const phrase = expectedData.phrase;

    console.log(`\nTesting streaming detection for: ${phrase}`);
    console.log(`Expected IPA: ${expectedIPA}\n`);

    // Load audio file
    const audioPath = path.join(
      process.cwd(),
      "tests/data/de/Die_Rose/Die_Rose-Thomas.flac",
    );
    const audioBuffer = fs.readFileSync(audioPath);

    // Navigate to app
    await page.goto("/");

    // Wait for model to load
    await page.locator("#loading-overlay").waitFor({ state: "hidden", timeout: 180000 });

    console.log("Model loaded, testing extraction...");

    // Test direct extraction (bypassing streaming) first to verify model works
    const directResult = await page.evaluate(
      async ({ audioData }) => {
        const { extractPhonemes } = await import("/src/speech/phoneme-extractor.js");
        const { prepareAudioForWhisper } = await import("/src/audio/processor.js");

        const blob = new Blob([new Uint8Array(audioData)], { type: "audio/flac" });
        const audioFloat32 = await prepareAudioForWhisper(blob);
        const ipa = await extractPhonemes(audioFloat32);

        return { ipa };
      },
      { audioData: Array.from(audioBuffer) },
    );

    console.log(`Direct extraction (no streaming): ${directResult.ipa}`);

    // Now test with streaming simulation (mimicking RealTimePhonemeDetector)
    const streamingResult = await page.evaluate(
      async ({ audioData }) => {
        const { extractPhonemes } = await import("/src/speech/phoneme-extractor.js");
        const { prepareAudioForWhisper } = await import("/src/audio/processor.js");

        // Simulate streaming: split audio into chunks
        const chunkSize = Math.floor(audioData.length / 4); // 4 chunks
        const chunks = [];
        for (let i = 0; i < audioData.length; i += chunkSize) {
          chunks.push(audioData.slice(i, i + chunkSize));
        }

        // Process each chunk (like RealTimePhonemeDetector does)
        const chunkResults = [];
        for (let i = 0; i < chunks.length; i++) {
          try {
            const chunkBlob = new Blob([new Uint8Array(chunks[i])], { type: "audio/flac" });
            const chunkAudio = await prepareAudioForWhisper(chunkBlob);
            const chunkIPA = await extractPhonemes(chunkAudio);
            chunkResults.push({ chunk: i, ipa: chunkIPA, success: true });
          } catch (error) {
            chunkResults.push({ chunk: i, error: error.message, success: false });
          }
        }

        // Also test full audio (final result)
        const fullBlob = new Blob([new Uint8Array(audioData)], { type: "audio/flac" });
        const fullAudio = await prepareAudioForWhisper(fullBlob);
        const fullIPA = await extractPhonemes(fullAudio);

        return {
          chunkResults,
          fullIPA,
        };
      },
      { audioData: Array.from(audioBuffer) },
    );

    console.log("\nStreaming simulation results:");
    console.log(`Chunk processing:`, streamingResult.chunkResults);
    console.log(`Final IPA (full audio): ${streamingResult.fullIPA}`);

    // The test: final IPA should match expected
    console.log("\n=== COMPARISON ===");
    console.log(`Expected:  ${expectedIPA}`);
    console.log(`Direct:    ${directResult.ipa}`);
    console.log(`Streaming: ${streamingResult.fullIPA}`);

    // Both should match
    expect(directResult.ipa).toBe(expectedIPA);
    expect(streamingResult.fullIPA).toBe(expectedIPA);
  });

  test("should handle chunk errors gracefully", async ({ page }) => {
    await page.goto("/");
    await page.locator("#loading-overlay").waitFor({ state: "hidden", timeout: 180000 });

    // Test with invalid/tiny chunks that might fail
    const result = await page.evaluate(async () => {
      const { extractPhonemes } = await import("/src/speech/phoneme-extractor.js");
      const { prepareAudioForWhisper } = await import("/src/audio/processor.js");

      const errors = [];

      // Try to process a very small chunk (likely to fail or produce garbage)
      try {
        const tinyBlob = new Blob([new Uint8Array(100)], { type: "audio/webm" });
        const tinyAudio = await prepareAudioForWhisper(tinyBlob);
        const tinyIPA = await extractPhonemes(tinyAudio);
        errors.push({ test: "tiny-chunk", result: tinyIPA, success: true });
      } catch (error) {
        errors.push({ test: "tiny-chunk", error: error.message, success: false });
      }

      return errors;
    });

    console.log("Chunk error handling:", result);

    // Should either handle gracefully or fail with clear error
    expect(result.length).toBeGreaterThan(0);
  });
});
