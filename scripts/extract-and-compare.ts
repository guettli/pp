#!/usr/bin/env tsx
// Extract phonemes from audio and compare with expected IPA
// Usage: tsx scripts/extract-and-compare.ts <audio-file> <phrase> <lang>

import fs from "fs";
import { readAudioFile } from "../src/lib/audio.js";
import { extractPhonemes, loadPhonemeModel } from "../src/lib/phoneme-model.js";
import { getExpectedIPA } from "../src/lib/phrase-data.js";
import { calculatePanPhonDistance } from "../tests/panphon-distance-node.js";

async function main() {
  if (process.argv.length < 5) {
    console.error("Usage: tsx scripts/extract-and-compare.ts <audio-file> <phrase> <lang>");
    console.error("Extracts IPA phonemes from audio, and then compares to IPA of given phrase");
    process.exit(1);
  }

  const audioFile = process.argv[2];
  const phrase = process.argv[3];
  const lang = process.argv[4];

  if (!fs.existsSync(audioFile)) {
    console.error(`Error: Audio file not found: ${audioFile}`);
    process.exit(1);
  }

  try {
    const { session, idToToken } = await loadPhonemeModel();
    const audioData = readAudioFile(audioFile);
    const recognizedIPA = (await extractPhonemes(audioData, session, idToToken, {
      returnDetails: false,
    })) as string;

    // Try to get expected IPA, but don't fail if phrase is new
    let expectedIPA: string | null = null;
    let similarity: string | null = null;

    try {
      expectedIPA = getExpectedIPA(phrase, lang);
      const result = calculatePanPhonDistance(expectedIPA, recognizedIPA);
      similarity = result.similarity.toFixed(2);
    } catch (error) {
      // phrase not found in phrase data - this is OK for new phrases
      console.error(
        "Note: phrase not found in phrase data (this is OK for new phrases):",
        (error as Error).message,
      );
    }

    // Output as JSON
    const output: {
      recognized_ipa: string;
      expected_ipa?: string;
      similarity?: string;
    } = {
      recognized_ipa: recognizedIPA,
    };

    if (expectedIPA) {
      output.expected_ipa = expectedIPA;
    }

    if (similarity) {
      output.similarity = similarity;
    }

    console.log(JSON.stringify(output));
  } catch (error) {
    console.error("Error:", (error as Error).message);
    process.exit(1);
  }
}

main();
