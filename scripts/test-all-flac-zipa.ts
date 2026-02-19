#!/usr/bin/env tsx
/**
 * Test IPA extraction on all FLAC files in tests/data/
 * Runs in parallel for fast processing
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
 *
 * Examples:
 *   ./run tsx scripts/test-all-flac.ts              # Test all FLAC files
 *   ./run tsx scripts/test-all-flac.ts --update     # Update all YAML files
 *   ./run tsx scripts/test-all-flac.ts Wasser       # Test "Wasser" only
 *   ./run tsx scripts/test-all-flac.ts "Sch*"       # Test matching "Sch*"
 */

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { Worker } from "worker_threads";
import yaml from "js-yaml";
import { MODEL_NAME, HF_REPO } from "../src/lib/model-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

// Model configuration - ZIPA INT8
const MODEL_URL = `https://huggingface.co/${HF_REPO}/resolve/main/model.int8.onnx`;
const VOCAB_URL = `https://huggingface.co/${HF_REPO}/resolve/main/tokens.txt`;

// Cache directory
const XDG_CACHE_HOME = process.env.XDG_CACHE_HOME || path.join(process.env.HOME!, ".cache");
const CACHE_DIR = path.join(XDG_CACHE_HOME, "phoneme-party", "models");
const DATA_DIR = path.join(PROJECT_ROOT, "tests", "data");

interface AudioFile {
  path: string;
  metadataPath: string;
  metadata: Record<string, any> | null;
  phrase: string;
  lang: string;
  source: string;
}

interface Task {
  audioPath: string;
  metadataPath: string;
  expectedIPA: string;
  phrase: string;
  lang: string;
  source: string;
  metadata: Record<string, any>;
}

interface Result {
  phrase: string;
  lang: string;
  source: string;
  metadataPath: string;
  expected?: string;
  actual: string;
  similarity: number;
  previousSimilarity?: number;
  previousRecognizedIpa?: string;
  status: "ok" | "error";
  error?: string;
}

