#!/usr/bin/env tsx
/**
 * Extract IPA from all *.opus files in static/audio/ and write *.opus.debug.yaml next to each.
 *
 * Usage: ./run tsx scripts/test-all-opus.ts [--force]
 *
 * Options:
 *   --force   Re-process files even if .debug.yaml already exists
 *   --help    Show help
 *
 * Files are processed in parallel using one worker thread per CPU core.
 * Interruptable: press Ctrl-C to stop gracefully; already-written files are kept.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { Worker } from "worker_threads";
import { parseArgs } from "util";
import { MODEL_NAME, HF_REPO, MODEL_FILE } from "../src/lib/model-config.js";
import { CACHE_DIR, downloadIfNeeded } from "./lib/flac-test-core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const MODEL_URL = `https://huggingface.co/${HF_REPO}/resolve/main/${MODEL_FILE}`;
const VOCAB_URL = `https://huggingface.co/${HF_REPO}/resolve/main/tokens.txt`;
const LOCAL_MODEL = path.join(CACHE_DIR, MODEL_FILE.replace("model", MODEL_NAME));
const LOCAL_VOCAB = path.join(CACHE_DIR, `${MODEL_NAME}.vocab.json`);

interface OpusTask {
  audioPath: string;
  studyLang: string;
  voice: string;
  outputPath: string;
}

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

function printHelp(): void {
  console.log(`Usage: ./run tsx scripts/test-all-opus.ts [--force]

Options:
  --force   Re-process files even if .debug.yaml already exists
  --help    Show this help

Writes {file}.opus.debug.yaml next to each opus file.
Press Ctrl-C to stop; already-written files are kept.
`);
}

async function main(): Promise<void> {
  let values: { force?: boolean; help?: boolean };
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2),
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
    printHelp();
    return;
  }

  const force = values.force ?? false;

  const tasks = collectOpusTasks(force);
  const total = collectOpusTasks(false).length + (force ? 0 : 0);

  if (tasks.length === 0) {
    console.log(
      "All opus files already have .debug.yaml — nothing to do. Use --force to reprocess.",
    );
    return;
  }

  // Count total for context
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

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
