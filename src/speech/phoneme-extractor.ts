/**
 * Phoneme extraction — proxy to phoneme-worker.ts.
 * All heavy work (model loading, ORT inference) runs in a Web Worker
 * to keep the main thread responsive.
 */

import { HF_REPO, MODEL_FILE, MODEL_NAME } from "../lib/model-config.js";

interface ProgressInfo {
  status: string;
  name?: string;
  progress: number;
  loaded?: number;
  total?: number;
  attempt?: number;
  max?: number;
}

// Use local model when running on localhost in DEV mode to speed up loading
const IS_DEV_LOCALHOST =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

const MODEL_URL = IS_DEV_LOCALHOST
  ? `/onnx/${MODEL_NAME}/${MODEL_FILE}`
  : `https://huggingface.co/${HF_REPO}/resolve/main/${MODEL_FILE}`;

const VOCAB_URL = IS_DEV_LOCALHOST
  ? `/onnx/${MODEL_NAME}/vocab.json`
  : `https://huggingface.co/${HF_REPO}/resolve/main/tokens.txt`;

type PendingRequest = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let loadResolve: (() => void) | null = null;
let loadReject: ((e: Error) => void) | null = null;
let progressCallback: ((info: ProgressInfo) => void) | null = null;
let _modelLoaded = false;
let _webgpuValidationFailed = false;

const pending = new Map<number, PendingRequest>();
let nextId = 0;

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL("./phoneme-worker.ts", import.meta.url), { type: "module" });

  worker.onmessage = (event: MessageEvent) => {
    const msg = event.data as {
      type: string;
      id?: number;
      info?: ProgressInfo;
      webgpuValidationFailed?: boolean;
      message?: string;
      data?: unknown;
    };

    if (msg.type === "progress") {
      if (msg.info) progressCallback?.(msg.info);
    } else if (msg.type === "loaded") {
      _modelLoaded = true;
      _webgpuValidationFailed = msg.webgpuValidationFailed ?? false;
      loadResolve?.();
      loadResolve = null;
      loadReject = null;
    } else if (msg.type === "loadError") {
      loadReject?.(new Error(msg.message));
      loadResolve = null;
      loadReject = null;
    } else if (msg.type === "result" && msg.id !== undefined) {
      const req = pending.get(msg.id);
      if (req) {
        pending.delete(msg.id);
        req.resolve(msg.data);
      }
    } else if (msg.type === "error" && msg.id !== undefined) {
      const req = pending.get(msg.id);
      if (req) {
        pending.delete(msg.id);
        req.reject(new Error(msg.message));
      }
    }
  };

  worker.onerror = (event) => {
    console.error("Phoneme worker error:", event);
    loadReject?.(new Error(event.message ?? "Worker error"));
    loadResolve = null;
    loadReject = null;
  };

  return worker;
}

/**
 * Load the phoneme extraction model (runs in worker — non-blocking)
 */
export async function loadPhonemeModel(callback: (info: ProgressInfo) => void): Promise<void> {
  if (_modelLoaded) {
    callback({ status: "ready", progress: 100 });
    return;
  }

  progressCallback = callback;
  const w = getWorker();

  const webgpuEnabled =
    typeof localStorage !== "undefined" && localStorage.getItem("webgpu-enabled") === "true";

  return new Promise<void>((resolve, reject) => {
    loadResolve = resolve;
    loadReject = reject;
    w.postMessage({
      type: "load",
      webgpuEnabled,
      modelUrl: MODEL_URL,
      vocabUrl: VOCAB_URL,
      hfRepo: HF_REPO,
      modelFile: MODEL_FILE,
      skipChecksum: IS_DEV_LOCALHOST,
    });
  });
}

export function wasWebGpuValidationFailed(): boolean {
  return _webgpuValidationFailed;
}

export function isPhonemeModelLoaded(): boolean {
  return _modelLoaded;
}

export function getVocab(): Record<string, number> | null {
  return null;
}

function call<T>(type: string, extra: Record<string, unknown>): Promise<T> {
  const id = nextId++;
  const w = getWorker();
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ type, id, ...extra });
  });
}

/**
 * Extract phonemes from audio data
 */
export async function extractPhonemes(audioData: Float32Array): Promise<string> {
  return call<string>("extractPhonemes", { audioData });
}

/**
 * Extract phonemes and count trailing blank frames (for end-of-speech detection)
 */
export async function extractPhonemesWithBlankInfo(
  audioData: Float32Array,
  blankConfidenceThreshold = 0.95,
): Promise<{ phonemes: string; trailingBlankFrames: number }> {
  return call<{ phonemes: string; trailingBlankFrames: number }>("extractPhonemesWithBlankInfo", {
    audioData,
    blankConfidenceThreshold,
  });
}

/**
 * Extract phonemes with full details (for debugging/visualization)
 */
export async function extractPhonemesDetailed(audioData: Float32Array): Promise<{
  phonemes: string;
  details: Array<{ symbol: string; confidence: number; duration: number }>;
  raw: {
    frames: number;
    vocabSize: number;
    frameData: Array<{
      frameIndex: number;
      topPredictions: Array<{
        symbol: string;
        tokenId: number;
        logit: number;
        probability: number;
      }>;
    }>;
  };
}> {
  return call("extractPhonemesDetailed", { audioData });
}
