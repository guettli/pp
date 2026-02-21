import { test, expect } from "./fixtures.js";
import path from "path";
import fs from "fs";
import yaml from "js-yaml";

/**
 * Test to reproduce the bug where streaming detector doesn't process accumulated chunks correctly.
 * The issue: RealTimePhonemeDetector tries to decode individual chunks, but MediaRecorder chunks
 * are streaming fragments that can't be decoded individually. They need to be accumulated first.
 */
test.describe("Streaming Chunk Decode Bug", () => {
  test("RealTimePhonemeDetector should process accumulated chunks, not individual fragments", async ({
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

    // Test: simulate MediaRecorder-style chunks (fragments of the stream, not complete files)
    const result = await page.evaluate(
      async ({ audioData, targetIPA }) => {
        const { RealTimePhonemeDetector } =
          await import("/src/speech/realtime-phoneme-detector.js");

        let phonemeUpdates = [];
        let chunkProcessingErrors = [];

        // Create detector
        const detector = new RealTimePhonemeDetector(
          {
            targetIPA,
            threshold: 1.0,
            minChunksBeforeCheck: 2,
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

        // Simulate MediaRecorder chunks: split the audio into small fragments
        // These are NOT complete audio files - they're stream fragments
        const fullBlob = new Blob([new Uint8Array(audioData)], { type: "audio/flac" });
        const chunkSize = Math.floor(audioData.length / 8); // 8 small fragments
        const chunks = [];

        for (let i = 0; i < audioData.length; i += chunkSize) {
          const fragmentData = audioData.slice(i, i + chunkSize);
          // Create fragment blob - this simulates what MediaRecorder produces
          const fragmentBlob = new Blob([new Uint8Array(fragmentData)], { type: "audio/flac" });
          chunks.push(fragmentBlob);
        }

        console.log(`Created ${chunks.length} streaming fragments`);

        // Process chunks through detector
        for (let i = 0; i < chunks.length; i++) {
          try {
            await detector.addChunk(chunks[i]);
          } catch (error) {
            console.error(`Error processing chunk ${i}:`, error);
            chunkProcessingErrors.push({
              chunkIndex: i,
              error: error.message,
              stack: error.stack,
            });
          }
        }

        const detectorIPA = detector.getLastPhonemes();
        const detectorSimilarity = detector.getLastSimilarity();

        return {
          chunkCount: chunks.length,
          chunkProcessingErrors,
          detectorIPA,
          detectorSimilarity,
          phonemeUpdates,
        };
      },
      { audioData: Array.from(audioBuffer), targetIPA: expectedIPA },
    );

    console.log("\n=== STREAMING SIMULATION RESULTS ===");
    console.log(`Chunks processed: ${result.chunkCount}`);
    console.log(`Chunk processing errors: ${result.chunkProcessingErrors.length}`);

    if (result.chunkProcessingErrors.length > 0) {
      console.log("\n🐛 BUG DETECTED: Chunk processing errors occurred");
      console.log("First error:", JSON.stringify(result.chunkProcessingErrors[0], null, 2));
      console.log("\nRoot cause: RealTimePhonemeDetector.processAccumulatedAudio() should process");
      console.log(
        "all accumulated chunks together, but the current implementation may have issues.",
      );
    }

    console.log(`\nDetector IPA: ${result.detectorIPA}`);
    console.log(`Detector similarity: ${result.detectorSimilarity}`);
    console.log(`Phoneme updates: ${result.phonemeUpdates.length}`);

    // Expected behavior after fix
    console.log("\n=== EXPECTED BEHAVIOR ===");
    console.log("✓ No chunk processing errors");
    console.log("✓ Detector successfully extracts phonemes from accumulated chunks");
    console.log("✓ At least one phoneme update callback is triggered");

    // Assertions - this test should pass after the bug is fixed
    expect(result.chunkProcessingErrors.length).toBe(0);
    expect(result.detectorIPA).toBe(expectedIPA);
    expect(result.phonemeUpdates.length).toBeGreaterThan(0);
  });
});
