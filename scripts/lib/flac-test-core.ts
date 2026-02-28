/**
 * Shared utilities for FLAC-based phoneme extraction tests.
 * Used by test-all-flac.ts and test-all-flac-zipa.ts.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { Worker } from "worker_threads";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROJECT_ROOT = path.resolve(__dirname, "../..");
export const XDG_CACHE_HOME = process.env.XDG_CACHE_HOME || path.join(process.env.HOME!, ".cache");
export const CACHE_DIR = path.join(XDG_CACHE_HOME, "phoneme-party", "models");
export const DATA_DIR = path.join(PROJECT_ROOT, "tests", "data");

export interface AudioFile {
  path: string;
  metadataPath: string;
  metadata: Record<string, unknown> | null;
  phrase: string;
  studyLang: string;
  source: string;
}

export interface Task {
  audioPath: string;
  metadataPath: string;
  expectedIPA: string;
  phrase: string;
  lang: string;
  source: string;
  metadata: Record<string, unknown>;
}

export interface Result {
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

export async function downloadIfNeeded(url: string, filename: string): Promise<string> {
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

export function runWorkers(
  tasks: Task[],
  modelPath: string,
  vocabPath: string,
  numWorkers: number,
): Promise<Result[]> {
  return new Promise((resolve, reject) => {
    const results: Result[] = [];
    let completedWorkers = 0;

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
        workerData: { modelPath, vocabPath, tasks: workerTasks[i] },
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

export function findAllAudioFiles(): AudioFile[] {
  const audioFiles: AudioFile[] = [];

  for (const studyLang of ["de-DE", "en-GB"]) {
    const langDir = path.join(DATA_DIR, studyLang);
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
            metadata = yaml.load(fs.readFileSync(yamlPath, "utf8")) as Record<string, unknown>;
          }

          const baseName = file.replace(/\.(flac|wav)$/, "");
          const source = baseName.replace(`${phraseDir}-`, "");

          audioFiles.push({
            path: audioPath,
            metadataPath: yamlPath,
            metadata,
            phrase,
            studyLang,
            source,
          });
        }
      }
    }
  }

  return audioFiles;
}

export function getExpectedIPA(phrase: string, studyLang: string): string {
  const phraseFile = path.join(PROJECT_ROOT, `phrases-${studyLang}.yaml`);
  if (!fs.existsSync(phraseFile)) return "";

  const content = fs.readFileSync(phraseFile, "utf8");
  const data = yaml.load(content) as Array<{ phrase: string; ipas: Array<{ ipa: string }> }>;

  for (const entry of data) {
    if (entry.phrase === phrase && entry.ipas && entry.ipas.length > 0) {
      return entry.ipas.map((i) => i.ipa).join("|");
    }
  }

  return "";
}

export function matchesPattern(text: string, pattern: string): boolean {
  if (pattern === "*") return true;
  const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$", "i");
  return regex.test(text);
}

export function printResults(results: Result[]): void {
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

export async function runTestSuite(opts: {
  downloadModelFiles: () => Promise<{ modelPath: string; vocabPath: string }>;
  updateYaml: boolean;
  pattern: string;
  showList: boolean;
}): Promise<void> {
  const { updateYaml, pattern, showList } = opts;

  const allAudioFiles = findAllAudioFiles();
  const filtered = allAudioFiles.filter((f) => matchesPattern(f.phrase, pattern));

  if (showList) {
    console.log("Available audio files:\n");
    console.log("Lang  Phrase".padEnd(35) + "Source");
    console.log("-".repeat(60));
    for (const f of filtered) {
      console.log(`${f.studyLang.padEnd(6)}${f.phrase.padEnd(29)}${f.source}`);
    }
    console.log(`\nTotal: ${filtered.length} audio files`);
    return;
  }

  console.log("=== IPA Extraction Test on All FLAC Files ===\n");

  if (pattern !== "*") {
    console.log(`Filter: ${pattern}`);
    console.log(`Matching files: ${filtered.length}\n`);
  }

  const { modelPath, vocabPath } = await opts.downloadModelFiles();

  const tasks: Task[] = filtered.map((f) => ({
    audioPath: f.path,
    metadataPath: f.metadataPath,
    expectedIPA: getExpectedIPA(f.phrase, f.studyLang),
    phrase: f.phrase,
    lang: f.studyLang,
    source: f.source,
    metadata: (f.metadata as Record<string, unknown>) || {},
  }));

  const numWorkers = os.cpus().length;
  console.log(`Processing ${tasks.length} files using ${numWorkers} workers...\n`);

  const results = await runWorkers(tasks, modelPath, vocabPath, numWorkers);

  if (results.length > 0) printResults(results);

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

  const regressions: Array<{
    phrase: string;
    source: string;
    old: number;
    new: number;
    oldIpa?: string;
    newIpa?: string;
  }> = [];
  const improved: Array<{
    phrase: string;
    source: string;
    old: number;
    new: number;
    oldIpa?: string;
    newIpa?: string;
  }> = [];
  const degraded: Array<{ phrase: string; source: string; old: number; new: number }> = [];
  const ipaChanged: Array<{
    phrase: string;
    source: string;
    similarity: number;
    oldIpa?: string;
    newIpa?: string;
  }> = [];

  for (const r of successful) {
    const hasPrevious = r.previousSimilarity !== undefined;
    const hasPreviousIpa = r.previousRecognizedIpa !== undefined;
    if (!hasPrevious) continue;

    const isRegression = r.similarity < r.previousSimilarity! - 0.01;
    const isImprovement = r.similarity > r.previousSimilarity! + 0.01;
    const isDegraded = r.similarity < r.previousSimilarity! && !isRegression;
    const isSameSimilarity = Math.abs(r.similarity - r.previousSimilarity!) <= 0.01;
    const isIpaChanged = hasPreviousIpa && r.previousRecognizedIpa !== r.actual && isSameSimilarity;

    if (isRegression) {
      regressions.push({
        phrase: r.phrase,
        source: r.source,
        old: r.previousSimilarity!,
        new: r.similarity,
        oldIpa: r.previousRecognizedIpa,
        newIpa: r.actual,
      });
    } else if (isImprovement) {
      improved.push({
        phrase: r.phrase,
        source: r.source,
        old: r.previousSimilarity!,
        new: r.similarity,
        oldIpa: r.previousRecognizedIpa,
        newIpa: r.actual,
      });
    } else if (isDegraded) {
      const oldPercent = Math.round(r.previousSimilarity! * 100);
      const newPercent = Math.round(r.similarity * 100);
      if (newPercent < oldPercent) {
        degraded.push({
          phrase: r.phrase,
          source: r.source,
          old: r.previousSimilarity!,
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

    if (updateYaml || isImprovement) {
      if (fs.existsSync(r.metadataPath)) {
        const content = fs.readFileSync(r.metadataPath, "utf8");
        const meta = yaml.load(content) as Record<string, unknown>;
        meta.recognized_ipa = r.actual;
        meta.similarity = Math.round(r.similarity * 100) / 100;
        fs.writeFileSync(r.metadataPath, yaml.dump(meta));
      }
    }
  }

  if (improved.length > 0) {
    console.log("\n✅ Improvements:");
    for (const imp of improved) {
      console.log(
        `  ${imp.phrase} (${imp.source}): ${Math.round(imp.old * 100)}% → ${Math.round(imp.new * 100)}%`,
      );
      if (imp.oldIpa !== imp.newIpa) console.log(`    IPA: "${imp.oldIpa}" → "${imp.newIpa}"`);
    }
  }

  if (degraded.length > 0) {
    console.log("\n⚠️  Degraded (within tolerance, not updated):");
    for (const deg of degraded) {
      console.log(
        `  ${deg.phrase} (${deg.source}): ${Math.round(deg.old * 100)}% → ${Math.round(deg.new * 100)}%`,
      );
    }
  }

  if (ipaChanged.length > 0) {
    console.log("\n🔄 IPA changed (same similarity, not updated):");
    for (const chg of ipaChanged) {
      console.log(`  ${chg.phrase} (${chg.source}): ${Math.round(chg.similarity * 100)}%`);
      console.log(`    Stored:    "${chg.oldIpa}"`);
      console.log(`    Extracted: "${chg.newIpa}"`);
    }
  }

  if (regressions.length > 0) {
    console.log("\n" + "=".repeat(80));
    console.log("❌ REGRESSIONS DETECTED");
    console.log("=".repeat(80));
    const sorted = [...regressions].sort((a, b) => b.new - b.old - (a.new - a.old));
    for (const reg of sorted) {
      const change = Math.round((reg.new - reg.old) * 100) + "%";
      console.log(
        `  ${reg.phrase} (${reg.source}): ${Math.round(reg.old * 100)}% → ${Math.round(reg.new * 100)}% (${change})`,
      );
      if (reg.oldIpa !== reg.newIpa) console.log(`    IPA: "${reg.oldIpa}" → "${reg.newIpa}"`);
    }
    console.log(`\n${regressions.length} regression(s) found!`);
  }

  if (failed.length > 0 || regressions.length > 0) {
    process.exit(1);
  }
}
