import { test, expect } from "./fixtures.js";
import path from "path";
import fs from "fs";
import yaml from "js-yaml";

/**
 * Test to check if RealTimePhonemeDetector has enough time to process chunks before recording stops.
 * The bug: chunks are added quickly, but processing is async and slow, so by the time recording stops,
 * the detector hasn't processed anything yet. This causes the fallback to always be used.
 */
test.describe("Streaming Timing Bug", () => {
  test("Detector should have processed chunks before recording completes", async ({
    modelPage: page,
  }) => {
    // Load test data
    const yamlPath = path.join(
      process.cwd(),
      "tests/data/de-DE/Die_Rose/Die_Rose-Thomas.flac.yaml",
    );
    const yamlContent = fs.readFileSync(yamlPath, "utf8");
    const expectedData = yaml.load(yamlContent);

    const expectedIPA = expectedData.recognized_ipa;
    const phrase = expectedData.phrase;

    console.log(`\nTesting: ${phrase}`);
    console.log(`Expected IPA: ${expectedIPA}\n`);

    // Load audio file
    const audioPath = path.join(process.cwd(), "tests/data/de-DE/Die_Rose/Die_Rose-Thomas.flac");
    const audioBuffer = fs.readFileSync(audioPath);

    // Simulate the EXACT flow from main.ts: create detector, add chunks quickly, then immediately check results
    const result = await page.evaluate(
      async ({ audioData, targetIPA }) => {
        const { RealTimePhonemeDetector } =
          await import("/phoneme-party/src/speech/realtime-phoneme-detector.js");

        let phonemeUpdates = [];

        // Create detector (line 351 in main.ts)
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
              phonemeUpdates.push({ phonemes, similarity, timestamp: Date.now() });
            },
          },
        );

        const startTime = Date.now();

        // Simulate MediaRecorder adding chunks every 500ms
        const fullBlob = new Blob([new Uint8Array(audioData)], { type: "audio/flac" });
        const chunkSize = Math.floor(audioData.length / 4); // 4 chunks ~= 2 seconds of recording
        const chunks = [];

        for (let i = 0; i < audioData.length; i += chunkSize) {
          const fragmentData = audioData.slice(i, i + chunkSize);
          const fragmentBlob = new Blob([new Uint8Array(fragmentData)], { type: "audio/flac" });
          chunks.push(fragmentBlob);
        }

        // Add chunks with realistic timing (500ms between chunks, like MediaRecorder does)
        for (let i = 0; i < chunks.length; i++) {
          const chunkTime = Date.now();
          console.log(`Adding chunk ${i + 1}/${chunks.length} at t=${chunkTime - startTime}ms`);

          // Don't await - just fire and forget like the real app does (line 392 in main.ts)
          // The real code does: void realtimeDetector.addChunk(chunk);
          void detector.addChunk(chunks[i]);

          // Wait 500ms before next chunk (simulating MediaRecorder timeslice)
          if (i < chunks.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }

        const chunksAddedTime = Date.now();
        console.log(`All chunks added at t=${chunksAddedTime - startTime}ms`);

        // This simulates what happens in actuallyStopRecording (line 566):
        // Recording stops, and we immediately check if detector has results
        const immediateIPA = detector.getLastPhonemes();
        const immediateSimilarity = detector.getLastSimilarity();

        console.log(`Immediate check: IPA="${immediateIPA}", similarity=${immediateSimilarity}`);

        // Wait a bit to see if detector processes chunks after we've checked
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const afterWaitIPA = detector.getLastPhonemes();
        const afterWaitSimilarity = detector.getLastSimilarity();

        console.log(`After wait: IPA="${afterWaitIPA}", similarity=${afterWaitSimilarity}`);

        return {
          immediateIPA,
          immediateSimilarity,
          afterWaitIPA,
          afterWaitSimilarity,
          phonemeUpdates,
          timingMs: {
            chunksAdded: chunksAddedTime - startTime,
            firstUpdate: phonemeUpdates.length > 0 ? phonemeUpdates[0].timestamp - startTime : null,
          },
        };
      },
      { audioData: Array.from(audioBuffer), targetIPA: expectedIPA },
    );

    console.log("\n=== TIMING ANALYSIS ===");
    console.log(`Chunks added at: t=${result.timingMs.chunksAdded}ms`);
    console.log(`First phoneme update: t=${result.timingMs.firstUpdate}ms`);

    console.log(`\nImmediate check (when recording stops):`);
    console.log(`  IPA: "${result.immediateIPA}"`);
    console.log(`  Similarity: ${result.immediateSimilarity}`);

    console.log(`\nAfter waiting 2 seconds:`);
    console.log(`  IPA: "${result.afterWaitIPA}"`);
    console.log(`  Similarity: ${result.afterWaitSimilarity}`);

    console.log(`\nPhoneme updates: ${result.phonemeUpdates.length}`);

    if (result.immediateIPA === "" && result.afterWaitIPA !== "") {
      console.log("\n🐛 BUG DETECTED: Timing issue!");
      console.log("The detector processes chunks AFTER recording stops and results are checked.");
      console.log(
        "This causes the app to always fall back to post-processing instead of using streaming results.",
      );
      console.log("\nFIX: Ensure detector has processed chunks before checking results,");
      console.log("or wait for detector to complete processing before using results.");
    }

    console.log("\n=== EXPECTED BEHAVIOR ===");
    console.log("✓ Detector should have results immediately when recording stops");
    console.log("✓ Real-time phoneme updates should happen during recording");

    // The bug: immediate check should have results (not empty)
    // After the fix, the detector should have processed at least some chunks by the time we check
    expect(result.immediateIPA).not.toBe("");
    expect(result.phonemeUpdates.length).toBeGreaterThan(0);
    expect(result.timingMs.firstUpdate).not.toBeNull();
    expect(result.timingMs.firstUpdate).toBeLessThan(result.timingMs.chunksAdded);
  });
});
