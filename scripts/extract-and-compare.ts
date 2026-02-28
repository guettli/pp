#!/usr/bin/env tsx
// Extract phonemes from audio and compare with expected IPA
// Usage: tsx scripts/extract-and-compare.ts <flac-yaml-file>
//    OR: tsx scripts/extract-and-compare.ts <audio-file> <phrase> <lang>

import fs from "fs";
import yaml from "js-yaml";
import { readAudioFile } from "../src/lib/audio.js";
import { extractPhonemes, loadPhonemeModel } from "../src/lib/phoneme-model.js";
import { getExpectedIPA } from "../src/lib/phrase-data.js";
import { calculatePanPhonDistance } from "../tests/panphon-distance-node.js";

function printHelp() {
  console.log(`Usage: ./run tsx scripts/extract-and-compare.ts <flac-yaml-file>
      OR ./run tsx scripts/extract-and-compare.ts <audio-file> <phrase> <lang>

Extract IPA phonemes from audio and compare with expected IPA from phrase data.

Arguments:
  <flac-yaml-file>    Path to a .flac.yaml metadata file
  <audio-file>        Path to an audio file (.flac, .wav, etc.)
  <phrase>            The phrase being pronounced
  <lang>              Language code (e.g., de-DE, en-GB)

Options:
  -h, --help          Show this help message

Examples:
  ./run tsx scripts/extract-and-compare.ts tests/data/de-DE/Flugzeug/Flugzeug-Thomas2.flac.yaml
  ./run tsx scripts/extract-and-compare.ts audio.flac "Der Regen" de-DE

Output:
  JSON with phrase info, recognized IPA, expected IPA, and similarity scores.
`);
}

async function main() {
  const args = process.argv.slice(2);

  // Handle help flags
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printHelp();
    process.exit(args.length === 0 ? 1 : 0);
  }

  let audioFile: string;
  let phrase: string;
  let lang: string;
  let metadata: {
    phrase: string;
    lang: string;
    source?: string;
    recognized_ipa?: string;
    similarity?: number;
  } | null = null;

  // Check if this is the YAML mode or direct mode
  if (args.length === 1) {
    // YAML mode
    const yamlFile = args[0];

    if (!fs.existsSync(yamlFile)) {
      console.error(`Error: YAML file not found: ${yamlFile}`);
      console.error("\nRun with -h or --help for usage information.");
      process.exit(1);
    }

    if (!yamlFile.endsWith(".yaml") && !yamlFile.endsWith(".yml")) {
      console.error(`Error: Input file must be a .yaml or .yml file: ${yamlFile}`);
      console.error("\nRun with -h or --help for usage information.");
      process.exit(1);
    }

    // Read YAML metadata
    const yamlContent = fs.readFileSync(yamlFile, "utf8");
    metadata = yaml.load(yamlContent) as {
      phrase: string;
      lang: string;
      source?: string;
      recognized_ipa?: string;
      similarity?: number;
    };

    if (!metadata.phrase || !metadata.lang) {
      console.error(`Error: YAML file must contain 'phrase' and 'lang' fields`);
      process.exit(1);
    }

    phrase = metadata.phrase;
    lang = metadata.lang;
    audioFile = yamlFile.replace(/\.yaml$/, "");
  } else if (args.length === 3) {
    // Direct mode: audio file, phrase, lang
    audioFile = args[0];
    phrase = args[1];
    lang = args[2];
  } else {
    console.error(`Error: Invalid number of arguments`);
    console.error("\nRun with -h or --help for usage information.");
    process.exit(1);
  }

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
      const result = calculatePanPhonDistance(expectedIPA, recognizedIPA, lang);
      similarity = result.similarity.toFixed(2);
    } catch (error) {
      // phrase not found in phrase data - this is OK for new phrases
      console.error(
        "Note: phrase not found in phrase data (this is OK for new phrases):",
        (error as Error).message,
      );
    }

    // Output results
    const output: {
      phrase: string;
      lang: string;
      source?: string;
      audio_file: string;
      recognized_ipa: string;
      previous_ipa?: string;
      expected_ipa?: string;
      similarity?: string;
      previous_similarity?: number;
    } = {
      phrase,
      lang,
      audio_file: audioFile,
      recognized_ipa: recognizedIPA,
    };

    if (metadata?.source) {
      output.source = metadata.source;
    }

    if (metadata?.recognized_ipa) {
      output.previous_ipa = metadata.recognized_ipa;
    }

    if (metadata && metadata.similarity !== undefined) {
      output.previous_similarity = metadata.similarity;
    }

    if (expectedIPA) {
      output.expected_ipa = expectedIPA;
    }

    if (similarity) {
      output.similarity = similarity;
    }

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.error("Error:", (error as Error).message);
    process.exit(1);
  }
}

main();