async function downloadIfNeeded(url: string, filename: string): Promise<string> {
  const cachePath = path.join(CACHE_DIR, filename);
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
  if (fs.existsSync(cachePath)) {
    return cachePath;
  }
  console.log(`Downloading ${filename}...`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(cachePath, buffer);
  return cachePath;
}

async function downloadModelFiles() {
  const modelPath = await downloadIfNeeded(MODEL_URL, `${MODEL_NAME}.int8.onnx`);
  const tokensPath = await downloadIfNeeded(VOCAB_URL, `${MODEL_NAME}.tokens.txt`);

  // Convert tokens.txt to vocab.json format
  const vocabPath = path.join(CACHE_DIR, `${modelName}.vocab.json`);
  if (!fs.existsSync(vocabPath)) {
    console.log(`Converting tokens.txt to vocab.json...`);
    const tokensContent = fs.readFileSync(tokensPath, "utf8");
    const vocab: Record<string, number> = {};
    for (const line of tokensContent.trim().split("\n")) {
      const [token, id] = line.split(" ");
      vocab[token] = parseInt(id, 10);
    }
    fs.writeFileSync(vocabPath, JSON.stringify(vocab, null, 2));
  }

  return { modelPath, vocabPath };
}

function runWorkers(
  tasks: Task[],
  modelPath: string,
  vocabPath: string,
  numWorkers: number,
): Promise<Result[]> {
  return new Promise((resolve, reject) => {
    const results: Result[] = [];
    let completedWorkers = 0;

    // Split tasks across workers
    const tasksPerWorker = Math.ceil(tasks.length / numWorkers);
    const workerTasks: Task[][] = [];
    for (let i = 0; i < numWorkers; i++) {
      const start = i * tasksPerWorker;
      const end = Math.min(start + tasksPerWorker, tasks.length);
      if (start < tasks.length) {
        workerTasks.push(tasks.slice(start, end));
      }
    }

    const actualWorkers = workerTasks.length;
    if (actualWorkers === 0) {
      resolve([]);
      return;
    }

    for (let i = 0; i < actualWorkers; i++) {
      const worker = new Worker(path.join(PROJECT_ROOT, "tests", "worker-phoneme.js"), {
        workerData: {
          modelPath,
          vocabPath,
          tasks: workerTasks[i],
        },
      });

      worker.on("message", (workerResults: Result[] | { error: string }) => {
        if ("error" in workerResults) {
          reject(new Error(workerResults.error));
          return;
        }
        results.push(...workerResults);
        completedWorkers++;
        if (completedWorkers === actualWorkers) {
          resolve(results);
        }
      });

      worker.on("error", reject);
    }
  });
}

function findAllAudioFiles(): AudioFile[] {
  const audioFiles: AudioFile[] = [];

  // Scan tests/data/de and tests/data/en
  for (const lang of ["de", "en"]) {
    const langDir = path.join(DATA_DIR, lang);
    if (!fs.existsSync(langDir)) continue;

    const phraseDirs = fs.readdirSync(langDir);
    for (const phraseDir of phraseDirs) {
      const fullPath = path.join(langDir, phraseDir);
      if (!fs.statSync(fullPath).isDirectory()) continue;

      const phrase = phraseDir.replace(/_/g, " ");
      const files = fs.readdirSync(fullPath);

      for (const file of files) {
        if (file.endsWith(".flac") || file.endsWith(".wav")) {
          const audioPath = path.join(fullPath, file);
          const yamlPath = audioPath + ".yaml";

          let metadata = null;
          if (fs.existsSync(yamlPath)) {
            metadata = yaml.load(fs.readFileSync(yamlPath, "utf8")) as Record<string, any>;
          }

          // Extract source from filename (e.g., "Wasser-Thomas.flac" -> "Thomas")
          const baseName = file.replace(/\.(flac|wav)$/, "");
          const normalizedPhrase = phraseDir;
          const source = baseName.replace(`${normalizedPhrase}-`, "");

          audioFiles.push({
            path: audioPath,
            metadataPath: yamlPath,
            metadata,
            phrase,
            lang,
            source,
          });
        }
      }
    }
  }

  return audioFiles;
}

function getExpectedIPA(phrase: string, lang: string): string {
  // Load phrase files
  const phraseFile = path.join(PROJECT_ROOT, `phrases-${lang}.yaml`);
  if (!fs.existsSync(phraseFile)) return "";

  const content = fs.readFileSync(phraseFile, "utf8");
  const data = yaml.load(content) as Array<{ phrase: string; ipas: Array<{ ipa: string }> }>;

  for (const entry of data) {
    if (entry.phrase === phrase && entry.ipas && entry.ipas.length > 0) {
      // Return all IPAs joined with |
      return entry.ipas.map((i) => i.ipa).join("|");
    }
  }

  return "";
}

function matchesPattern(text: string, pattern: string): boolean {
  if (pattern === "*") return true;
  const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$", "i");
  return regex.test(text);
}

function printResults(results: Result[]) {
  // Sort by similarity descending
  const sorted = [...results].sort((a, b) => {
    if (a.status !== "ok") return 1;
    if (b.status !== "ok") return -1;
    return b.similarity - a.similarity;
  });

  console.log("\nAll results:\n");
  console.log(
    "Phrase".padEnd(25) +
      "Source".padEnd(20) +
      "Similarity".padEnd(12) +
      "Expected IPA".padEnd(25) +
      "Actual IPA",
  );
  console.log("-".repeat(120));

  for (const r of sorted) {
    if (r.status === "ok") {
      const simPercent = Math.round(r.similarity * 100) + "%";
      const expectedShort = (r.expected || "").substring(0, 22);
      const actualShort = r.actual.substring(0, 50);
      console.log(
        `${r.phrase.padEnd(25)}${r.source.padEnd(20)}${simPercent.padEnd(12)}${expectedShort.padEnd(25)}${actualShort}`,
      );
    } else {
      console.log(`${r.phrase.padEnd(25)}${r.source.padEnd(20)}ERROR: ${r.error}`);
    }
  }
}

function printHelp() {
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

async function main() {
  const args = process.argv.slice(2);

  const showList = args.includes("--list") || args.includes("-l");
  const showHelp = args.includes("--help") || args.includes("-h");
  const updateYaml = args.includes("--update") || args.includes("-u");
  const pattern = args.find((a) => !a.startsWith("-")) || "*";

  if (showHelp) {
    printHelp();
    return;
  }

  const allAudioFiles = findAllAudioFiles();
  const filtered = allAudioFiles.filter((f) => matchesPattern(f.phrase, pattern));

  if (showList) {
    console.log("Available audio files:\n");
    console.log("Lang  Phrase".padEnd(35) + "Source");
    console.log("-".repeat(60));
    for (const f of filtered) {
      console.log(`${f.lang.padEnd(6)}${f.phrase.padEnd(29)}${f.source}`);
    }
    console.log(`\nTotal: ${filtered.length} audio files`);
    return;
  }

  console.log("=== IPA Extraction Test on All FLAC Files ===\n");

  if (pattern !== "*") {
    console.log(`Filter: ${pattern}`);
    console.log(`Matching files: ${filtered.length}\n`);
  }

  // Download model files
  const { modelPath, vocabPath } = await downloadModelFiles();

  // Build tasks
  const tasks: Task[] = filtered.map((f) => ({
    audioPath: f.path,
    metadataPath: f.metadataPath,
    expectedIPA: getExpectedIPA(f.phrase, f.lang),
    phrase: f.phrase,
    lang: f.lang,
    source: f.source,
    metadata: f.metadata || {},
  }));

  const numWorkers = os.cpus().length;
  console.log(`Processing ${tasks.length} files using ${numWorkers} workers...\n`);

  // Run in parallel
  const results = await runWorkers(tasks, modelPath, vocabPath, numWorkers);

  // Print results
  if (results.length > 0) printResults(results);

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));

  const successful = results.filter((r) => r.status === "ok");
  const failed = results.filter((r) => r.status !== "ok");

  const avgSimilarity =
    successful.length > 0
      ? successful.reduce((sum, r) => sum + r.similarity, 0) / successful.length
      : 0;

  console.log(`Total audio files: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Average similarity: ${Math.round(avgSimilarity * 100)}%`);

  // Compare old vs new results
  const regressions: any[] = [];
  const improved: any[] = [];
  const degraded: any[] = [];
  const ipaChanged: any[] = [];

  for (const r of successful) {
    const hasPrevious = r.previousSimilarity !== undefined;
    const hasPreviousIpa = r.previousRecognizedIpa !== undefined;

    if (!hasPrevious) continue;

    const isRegression = r.similarity < r.previousSimilarity - 0.01;
    const isImprovement = r.similarity > r.previousSimilarity + 0.01;
    const isDegraded = r.similarity < r.previousSimilarity && !isRegression;
    const isSameSimilarity = Math.abs(r.similarity - r.previousSimilarity) <= 0.01;
    const isIpaChanged = hasPreviousIpa && r.previousRecognizedIpa !== r.actual && isSameSimilarity;

    if (isRegression) {
      regressions.push({
        phrase: r.phrase,
        source: r.source,
        old: r.previousSimilarity,
        new: r.similarity,
        oldIpa: r.previousRecognizedIpa,
        newIpa: r.actual,
      });
    } else if (isImprovement) {
      improved.push({
        phrase: r.phrase,
        source: r.source,
        old: r.previousSimilarity,
        new: r.similarity,
        oldIpa: r.previousRecognizedIpa,
        newIpa: r.actual,
      });
    } else if (isDegraded) {
      // Only track degradation if the rounded percentages actually differ
      const oldPercent = Math.round(r.previousSimilarity * 100);
      const newPercent = Math.round(r.similarity * 100);
      if (newPercent < oldPercent) {
        degraded.push({
          phrase: r.phrase,
          source: r.source,
          old: r.previousSimilarity,
          new: r.similarity,
        });
      }
    } else if (isIpaChanged) {
      ipaChanged.push({
        phrase: r.phrase,
        source: r.source,
        similarity: r.similarity,
        oldIpa: r.previousRecognizedIpa,
        newIpa: r.actual,
      });
    }

    // Update YAML if improvement or --update flag
    if (updateYaml || isImprovement) {
      if (fs.existsSync(r.metadataPath)) {
        const content = fs.readFileSync(r.metadataPath, "utf8");
        const metadata = yaml.load(content) as Record<string, any>;
        metadata.recognized_ipa = r.actual;
        metadata.similarity = Math.round(r.similarity * 100) / 100;
        fs.writeFileSync(r.metadataPath, yaml.dump(metadata));
      }
    }
  }

  // Report improvements
  if (improved.length > 0) {
    console.log("\n✅ Improvements:");
    for (const imp of improved) {
      const oldPercent = Math.round(imp.old * 100) + "%";
      const newPercent = Math.round(imp.new * 100) + "%";
      console.log(`  ${imp.phrase} (${imp.source}): ${oldPercent} → ${newPercent}`);
      if (imp.oldIpa !== imp.newIpa) {
        console.log(`    IPA: "${imp.oldIpa}" → "${imp.newIpa}"`);
      }
    }
  }

  // Report degraded
  if (degraded.length > 0) {
    console.log("\n⚠️  Degraded (within tolerance, not updated):");
    for (const deg of degraded) {
      const oldPercent = Math.round(deg.old * 100) + "%";
      const newPercent = Math.round(deg.new * 100) + "%";
      console.log(`  ${deg.phrase} (${deg.source}): ${oldPercent} → ${newPercent}`);
    }
  }

  // Report IPA changes
  if (ipaChanged.length > 0) {
    console.log("\n🔄 IPA changed (same similarity, not updated):");
    for (const chg of ipaChanged) {
      const simPercent = Math.round(chg.similarity * 100) + "%";
      console.log(`  ${chg.phrase} (${chg.source}): ${simPercent}`);
      console.log(`    Stored:    "${chg.oldIpa}"`);
      console.log(`    Extracted: "${chg.newIpa}"`);
    }
  }

  // Report regressions
  if (regressions.length > 0) {
    console.log("\n" + "=".repeat(80));
    console.log("❌ REGRESSIONS DETECTED");
    console.log("=".repeat(80));
    for (const reg of regressions) {
      const oldPercent = Math.round(reg.old * 100) + "%";
      const newPercent = Math.round(reg.new * 100) + "%";
      const change = Math.round((reg.new - reg.old) * 100) + "%";
      console.log(`  ${reg.phrase} (${reg.source}): ${oldPercent} → ${newPercent} (${change})`);
      if (reg.oldIpa !== reg.newIpa) {
        console.log(`    IPA: "${reg.oldIpa}" → "${reg.newIpa}"`);
      }
    }
    console.log(`\n${regressions.length} regression(s) found!`);
  }

  if (failed.length > 0 || regressions.length > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
