#!/usr/bin/env tsx
/**
 * Unified tool for extracting and comparing IPA from *.opus files in static/audio/.
 *
 * Usage: ./run tsx scripts/static-phrase-audio-ipa.ts <subcommand> [options]
 *
 * Subcommands:
 *   extract   Extract IPA from all *.opus files and write *.opus.debug.yaml files
 *   compare   Compare extracted IPA against expected IPA from phrase YAML files
 */

import fs from "fs";
import yaml from "js-yaml";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { parseArgs } from "util";
import { Worker } from "worker_threads";
import { HF_REPO, MODEL_FILE, MODEL_NAME } from "../src/lib/model-config.js";
import { calculatePanPhonDistance } from "../tests/panphon-distance-node.js";
import { CACHE_DIR, downloadIfNeeded } from "./lib/flac-test-core.js";
import {
  PROJECT_ROOT,
  buildFilenameLookup,
  collectDebugFiles,
  type DebugYaml,
  type PhraseInfo,
} from "./lib/phrase-audio-utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_URL = `https://huggingface.co/${HF_REPO}/resolve/main/${MODEL_FILE}`;
const VOCAB_URL = `https://huggingface.co/${HF_REPO}/resolve/main/tokens.txt`;
const LOCAL_MODEL = path.join(CACHE_DIR, MODEL_FILE.replace("model", MODEL_NAME));
const LOCAL_VOCAB = path.join(CACHE_DIR, `${MODEL_NAME}.vocab.json`);

// ── Shared: model download ────────────────────────────────────────────────────

