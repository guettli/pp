#!/usr/bin/env tsx
// CLI: print frame-by-frame phoneme predictions to stdout
// Usage: ./run scripts/show-frames.ts <yaml-file>

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { readAudioFile } from "../src/lib/audio.js";
import { loadPhonemeModel, extractPhonemesDetailed } from "../src/lib/phoneme-model.js";
import { buildFrameText } from "../src/ui/model-details-view.js";

function printHelp() {
  console.log(`Usage: ./run tsx scripts/show-frames.ts <flac-or-yaml-file>

Print frame-by-frame phoneme predictions to stdout for a test recording.
Shows the top model predictions at each audio frame, useful for debugging
phoneme extraction and understanding model behavior.

Arguments:
  <flac-or-yaml-file>    Path to a .flac or .flac.yaml test recording file

Options:
  --help                 Show this help message

Example:
  ./run tsx scripts/show-frames.ts tests/data/de-DE/Der_Panda/Der_Panda-Thomas.flac.yaml
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const yamlFile = args[0];

  if (!yamlFile) {
    console.error("Usage: tsx scripts/show-frames.ts <flac-or-yaml-file>");
    console.error("Run with --help for more information.");
    process.exit(1);
  }

  // Accept either a .flac file or a .flac.yaml file
  const resolvedYamlFile = yamlFile.endsWith(".yaml") ? yamlFile : yamlFile + ".yaml";

  if (!fs.existsSync(resolvedYamlFile)) {
    console.error(`File not found: ${resolvedYamlFile}`);
    process.exit(1);
  }

  const content = fs.readFileSync(resolvedYamlFile, "utf8");
  const yamlData = yaml.load(content) as { phrase?: string; lang?: string };

  const flacFile = resolvedYamlFile.replace(".yaml", "");
  if (!fs.existsSync(flacFile)) {
    console.error(`Audio file not found: ${flacFile}`);
    process.exit(1);
  }

  console.error(`Loading model...`);
  const { session, idToToken } = await loadPhonemeModel();

  console.error(`Processing audio: ${path.basename(flacFile)}`);
  const audioData = readAudioFile(flacFile);
  const audioDuration = audioData.length / 16000;

  const detailedPhonemes = await extractPhonemesDetailed(audioData, session, idToToken);

  console.log(`Phrase:   ${yamlData.phrase ?? "(unknown)"}`);
  console.log(`IPA:      ${detailedPhonemes.phonemes}`);
  console.log(`Duration: ${audioDuration.toFixed(2)}s`);
  console.log(`Frames:   ${detailedPhonemes.raw.frames}`);
  console.log("");
  console.log(buildFrameText(detailedPhonemes.raw.frameData));
  console.log("");
  console.log(`IPA:      ${detailedPhonemes.phonemes}`);
}

main();
