import fs from "fs";
import yaml from "js-yaml";
import path from "path";
import { expect, test } from "./fixtures.js";

/**
 * Test that compares direct extraction vs streaming detection
 * to identify if RealTimePhonemeDetector affects final results
 */
test.describe("Streaming vs Direct Detection", () => {
  test("Die_Rose-Thomas.flac: streaming should match direct extraction", async ({
    modelPage: page,
  }) => {
    // Load expected data
    const yamlPath = path.join(
      process.cwd(),
      "tests/data/de-DE/Die_Rose/Die_Rose-Thomas.flac.yaml",
    );
    const yamlContent = fs.readFileSync(yamlPath, "utf8");
    const expectedData = yaml.load(yamlContent);

    const expectedIPA = expectedData.recognized_ipa; // diːhiːəɾoːzə
    const phrase = expectedData.phrase;

    console.log(`\nTesting: ${phrase}`);
    console.log(`Expected IPA: ${expectedIPA}\n`);

    // Load audio file
    const audioPath = path.join(process.cwd(), "tests/data/de-DE/Die_Rose/Die_Rose-Thomas.flac");
    const audioBuffer = fs.readFileSync(audioPath);

    // Test 1: Direct extraction (no streaming)
    // Use window.__app_extractPhonemes if available, otherwise skip direct test
    const directResult = await page.evaluate(
      async ({ audioData }) => {
        // Access the app's loaded extractPhonemes via exposed global
        // We'll add this to main.ts for testing
        if (!window.__test_api) {
          return { ipa: "SKIP", error: "Test API not available" };
        }

        const { prepareAudioForModel } = await import("/phoneme-party/src/audio/processor.js");

        const blob = new Blob([new Uint8Array(audioData)], { type: "audio/flac" });
        const audioFloat32 = await prepareAudioForModel(blob);
        const ipa = await window.__test_api.extractPhonemes(audioFloat32);

        return { ipa };
      },
      { audioData: Array.from(audioBuffer) },
    );

    console.log(`Direct extraction: ${directResult.ipa}`);

    // Test 2: Simulate actual recording flow with RealTimePhonemeDetector
    const streamingResult = await page.evaluate(
      async ({ audioData, targetIPA }) => {
        if (!window.__test_api) {
          return {
            autoStopTriggered: false,
            autoStopReason: null,
            detectorIPA: "SKIP",
            detectorSimilarity: 0,
            finalIPA: "SKIP",
            chunkErrors: [],
            chunkCount: 0,
            error: "Test API not available",
          };
        }

        const { RealTimePhonemeDetector } =
          await import("/phoneme-party/src/speech/realtime-phoneme-detector.js");
        const { prepareAudioForModel } = await import("/phoneme-party/src/audio/processor.js");

        let autoStopTriggered = false;
        let autoStopReason = null;

        // Create detector just like in handleRecordStart
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
            onTargetMatched: () => {
              autoStopTriggered = true;
              autoStopReason = "target_matched";
            },
            onSilenceDetected: () => {
              autoStopTriggered = true;
              autoStopReason = "silence";
            },
            onPhonemeUpdate: (phonemes, similarity) => {
              console.log(`Real-time update: ${phonemes} (similarity: ${similarity})`);
            },
          },
        );

        // Decode FLAC to Float32 PCM (simulating AudioWorklet output)
        const fullBlob = new Blob([new Uint8Array(audioData)], { type: "audio/flac" });
        const fullAudio = await prepareAudioForModel(fullBlob);

        // Split into 8 equal Float32Array chunks (simulating AudioWorklet batches)
        const numChunks = 8;
        const chunkLength = Math.floor(fullAudio.length / numChunks);
        const chunks = [];
        for (let i = 0; i < numChunks; i++) {
          const start = i * chunkLength;
          const end = i === numChunks - 1 ? fullAudio.length : start + chunkLength;
          chunks.push(fullAudio.slice(start, end));
        }

        // Process chunks through detector (like in onDataAvailable callback)
        const chunkErrors = [];
        for (let i = 0; i < chunks.length; i++) {
          try {
            await detector.addChunk(chunks[i]);
          } catch (error) {
            chunkErrors.push({ chunk: i, error: error.message });
          }
        }

        // Get detector's final result (like +page.svelte does)
        const detectorIPA = detector.getLastPhonemes();
        const detectorSimilarity = detector.getLastSimilarity();

        // Also do direct extraction of full audio (for comparison)
        const finalIPA = await window.__test_api.extractPhonemes(fullAudio);

        return {
          autoStopTriggered,
          autoStopReason,
          detectorIPA,
          detectorSimilarity,
          finalIPA,
          chunkErrors,
          chunkCount: chunks.length,
        };
      },
      { audioData: Array.from(audioBuffer), targetIPA: expectedIPA },
    );

    console.log("\n=== STREAMING SIMULATION ===");
    console.log(`Chunks processed: ${streamingResult.chunkCount}`);
    console.log(`Chunk errors: ${streamingResult.chunkErrors.length}`);
    if (streamingResult.chunkErrors.length > 0) {
      console.log("Errors:", streamingResult.chunkErrors);
    }
    console.log(`Auto-stop triggered: ${streamingResult.autoStopTriggered}`);
    console.log(`Auto-stop reason: ${streamingResult.autoStopReason}`);
    console.log(`Detector IPA: ${streamingResult.detectorIPA}`);
    console.log(`Detector similarity: ${streamingResult.detectorSimilarity}`);
    console.log(`Final IPA (full blob): ${streamingResult.finalIPA}`);

    console.log("\n=== COMPARISON ===");
    console.log(`Expected:  ${expectedIPA}`);
    console.log(`Direct:    ${directResult.ipa}`);
    console.log(`Detector:  ${streamingResult.detectorIPA}`);
    console.log(`Final:     ${streamingResult.finalIPA}`);

    // The bug test: all three should match
    const directMatches = directResult.ipa === expectedIPA;
    const detectorMatches = streamingResult.detectorIPA === expectedIPA;
    const finalMatches = streamingResult.finalIPA === expectedIPA;

    console.log("\n=== BUG DETECTION ===");
    console.log(`Direct matches expected:   ${directMatches ? "✓" : "✗"}`);
    console.log(`Detector matches expected: ${detectorMatches ? "✓" : "✗"}`);
    console.log(`Final matches expected:    ${finalMatches ? "✓" : "✗"}`);

    if (!directMatches || !detectorMatches || !finalMatches) {
      console.log("\n🐛 BUG DETECTED: Streaming detection produces different results");
      console.log("This indicates RealTimePhonemeDetector or chunk processing is broken");
    }

    // All should match expected IPA
    expect(directResult.ipa).toBe(expectedIPA);
    expect(streamingResult.detectorIPA).toBe(expectedIPA);
    expect(streamingResult.finalIPA).toBe(expectedIPA);
  });
});