async function downloadModelFiles(): Promise<{ modelPath: string; vocabPath: string }> {
  const modelPath = fs.existsSync(LOCAL_MODEL)
    ? LOCAL_MODEL
    : await downloadIfNeeded(MODEL_URL, MODEL_FILE.replace("model", MODEL_NAME));

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

// ── extract subcommand ────────────────────────────────────────────────────────

interface OpusTask {
  audioPath: string;
  studyLang: string;
  voice: string;
  outputPath: string;
}

function collectOpusTasks(force: boolean): OpusTask[] {
  const audioRoot = path.join(PROJECT_ROOT, "static", "audio");
  const tasks: OpusTask[] = [];

  for (const studyLang of fs.readdirSync(audioRoot)) {
    const langDir = path.join(audioRoot, studyLang);
    if (!fs.statSync(langDir).isDirectory()) continue;

    for (const voice of fs.readdirSync(langDir)) {
      const voiceDir = path.join(langDir, voice);
      if (!fs.statSync(voiceDir).isDirectory()) continue;

      for (const file of fs.readdirSync(voiceDir)) {
        if (!file.endsWith(".opus")) continue;
        const audioPath = path.join(voiceDir, file);
        const outputPath = audioPath + ".debug.yaml";

        if (!force && fs.existsSync(outputPath)) continue;

        tasks.push({ audioPath, studyLang, voice, outputPath });
      }
    }
  }

  return tasks;
}

function runWorkers(
  tasks: OpusTask[],
  modelPath: string,
  vocabPath: string,
  numWorkers: number,
): Promise<{ ok: number; errors: number }> {
  return new Promise((resolve, reject) => {
    let ok = 0;
    let errors = 0;
    let completedWorkers = 0;
    let totalProcessed = 0;
    const workers: Worker[] = [];
    let interrupted = false;

    const tasksPerWorker = Math.ceil(tasks.length / numWorkers);
    const workerBatches: OpusTask[][] = [];
    for (let i = 0; i < numWorkers; i++) {
      const start = i * tasksPerWorker;
      const end = Math.min(start + tasksPerWorker, tasks.length);
      if (start < tasks.length) {
        workerBatches.push(tasks.slice(start, end));
      }
    }

    const actualWorkers = workerBatches.length;
    if (actualWorkers === 0) {
      resolve({ ok: 0, errors: 0 });
      return;
    }

    function terminate() {
      if (interrupted) return;
      interrupted = true;
      console.log("\nInterrupted — stopping workers. Already-written files are kept.");
      for (const w of workers) w.terminate();
      resolve({ ok, errors });
    }

    process.on("SIGINT", terminate);

    for (let i = 0; i < actualWorkers; i++) {
      const worker = new Worker(path.join(PROJECT_ROOT, "tests", "worker-opus-debug.js"), {
        workerData: { modelPath, vocabPath, tasks: workerBatches[i] },
      });
      workers.push(worker);

      worker.on("message", (msg: { status: string; audioPath?: string; error?: string }) => {
        if (interrupted) return;
        if (msg.status === "ok") {
          ok++;
          totalProcessed++;
          process.stdout.write(`\r  Processed ${totalProcessed}/${tasks.length} ...`);
        } else if (msg.status === "error") {
          errors++;
          totalProcessed++;
          const label = msg.audioPath ? path.relative(PROJECT_ROOT, msg.audioPath) : "unknown";
          process.stderr.write(`\nERROR: ${label}: ${msg.error}\n`);
          process.stdout.write(`\r  Processed ${totalProcessed}/${tasks.length} ...`);
        } else if (msg.status === "done") {
          completedWorkers++;
          if (completedWorkers === actualWorkers) {
            process.removeListener("SIGINT", terminate);
            process.stdout.write("\n");
            resolve({ ok, errors });
          }
        }
      });

      worker.on("error", (err) => {
        if (!interrupted) reject(err);
      });
    }
  });
}

function printExtractHelp(): void {
  console.log(`Usage: ./run tsx scripts/static-phrase-audio-ipa.ts extract [--force]

Extract IPA from all *.opus files in static/audio/ and write {file}.opus.debug.yaml
next to each file. Processes in parallel using one worker thread per CPU core.
Interruptable: press Ctrl-C to stop; already-written files are kept.

Options:
  --force   Re-process files even if .debug.yaml already exists
  --help    Show this help
`);
}

async function runExtract(args: string[]): Promise<void> {
  let values: { force?: boolean; help?: boolean };
  try {
    ({ values } = parseArgs({
      args,
      options: {
        force: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
    }));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  if (values.help) {
    printExtractHelp();
    return;
  }

  const force = values.force ?? false;
  const tasks = collectOpusTasks(force);

  if (tasks.length === 0) {
    console.log(
      "All opus files already have .debug.yaml — nothing to do. Use --force to reprocess.",
    );
    return;
  }

  const allCount = fs
    .readdirSync(path.join(PROJECT_ROOT, "static", "audio"), { recursive: true })
    .filter((f) => typeof f === "string" && f.endsWith(".opus")).length;

  console.log(`=== IPA Extraction for static/audio *.opus ===\n`);
  console.log(`Total opus files:   ${allCount}`);
  console.log(
    `To process:         ${tasks.length}${force ? " (--force)" : " (skipping existing)"}`,
  );
  console.log(`Workers:            ${os.cpus().length}\n`);

  const { modelPath, vocabPath } = await downloadModelFiles();
  const numWorkers = os.cpus().length;
  const { ok, errors } = await runWorkers(tasks, modelPath, vocabPath, numWorkers);

  console.log(`\nDone. OK: ${ok}, Errors: ${errors}`);
  if (errors > 0) process.exit(1);
}

// ── compare subcommand ────────────────────────────────────────────────────────

interface CompareResult {
  studyLang: string;
  voice: string;
  phrase: string;
  stem: string;
  actualIPA: string;
  expectedIPA: string;
  similarity: number;
  notFound: boolean;
}

function printCompareHelp(): void {
  console.log(`Usage: ./run tsx scripts/static-phrase-audio-ipa.ts compare [options]

Compare detected IPA (from .opus.debug.yaml files in static/audio/) against
expected IPA from phrase YAML files. Run 'extract' first to generate the
.opus.debug.yaml files.

Options:
  --threshold <n>  Similarity threshold in % below which files are shown (default: 85)
  --lang <lang>    Filter by language code, e.g. de-DE (default: all)
  --all            Show all results, not just those below threshold
  --delete         Delete opus + debug.yaml files below threshold
  --help           Show this help
`);
}

async function runCompare(args: string[]): Promise<void> {
  let values: {
    threshold?: string;
    lang?: string;
    all?: boolean;
    delete?: boolean;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args,
      options: {
        threshold: { type: "string" },
        lang: { type: "string" },
        all: { type: "boolean" },
        delete: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
    }));
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  if (values.help) {
    printCompareHelp();
    return;
  }

  const threshold = values.threshold !== undefined ? parseInt(values.threshold, 10) : 85;
  const langFilter = values.lang;
  const showAll = values.all ?? false;
  const doDelete = values.delete ?? false;

  if (isNaN(threshold) || threshold < 0 || threshold > 100) {
    console.error("--threshold must be a number between 0 and 100");
    process.exit(1);
  }

  const debugFiles = collectDebugFiles(langFilter);
  if (debugFiles.length === 0) {
    console.log(
      "No .opus.debug.yaml files found. Run './run tsx scripts/static-phrase-audio-ipa.ts extract' first.",
    );
    return;
  }

  console.log(`=== Opus IPA Comparison ===\n`);
  console.log(`Debug files found: ${debugFiles.length}`);
  console.log(`Threshold:         ${threshold}%`);
  if (langFilter) console.log(`Language filter:   ${langFilter}`);
  console.log();

  const lookups = new Map<string, Map<string, PhraseInfo>>();
  const results: CompareResult[] = [];
  let notFoundCount = 0;
  let errorCount = 0;

  for (const df of debugFiles) {
    if (!lookups.has(df.studyLang)) {
      lookups.set(df.studyLang, buildFilenameLookup(df.studyLang));
    }
    const lookup = lookups.get(df.studyLang)!;

    let debugData: DebugYaml;
    try {
      debugData = yaml.load(fs.readFileSync(df.debugPath, "utf8")) as DebugYaml;
    } catch {
      errorCount++;
      continue;
    }

    const phraseInfo = lookup.get(df.stem);
    if (!phraseInfo) {
      notFoundCount++;
      results.push({
        studyLang: df.studyLang,
        voice: df.voice,
        phrase: df.stem,
        stem: df.stem,
        actualIPA: debugData.ipa,
        expectedIPA: "",
        similarity: -1,
        notFound: true,
      });
      continue;
    }

    const expectedIPAs = phraseInfo.expectedIPA.split("|");
    let bestSimilarity = 0;
    for (const ipa of expectedIPAs) {
      try {
        const r = calculatePanPhonDistance(ipa, debugData.ipa, df.studyLang);
        if (r.similarity > bestSimilarity) bestSimilarity = r.similarity;
      } catch {
        // ignore individual comparison errors
      }
    }

    results.push({
      studyLang: df.studyLang,
      voice: df.voice,
      phrase: phraseInfo.phrase,
      stem: df.stem,
      actualIPA: debugData.ipa,
      expectedIPA: phraseInfo.expectedIPA,
      similarity: bestSimilarity,
      notFound: false,
    });
  }

  results.sort((a, b) => {
    if (a.notFound && !b.notFound) return -1;
    if (!a.notFound && b.notFound) return 1;
    return a.similarity - b.similarity;
  });

  const bad = results.filter((r) => !r.notFound && r.similarity < threshold / 100);

  if (doDelete) {
    let deleted = 0;
    for (const r of bad) {
      const opusPath = path.join(
        PROJECT_ROOT,
        "static",
        "audio",
        r.studyLang,
        r.voice,
        `${r.stem}.opus`,
      );
      const debugPath = opusPath + ".debug.yaml";
      for (const p of [opusPath, debugPath]) {
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
        }
      }
      console.log(
        `DELETED  ${r.studyLang}/${r.voice}/${r.stem}.opus  (${Math.round(r.similarity * 100)}%)`,
      );
      deleted++;
    }
    console.log(`\nDeleted ${deleted} opus+debug.yaml pairs below ${threshold}%.`);
    return;
  }

  const toShow = showAll ? results.filter((r) => !r.notFound) : bad;

  if (toShow.length === 0) {
    console.log(
      `All ${results.filter((r) => !r.notFound).length} files meet the ${threshold}% threshold.`,
    );
  } else {
    const header = [
      "Lang".padEnd(7),
      "Voice".padEnd(18),
      "Sim%".padEnd(6),
      "Phrase".padEnd(30),
      "Expected IPA".padEnd(30),
      "Actual IPA",
    ].join("  ");
    console.log(header);
    console.log("-".repeat(120));

    for (const r of toShow) {
      const sim = Math.round(r.similarity * 100) + "%";
      const phrase = r.phrase.length > 28 ? r.phrase.slice(0, 27) + "…" : r.phrase;
      const expected = r.expectedIPA.length > 28 ? r.expectedIPA.slice(0, 27) + "…" : r.expectedIPA;
      const actual = r.actualIPA.length > 40 ? r.actualIPA.slice(0, 39) + "…" : r.actualIPA;
      console.log(
        [
          r.studyLang.padEnd(7),
          r.voice.padEnd(18),
          sim.padEnd(6),
          phrase.padEnd(30),
          expected.padEnd(30),
          actual,
        ].join("  "),
      );
    }
  }

  console.log();
  const withIPA = results.filter((r) => !r.notFound);
  const avgSim =
    withIPA.length > 0 ? withIPA.reduce((s, r) => s + r.similarity, 0) / withIPA.length : 0;

  console.log(`Total files compared: ${withIPA.length}`);
  console.log(`Average similarity:   ${Math.round(avgSim * 100)}%`);
  console.log(`Below ${threshold}%:         ${bad.length}`);
  if (notFoundCount > 0)
    console.log(`Phrase not in yaml:   ${notFoundCount} (stems with no matching phrase)`);
  if (errorCount > 0) console.log(`Read errors:          ${errorCount}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`Usage: ./run tsx scripts/static-phrase-audio-ipa.ts <subcommand> [options]

Subcommands:
  extract   Extract IPA from all *.opus files in static/audio/ and write
            *.opus.debug.yaml next to each file.
  compare   Compare extracted IPA (from *.opus.debug.yaml) against expected IPA
            from phrase YAML files. Run 'extract' first.

Run './run tsx scripts/static-phrase-audio-ipa.ts <subcommand> --help' for subcommand options.
`);
}

async function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2);

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    printHelp();
    process.exit(subcommand ? 0 : 1);
  }

  if (subcommand === "extract") {
    await runExtract(rest);
  } else if (subcommand === "compare") {
    await runCompare(rest);
  } else {
    console.error(`Unknown subcommand: ${subcommand}`);
    console.error("Run './run tsx scripts/static-phrase-audio-ipa.ts --help' for usage.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
