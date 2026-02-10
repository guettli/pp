import { test, expect } from "@playwright/test";

/**
 * Test that RealTimePhonemeDetector doesn't break phoneme extraction
 *
 * BUG: The RealTimePhonemeDetector processes audio chunks in real-time,
 * but this may interfere with the final phoneme extraction
 */
test.describe("RealTimePhonemeDetector Bug", () => {
  test("should detect if RealTimePhonemeDetector breaks extraction", async ({ page, browser }) => {
    console.log("\n=== Testing RealTimePhonemeDetector Impact ===\n");

    // Open app
    await page.goto("/");
    await page.locator("#loading-overlay").waitFor({ state: "hidden", timeout: 180000 });

    console.log("✓ App loaded\n");

    // Inject test code that simulates what happens during recording
    const result = await page.evaluate(async () => {
      // Import the detector
      const { RealTimePhonemeDetector } = await import(
        "/src/speech/realtime-phoneme-detector.js"
      );
      const { prepareAudioForWhisper } = await import("/src/audio/processor.js");
      const { extractPhonemes } = await import("/src/speech/phoneme-extractor.js");

      const results = {
        detectorCreated: false,
        audioContextsCreated: 0,
        chunkProcessingErrors: [],
        detectorError: null,
      };

      try {
        // Create detector (like in handleRecordStart)
        const detector = new RealTimePhonemeDetector(
          {
            targetIPA: "test",
            threshold: 1.0,
            minChunksBeforeCheck: 2,
            silenceThreshold: 0.01,
            silenceDuration: 1500,
          },
          {
            onPhonemeUpdate: (phonemes, similarity) => {
              console.log(`Real-time: ${phonemes} (${similarity})`);
            },
            onSilenceDetected: () => {
              console.log("Silence detected");
            },
          },
        );

        results.detectorCreated = true;

        // Create a dummy audio chunk (simulating MediaRecorder output)
        // This is WebM format, 500ms chunk
        const dummyChunk = new Blob([new Uint8Array(8192)], { type: "audio/webm" });

        // Try to process it (this is what happens in the onDataAvailable callback)
        try {
          await detector.addChunk(dummyChunk);
          results.chunkProcessingErrors.push("No error - but probably wrong");
        } catch (error) {
          results.chunkProcessingErrors.push(error.message);
        }

        // Try with multiple chunks to see if it accumulates AudioContexts
        for (let i = 0; i < 3; i++) {
          try {
            await detector.addChunk(dummyChunk);
          } catch (error) {
            results.chunkProcessingErrors.push(`Chunk ${i}: ${error.message}`);
          }
        }

        // Check detector state
        results.detectorState = {
          hasMatched: detector.hasTargetMatched(),
          lastPhonemes: detector.getLastPhonemes(),
          lastSimilarity: detector.getLastSimilarity(),
        };
      } catch (error) {
        results.detectorError = error.message;
      }

      return results;
    });

    console.log("Detector created:", result.detectorCreated);
    console.log("Detector error:", result.detectorError);
    console.log("Chunk processing errors:", result.chunkProcessingErrors);
    console.log("Detector state:", result.detectorState);

    // Analysis
    console.log("\n=== Analysis ===");

    if (result.chunkProcessingErrors.length > 0) {
      console.log("\n⚠️ Chunk processing encountered errors:");
      result.chunkProcessingErrors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err}`);
      });
    }

    // The bug: RealTimePhonemeDetector tries to process chunks but:
    // 1. WebM chunks from MediaRecorder can't be decoded individually
    // 2. Each chunk creates an AudioContext for silence detection
    // 3. prepareAudioForWhisper may fail on partial chunks
    // 4. This doesn't affect final detection but wastes resources

    const hasDecodingErrors = result.chunkProcessingErrors.some((err) =>
      err.includes("decode"),
    );

    console.log("\nBUG DETECTION:");
    console.log(`- Decoding errors: ${hasDecodingErrors ? "YES ⚠️" : "NO ✓"}`);
    console.log(`- Error count: ${result.chunkProcessingErrors.length}`);

    if (hasDecodingErrors) {
      console.log("\n🐛 BUG CONFIRMED:");
      console.log("RealTimePhonemeDetector cannot decode WebM chunks individually.");
      console.log("WebM format requires the full file to decode, not individual chunks.");
      console.log("\nThis means:");
      console.log("- Real-time phoneme detection doesn't work");
      console.log("- Silence detection may fail");
      console.log("- Only final detection (after recording stops) works");
    }

    // Expect errors - this confirms the bug
    expect(result.chunkProcessingErrors.length).toBeGreaterThan(0);
    expect(hasDecodingErrors).toBe(true);
  });
});
