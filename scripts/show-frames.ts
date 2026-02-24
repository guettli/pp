#!/usr/bin/env tsx
// CLI: print frame-by-frame phoneme predictions to stdout
// Usage: ./run scripts/show-frames.ts <yaml-file>

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { readAudioFile } from "../src/lib/audio.js";
import { loadPhonemeModel, extractPhonemesDetailed } from "../src/lib/phoneme-model.js";
import { buildFrameText } from "../src/ui/model-details-view.js";

async function main() {
  const yamlFile = process.argv[2];

  if (!yamlFile) {
    console.error("Usage: tsx scripts/show-frames.ts <yaml-file>");
    console.error(
      "Example: ./run scripts/show-frames.ts tests/data/de/Der_Panda/Der_Panda-Thomas.flac.yaml",
    );
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
}

main();
