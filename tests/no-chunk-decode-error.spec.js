import fs from "fs";
import yaml from "js-yaml";
import path from "path";
import { expect, test } from "./fixtures.js";

/**
 * Test to ensure RealTimePhonemeDetector works correctly with AudioWorklet Float32Array chunks.
 * With AudioWorklet, each chunk is raw PCM data — no Blob decoding is ever needed.
 * This test verifies that no decoding errors occur and the detector extracts correct phonemes.
 */
test.describe("No Individual Chunk Decode Errors", () => {
  test("Should not produce 'Unable to decode audio data' errors during streaming", async ({
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
        const { prepareAudioForModel } = await import("/phoneme-party/src/audio/processor.js");

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
            studyLang: "de-DE",
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

        // Decode FLAC to Float32 PCM (simulating what AudioWorklet delivers)
        const fullBlob = new Blob([new Uint8Array(audioData)], { type: "audio/flac" });
        const fullAudio = await prepareAudioForModel(fullBlob);

        // Split Float32Array into 8 equal chunks (simulating AudioWorklet batches)
        const numChunks = 8;
        const chunkLength = Math.floor(fullAudio.length / numChunks);
        const chunks = [];
        for (let i = 0; i < numChunks; i++) {
          const start = i * chunkLength;
          const end = i === numChunks - 1 ? fullAudio.length : start + chunkLength;
          chunks.push(fullAudio.slice(start, end));
        }

        console.log(`Processing ${chunks.length} Float32Array chunks...`);

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

        // Filter for any unexpected decode errors
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
    } else {
      console.log(
        "\n✓ No decode errors - AudioWorklet chunks are raw Float32 and need no decoding",
      );
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
    console.log("✓ Detector successfully processes Float32Array chunks directly");

    // Assertions
    expect(result.decodeErrors.length).toBe(0);
    expect(externalDecodeErrors.length).toBe(0);
    expect(result.detectorSimilarity).toBeGreaterThanOrEqual(0.85);
    expect(result.phonemeUpdates).toBeGreaterThan(0);
  });
});
