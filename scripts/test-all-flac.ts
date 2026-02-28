#!/usr/bin/env tsx
/**
 * Test IPA extraction on all FLAC files in tests/data/
 * Uses the float32 ONNX model.
 *
 * Usage: ./run tsx scripts/test-all-flac.ts [options] [pattern]
 *
 * Options:
 *   --list, -l     List all audio files without processing
 *   --update, -u   Update YAML files with new IPA values
 *   --help, -h     Show help message
 *
 * Pattern:
 *   Filter by phrase name (case-insensitive, supports * wildcard)
 */

import fs from "fs";
import path from "path";
import { parseArgs } from "util";
import { MODEL_NAME, HF_REPO } from "../src/lib/model-config.js";
import { CACHE_DIR, downloadIfNeeded, runTestSuite } from "./lib/flac-test-core.js";

const MODEL_URL = `https://huggingface.co/${HF_REPO}/resolve/main/model.onnx`;
const VOCAB_URL = `https://huggingface.co/${HF_REPO}/resolve/main/tokens.txt`;
const LOCAL_MODEL = path.join(CACHE_DIR, `${MODEL_NAME}.onnx`);
const LOCAL_VOCAB = path.join(CACHE_DIR, `${MODEL_NAME}.vocab.json`);

async function downloadModelFiles(): Promise<{ modelPath: string; vocabPath: string }> {
  const modelPath = fs.existsSync(LOCAL_MODEL)
    ? LOCAL_MODEL
    : await downloadIfNeeded(MODEL_URL, `${MODEL_NAME}.onnx`);

  if (!fs.existsSync(LOCAL_VOCAB)) {
    console.log("Downloading tokens.txt...");
    const response = await fetch(VOCAB_URL);
    if (!response.ok) throw new Error(`Failed to download vocab: ${response.status}`);
    const text = await response.text();
    const vocab: Record<string, number> = {};
    for (const line of text.split("\n")) {
      const parts = line.trim().split(" ");
      if (parts.length === 2) vocab[parts[0]] = parseInt(parts[1], 10);
    }
    fs.writeFileSync(LOCAL_VOCAB, JSON.stringify(vocab));
  }

  return { modelPath, vocabPath: LOCAL_VOCAB };
}

function printHelp(): void {
  console.log(`Usage: ./run tsx scripts/test-all-flac.ts [options] [pattern]

Options:
  --list, -l     List all audio files without processing
  --update, -u   Update YAML files with new IPA values
  --help, -h     Show help message

Pattern:
  Filter by phrase name (case-insensitive, supports * wildcard)

Examples:
  ./run tsx scripts/test-all-flac.ts              # Test all FLAC files
  ./run tsx scripts/test-all-flac.ts --update     # Update all YAML files
  ./run tsx scripts/test-all-flac.ts Wasser       # Test "Wasser" only
  ./run tsx scripts/test-all-flac.ts "Sch*"       # Test matching "Sch*"
`);
}

async function main(): Promise<void> {
  let values: { list?: boolean; help?: boolean; update?: boolean };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: process.argv.slice(2),
      options: {
        list: { type: "boolean", short: "l" },
        help: { type: "boolean", short: "h" },
        update: { type: "boolean", short: "u" },
      },
      allowPositionals: true,
      strict: true,
    }));
  } catch (e) {
    console.error((e as Error).message);
    console.error("Run with --help for usage.");
    process.exit(1);
  }

  if (values.help) {
    printHelp();
    return;
  }

  await runTestSuite({
    downloadModelFiles,
    updateYaml: values.update ?? false,
    pattern: positionals[0] || "*",
    showList: values.list ?? false,
  });
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
