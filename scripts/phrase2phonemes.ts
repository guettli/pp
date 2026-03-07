#!/usr/bin/env tsx
// Extract phonemes from an audio file
// Usage: tsx scripts/phrase2phonemes.ts <audio-file>

import fs from "fs";
import { readAudioFile } from "./lib/audio.js"; // TODO: fix. this tool
import { extractPhonemes, loadPhonemeModel } from "./lib/phoneme-model.js";

function printHelp() {
  console.log(`Usage: ./run tsx scripts/phrase2phonemes.ts <audio-file>

Extract IPA phonemes from an audio file using the ONNX phoneme model.

Arguments:
  <audio-file>    Path to the audio file (.flac, .wav, etc.)

Options:
  --help          Show this help message

Output:
  JSON with audio_file path and recognized_ipa string.

Example:
  ./run tsx scripts/phrase2phonemes.ts tests/data/de-DE/Brot/Brot-Thomas.flac
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.length < 1) {
    console.error("Usage: tsx scripts/phrase2phonemes.ts <audio-file>");
    console.error("Run with --help for more information.");
    process.exit(1);
  }

  const audioFile = args[0];

  if (!fs.existsSync(audioFile)) {
    console.error(`Error: Audio file not found: ${audioFile}`);
    process.exit(1);
  }

  try {
    // Load model
    const { session, idToToken } = await loadPhonemeModel();

    // Read audio and extract phonemes
    const audioData = readAudioFile(audioFile);
    const recognizedIPA = await extractPhonemes(audioData, session, idToToken);

    // Output as JSON
    console.log(
      JSON.stringify({
        audio_file: audioFile,
        recognized_ipa: recognizedIPA,
      }),
    );
  } catch (error) {
    console.error("Error:", (error as Error).message);
    process.exit(1);
  }
}

main();
