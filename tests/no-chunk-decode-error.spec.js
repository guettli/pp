import { test, expect } from "./fixtures.js";
import path from "path";
import fs from "fs";
import yaml from "js-yaml";

/**
 * Test to ensure RealTimePhonemeDetector doesn't try to decode individual chunks.
 * This was causing "Error calculating RMS: EncodingError: Unable to decode audio data" errors.
 *
 * The bug: checkSilence() tried to decode individual MediaRecorder chunks to calculate RMS,
 * but MediaRecorder chunks are streaming fragments that can't be decoded individually.
 *
 * The fix: Only check for silence on successfully decoded accumulated audio, not on individual chunks.
 */
test.describe("No Individual Chunk Decode Errors", () => {
  test("Should not produce 'Unable to decode audio data' errors during streaming", async ({
    modelPage: page,
  }) => {
    // Load test data
    const yamlPath = path.join(process.cwd(), "tests/data/de/Die_Rose/Die_Rose-Thomas.flac.yaml");
    const yamlContent = fs.readFileSync(yamlPath, "utf8");
    const expectedData = yaml.load(yamlContent);

    const expectedIPA = expectedData.recognized_ipa;
    const phrase = expectedData.phrase;

    console.log(`\nTesting: ${phrase}`);
    console.log(`Expected IPA: ${expectedIPA}\n`);

    // Load audio file
    const audioPath = path.join(process.cwd(), "tests/data/de/Die_Rose/Die_Rose-Thomas.flac");
    const audioBuffer = fs.readFileSync(audioPath);

    // Capture console errors (model already loaded via modelPage fixture)
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Process audio through detector
    const result = await page.evaluate(
      async ({ audioData, targetIPA }) => {
        const { RealTimePhonemeDetector } =
          await import("/phoneme-party/src/speech/realtime-phoneme-detector.js");

        // Track console errors within the page context
        const pageErrors = [];
        const originalError = console.error;
        console.error = (...args) => {
          const errorMsg = args.join(" ");
          pageErrors.push(errorMsg);
          originalError.apply(console, args);
        };

        let phonemeUpdates = [];

        // Create detector
        const detector = new RealTimePhonemeDetector(
          {
            targetIPA,
            threshold: 1.0,
            minChunksBeforeCheck: 3,
            silenceThreshold: 0.01,
            silenceDuration: 1500,
          },
          {
            onPhonemeUpdate: (phonemes, similarity) => {
              console.log(`Real-time update: ${phonemes} (similarity: ${similarity})`);
              phonemeUpdates.push({ phonemes, similarity });
            },
          },
        );

        // Simulate MediaRecorder chunks
        const fullBlob = new Blob([new Uint8Array(audioData)], { type: "audio/flac" });
        const chunkSize = Math.floor(audioData.length / 8);
        const chunks = [];

        for (let i = 0; i < audioData.length; i += chunkSize) {
          const fragmentData = audioData.slice(i, i + chunkSize);
          const fragmentBlob = new Blob([new Uint8Array(fragmentData)], { type: "audio/flac" });
          chunks.push(fragmentBlob);
        }

        console.log(`Processing ${chunks.length} chunks...`);

        // Process chunks through detector
        for (let i = 0; i < chunks.length; i++) {
          await detector.addChunk(chunks[i]);
          // Small delay to simulate real-time recording
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        // Wait a bit for any async operations to complete
        await new Promise((resolve) => setTimeout(resolve, 500));

        const detectorIPA = detector.getLastPhonemes();
        const detectorSimilarity = detector.getLastSimilarity();

        // Filter for RMS/decode errors
        const decodeErrors = pageErrors.filter(
          (err) =>
            err.includes("Error calculating RMS") ||
            err.includes("Unable to decode audio data") ||
            err.includes("EncodingError"),
        );

        // Restore original console.error
        console.error = originalError;

        return {
          chunkCount: chunks.length,
          detectorIPA,
          detectorSimilarity,
          phonemeUpdates: phonemeUpdates.length,
          decodeErrors,
        };
      },
      { audioData: Array.from(audioBuffer), targetIPA: expectedIPA },
    );

    console.log("\n=== RESULTS ===");
    console.log(`Chunks processed: ${result.chunkCount}`);
    console.log(`Detector IPA: ${result.detectorIPA}`);
    console.log(`Detector similarity: ${result.detectorSimilarity}`);
    console.log(`Phoneme updates: ${result.phonemeUpdates}`);
    console.log(`Decode errors: ${result.decodeErrors.length}`);

    if (result.decodeErrors.length > 0) {
      console.log("\n🐛 BUG: Found decode errors:");
      result.decodeErrors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err}`);
      });
      console.log("\nRoot cause: RealTimePhonemeDetector is trying to decode individual chunks.");
      console.log("Fix: Only decode accumulated chunks, not individual fragments.");
    } else {
      console.log("\n✓ No decode errors - detector correctly processes accumulated chunks only");
    }

    // Also check for errors captured by page.on('console')
    const externalDecodeErrors = consoleErrors.filter(
      (err) =>
        err.includes("Error calculating RMS") ||
        err.includes("Unable to decode audio data") ||
        err.includes("EncodingError"),
    );

    if (externalDecodeErrors.length > 0) {
      console.log(`\n🐛 Found ${externalDecodeErrors.length} external decode errors`);
    }

    console.log("\n=== EXPECTED BEHAVIOR ===");
    console.log("✓ No 'Unable to decode audio data' errors");
    console.log("✓ No 'Error calculating RMS' errors");
    console.log("✓ Detector successfully processes accumulated chunks");
    console.log("✓ Silence detection (if any) works on decoded audio, not individual chunks");

    // Assertions
    expect(result.decodeErrors.length).toBe(0);
    expect(externalDecodeErrors.length).toBe(0);
    expect(result.detectorIPA).toBe(expectedIPA);
    expect(result.phonemeUpdates).toBeGreaterThan(0);
  });
});
