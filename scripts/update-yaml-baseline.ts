#!/usr/bin/env tsx
/**
 * Update all YAML files with new WASM Fbank outputs as baseline
 */

import { readAudioFile } from "../src/lib/audio.js";
import { loadPhonemeModel, extractPhonemes } from "../src/lib/phoneme-model.js";
import yaml from "js-yaml";
import fs from "fs";
import path from "path";

function findYamlFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findYamlFiles(fullPath));
    } else if (entry.name.endsWith(".flac.yaml")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  console.log("=== Updating YAML Baseline with WASM Fbank Outputs ===\n");

  // Load model once
  const { session, idToToken } = await loadPhonemeModel();

  // Find all YAML files
  const yamlFiles = findYamlFiles("tests/data");
  console.log(`Found ${yamlFiles.length} YAML files\n`);

  let updated = 0;
  for (const yamlPath of yamlFiles) {
    const audioPath = yamlPath.replace(".yaml", "");

    if (!fs.existsSync(audioPath)) {
      console.log(`⚠ Audio file not found: ${audioPath}`);
      continue;
    }

    // Load existing YAML
    const yamlData = yaml.load(fs.readFileSync(yamlPath, "utf8")) as any;
    const oldIpa = yamlData.recognized_ipa;

    // Extract with new WASM Fbank
    const audio = readAudioFile(audioPath);
    const newIpa = (await extractPhonemes(audio, session, idToToken)) as string;

    // Update if different
    if (oldIpa !== newIpa) {
      yamlData.recognized_ipa = newIpa;
      fs.writeFileSync(yamlPath, yaml.dump(yamlData));

      const shortPath = audioPath.split("/").slice(-3).join("/");
      console.log(`✓ ${shortPath}`);
      console.log(`  ${oldIpa} → ${newIpa}`);
      updated++;
    }
  }

  console.log(`\n✓ Updated ${updated} YAML files`);
  console.log(`  Unchanged: ${yamlFiles.length - updated}`);
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
