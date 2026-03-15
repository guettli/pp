import { expect, test } from "../fixtures.js";
import { loadDieRoseTestData } from "../helpers/streaming-setup.js";

/**
 * Test that RealTimePhonemeDetector correctly processes Float32Array PCM chunks
 * delivered by AudioWorklet. Each chunk is independently usable raw PCM data,
 * so no blob decoding or accumulation tricks are needed.
 */
test.describe("Streaming Chunk Decode Bug", () => {
  test("RealTimePhonemeDetector should process accumulated chunks, not individual fragments", async ({
    modelPage: page,
  }) => {
    const { expectedIPA, phrase, audioBuffer } = loadDieRoseTestData();

    console.log(`\nTesting: ${phrase}`);
    console.log(`Expected IPA: ${expectedIPA}\n`);

    // Test: simulate AudioWorklet-style Float32Array chunks
    const result = await page.evaluate(
      async ({ audioData, targetIPA }) => {
        const { RealTimePhonemeDetector } =
          await import("/phoneme-party/src/speech/realtime-phoneme-detector.js");
        const { prepareAudioForModel } = await import("/phoneme-party/src/audio/processor.js");

        let phonemeUpdates = [];
        let chunkProcessingErrors = [];

        // Create detector
        const detector = new RealTimePhonemeDetector(
          {
            targetIPA,
            studyLang: "de-DE",
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

        // Decode FLAC to Float32 PCM (simulating AudioWorklet output)
        const fullBlob = new Blob([new Uint8Array(audioData)], { type: "audio/flac" });
        const fullAudio = await prepareAudioForModel(fullBlob);

        // Split into 8 equal Float32Array chunks
        const numChunks = 8;
        const chunkLength = Math.floor(fullAudio.length / numChunks);
        const chunks = [];
        for (let i = 0; i < numChunks; i++) {
          const start = i * chunkLength;
          const end = i === numChunks - 1 ? fullAudio.length : start + chunkLength;
          chunks.push(fullAudio.slice(start, end));
        }

        console.log(`Created ${chunks.length} Float32Array chunks`);

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
    }

    console.log(`\nDetector IPA: ${result.detectorIPA}`);
    console.log(`Detector similarity: ${result.detectorSimilarity}`);
    console.log(`Phoneme updates: ${result.phonemeUpdates.length}`);

    // Expected behavior with AudioWorklet Float32Array chunks
    console.log("\n=== EXPECTED BEHAVIOR ===");
    console.log("✓ No chunk processing errors");
    console.log("✓ Detector successfully extracts phonemes from accumulated Float32Array chunks");
    console.log("✓ At least one phoneme update callback is triggered");

    // Assertions
    expect(result.chunkProcessingErrors.length).toBe(0);
    expect(result.detectorIPA).toBe(expectedIPA);
    expect(result.phonemeUpdates.length).toBeGreaterThan(0);
  });
});
