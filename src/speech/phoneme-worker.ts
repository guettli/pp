/**
 * Web Worker for phoneme extraction using ZIPA small CTC ONNX model.
 * Runs model loading and inference off the main thread to keep the UI responsive.
 */

import * as ort from "onnxruntime-web/webgpu";
import { buildPhonemeFeeds } from "./phoneme-feeds.js";
import {
  clearPartialDownload,
  deleteModelFromCache,
  getModelChecksum,
  getModelFromCache,
  getPartialDownload,
  saveModelChecksum,
  saveModelToCache,
  savePartialDownload,
} from "./model-cache.js";
import { decodePhonemes, extractFrameData } from "./phoneme-decoder.js";
import type { PhonemeWithConfidence, FrameData } from "./phoneme-decoder.js";

// Point WASM binaries to CDN — Vite does not bundle .wasm files automatically
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.2/dist/";
ort.env.wasm.numThreads = self.crossOriginIsolated ? navigator.hardwareConcurrency || 4 : 1;
// Suppress non-critical ORT warnings (e.g. CPU vendor detection in sandboxed environments)
ort.env.logLevel = "error";

interface ProgressInfo {
  status: string;
  name?: string;
  progress: number;
  loaded?: number;
  total?: number;
  attempt?: number;
  max?: number;
}

const MAX_DOWNLOAD_RETRIES = 5;
const PARTIAL_SAVE_INTERVAL = 5 * 1024 * 1024;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendProgress(info: ProgressInfo): void {
  self.postMessage({ type: "progress", info });
}

async function getExecutionProviders(webgpuEnabled: boolean): Promise<string[]> {
  if (!webgpuEnabled || typeof navigator === "undefined" || !navigator.gpu) {
    return ["wasm"];
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = await (navigator.gpu as any).requestAdapter();
    if (adapter?.features.has("shader-f16")) {
      return ["webgpu", "wasm"];
    }
  } catch {
    // WebGPU adapter request failed
  }
  return ["wasm"];
}

async function computeSHA256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function combineBuffers(
  initial: ArrayBuffer | undefined,
  chunks: Uint8Array[],
  totalLoaded: number,
): ArrayBuffer {
  const combined = new Uint8Array(totalLoaded);
  let offset = 0;
  if (initial) {
    combined.set(new Uint8Array(initial), 0);
    offset = initial.byteLength;
  }
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined.buffer;
}

async function attemptDownload(
  url: string,
  onProgress: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  const partial = await getPartialDownload(url);
  const resumeFrom: number = partial != null ? partial.data.byteLength : 0;

  const headers: Record<string, string> = {};
  if (resumeFrom > 0) {
    headers["Range"] = `bytes=${resumeFrom}-`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok && response.status !== 206) {
    throw new Error(`Failed to fetch model: ${response.status}`);
  }

  const isResume = response.status === 206;

  if (resumeFrom > 0 && !isResume) {
    void clearPartialDownload(url);
  }

  const contentLength = response.headers.get("content-length");
  const remainingBytes: number = contentLength ? parseInt(contentLength, 10) : 0;
  const startByte: number = isResume ? resumeFrom : 0;
  const totalBytes: number = remainingBytes > 0 ? startByte + remainingBytes : 0;

  if (!response.body) {
    throw new Error("Model response body is null");
  }

  const reader = response.body.getReader();
  const newChunks: Uint8Array[] = [];
  let loadedBytes: number = startByte;
  let lastSavedAt: number = startByte;
  const initialBuffer = isResume && partial != null ? partial.data : undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = value as Uint8Array;
    newChunks.push(chunk);
    loadedBytes += chunk.length;
    onProgress(loadedBytes, totalBytes);

    if (loadedBytes - lastSavedAt >= PARTIAL_SAVE_INTERVAL) {
      const partialData = combineBuffers(initialBuffer, newChunks, loadedBytes);
      void savePartialDownload(url, { data: partialData, total: totalBytes });
      lastSavedAt = loadedBytes;
    }
  }

  return combineBuffers(initialBuffer, newChunks, loadedBytes);
}

async function downloadWithRetryAndResume(
  url: string,
  onProgress: (loaded: number, total: number) => void,
  onRetry: (attempt: number, maxRetries: number) => void,
): Promise<ArrayBuffer> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      onRetry(attempt, MAX_DOWNLOAD_RETRIES);
      await sleep(delayMs);
    }
    try {
      return await attemptDownload(url, onProgress);
    } catch (error) {
      lastError = error;
      console.warn(
        `Model download attempt ${attempt + 1}/${MAX_DOWNLOAD_RETRIES + 1} failed:`,
        error,
      );
    }
  }
  throw lastError;
}

async function fetchHFChecksum(hfRepo: string, modelFile: string): Promise<string | null> {
  try {
    const resp = await fetch(`https://huggingface.co/api/models/${hfRepo}/tree/main`);
    if (!resp.ok) return null;
    const files = (await resp.json()) as Array<{ path: string; lfs?: { oid: string } }>;
    const entry = files.find((f) => f.path === modelFile);
    return entry?.lfs?.oid ?? null;
  } catch {
    return null;
  }
}

let session: ort.InferenceSession | null = null;
let idToToken: Record<number, string> | null = null;
let webgpuValidationFailed = false;

async function validateSession(): Promise<boolean> {
  if (!session) return false;
  try {
    const silence = new Float32Array(16000);
    const feeds = await buildPhonemeFeeds(silence, ort.Tensor);
    const results = await session.run(feeds);
    const logits = results.logits ?? results.log_probs ?? results[Object.keys(results)[0]];
    if (!logits) return false;
    const data = logits.data as Float32Array;
    for (let i = 0; i < Math.min(data.length, 500); i++) {
      if (!isFinite(data[i])) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function loadModel(
  webgpuEnabled: boolean,
  modelUrl: string,
  vocabUrl: string,
  hfRepo: string,
  modelFile: string,
  skipChecksum: boolean,
): Promise<void> {
  sendProgress({ status: "downloading", name: "vocab", progress: 0 });

  const vocabResponse = await fetch(vocabUrl);
  if (!vocabResponse.ok) {
    throw new Error(`Failed to fetch vocab: ${vocabResponse.status}`);
  }

  idToToken = {};
  const vocab: Record<string, number> = {};
  const vocabText = await vocabResponse.text();
  if (vocabUrl.endsWith(".txt")) {
    for (const line of vocabText.split("\n")) {
      const parts = line.trim().split(" ");
      if (parts.length === 2) {
        const token = parts[0];
        const id = parseInt(parts[1], 10);
        vocab[token] = id;
        idToToken[id] = token;
      }
    }
  } else {
    const parsed = JSON.parse(vocabText) as Record<string, number>;
    for (const [token, id] of Object.entries(parsed)) {
      vocab[token] = id;
      idToToken[id as unknown as number] = token;
    }
  }
  void vocab; // vocab not needed beyond building idToToken

  sendProgress({ status: "downloading", name: modelUrl.split("/").pop(), progress: 10 });

  const executionProviders = await getExecutionProviders(webgpuEnabled);

  let modelArrayBuffer = await getModelFromCache(modelUrl);
  if (modelArrayBuffer) {
    sendProgress({ status: "loading_from_cache", progress: 20 });
    if (!skipChecksum) {
      const [storedChecksum, remoteChecksum, actualChecksum] = await Promise.all([
        getModelChecksum(modelUrl),
        fetchHFChecksum(hfRepo, modelFile),
        computeSHA256(modelArrayBuffer),
      ]);
      const referenceChecksum = remoteChecksum ?? storedChecksum;
      if (!referenceChecksum || actualChecksum !== referenceChecksum) {
        console.warn("Cached model checksum mismatch — redownloading");
        await deleteModelFromCache(modelUrl);
        modelArrayBuffer = null;
      }
    }
  }

  if (!modelArrayBuffer) {
    modelArrayBuffer = await downloadWithRetryAndResume(
      modelUrl,
      (loaded, total) => {
        if (total > 0) {
          const progress = 10 + (loaded / total) * 80;
          sendProgress({
            status: "downloading",
            name: modelUrl.split("/").pop(),
            progress: Math.round(progress),
            loaded,
            total,
          });
        }
      },
      (attempt, maxRetries) => {
        sendProgress({
          status: "retrying",
          name: modelUrl.split("/").pop(),
          progress: 10,
          attempt,
          max: maxRetries,
        });
      },
    );

    await saveModelToCache(modelUrl, modelArrayBuffer);
    await saveModelChecksum(modelUrl, await computeSHA256(modelArrayBuffer));
    void clearPartialDownload(modelUrl);
  }

  const modelBuffer = new Uint8Array(modelArrayBuffer);

  sendProgress({ status: "initializing", progress: 90 });

  session = await ort.InferenceSession.create(modelBuffer.buffer, {
    executionProviders,
    graphOptimizationLevel: "all",
  });

  if (executionProviders[0] === "webgpu" && !(await validateSession())) {
    console.warn("WebGPU validation failed (NaN detected) — falling back to WASM");
    webgpuValidationFailed = true;
    session = await ort.InferenceSession.create(modelBuffer.buffer, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
  }

  sendProgress({ status: "ready", progress: 100 });
}

async function doExtractPhonemes(audioData: Float32Array): Promise<string> {
  if (!session) throw new Error("Phoneme model not loaded");
  if (!idToToken) throw new Error("Vocabulary not loaded");

  const feeds = await buildPhonemeFeeds(audioData, ort.Tensor);
  const results = await session.run(feeds);
  let logits = results.logits || results.log_probs;
  if (!logits) {
    logits = results[Object.keys(results)[0]];
  }
  if (!logits) {
    throw new Error(
      "No logits output found in ONNX results. Available keys: " + Object.keys(results).join(", "),
    );
  }

  const logitsData = logits.data as Float32Array;
  const [, seqLen, vocabSize] = logits.dims;
  return decodePhonemes(logitsData, seqLen, vocabSize, idToToken, {
    returnDetails: false,
  }) as string;
}

async function doExtractPhonemesWithBlankInfo(
  audioData: Float32Array,
  blankConfidenceThreshold: number,
): Promise<{ phonemes: string; trailingBlankFrames: number }> {
  if (!session) throw new Error("Phoneme model not loaded");
  if (!idToToken) throw new Error("Vocabulary not loaded");

  const feeds = await buildPhonemeFeeds(audioData, ort.Tensor);
  const results = await session.run(feeds);
  let logits = results.logits || results.log_probs;
  if (!logits) {
    logits = results[Object.keys(results)[0]];
  }
  if (!logits) {
    throw new Error(
      "No logits output found in ONNX results. Available keys: " + Object.keys(results).join(", "),
    );
  }

  const logitsData = logits.data as Float32Array;
  const [, seqLen, vocabSize] = logits.dims;

  const phonemes = decodePhonemes(logitsData, seqLen, vocabSize, idToToken, {
    returnDetails: false,
  }) as string;

  let trailingBlankFrames = 0;
  for (let t = seqLen - 1; t >= 0; t--) {
    const blankProb = Math.exp(logitsData[t * vocabSize]);
    if (blankProb > blankConfidenceThreshold) {
      trailingBlankFrames++;
    } else {
      break;
    }
  }

  return { phonemes, trailingBlankFrames };
}

async function doExtractPhonemesDetailed(audioData: Float32Array): Promise<{
  phonemes: string;
  details: PhonemeWithConfidence[];
  raw: { frames: number; vocabSize: number; frameData: FrameData[] };
}> {
  if (!session) throw new Error("Phoneme model not loaded");
  if (!idToToken) throw new Error("Vocabulary not loaded");

  const tokenMap = idToToken;
  const feeds = await buildPhonemeFeeds(audioData, ort.Tensor);
  const results = await session.run(feeds);

  let logits = results.logits || results.log_probs;
  if (!logits) {
    logits = results[Object.keys(results)[0]];
  }
  if (!logits) {
    throw new Error(
      "No logits output found in ONNX results. Available keys: " + Object.keys(results).join(", "),
    );
  }

  const logitsData = logits.data as Float32Array;
  const [, seqLen, vocabSize] = logits.dims;

  const detailedPhonemes = decodePhonemes(logitsData, seqLen, vocabSize, tokenMap, {
    returnDetails: true,
  }) as PhonemeWithConfidence[];

  const phonemeString = decodePhonemes(logitsData, seqLen, vocabSize, tokenMap, {
    returnDetails: false,
  }) as string;

  const frameData = extractFrameData(logitsData, seqLen, vocabSize, tokenMap, 5);

  return {
    phonemes: phonemeString,
    details: detailedPhonemes,
    raw: { frames: seqLen, vocabSize, frameData },
  };
}

type WorkerMessage =
  | {
      type: "load";
      webgpuEnabled: boolean;
      modelUrl: string;
      vocabUrl: string;
      hfRepo: string;
      modelFile: string;
      skipChecksum: boolean;
    }
  | { type: "extractPhonemes"; id: number; audioData: Float32Array }
  | {
      type: "extractPhonemesWithBlankInfo";
      id: number;
      audioData: Float32Array;
      blankConfidenceThreshold: number;
    }
  | { type: "extractPhonemesDetailed"; id: number; audioData: Float32Array };

// Message handler
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case "load": {
      try {
        await loadModel(
          msg.webgpuEnabled,
          msg.modelUrl,
          msg.vocabUrl,
          msg.hfRepo,
          msg.modelFile,
          msg.skipChecksum,
        );
        self.postMessage({ type: "loaded", webgpuValidationFailed });
      } catch (err) {
        self.postMessage({ type: "loadError", message: String(err) });
      }
      break;
    }

    case "extractPhonemes": {
      try {
        const phonemes = await doExtractPhonemes(msg.audioData);
        self.postMessage({ type: "result", id: msg.id, data: phonemes });
      } catch (err) {
        self.postMessage({ type: "error", id: msg.id, message: String(err) });
      }
      break;
    }

    case "extractPhonemesWithBlankInfo": {
      try {
        const result = await doExtractPhonemesWithBlankInfo(
          msg.audioData,
          msg.blankConfidenceThreshold,
        );
        self.postMessage({ type: "result", id: msg.id, data: result });
      } catch (err) {
        self.postMessage({ type: "error", id: msg.id, message: String(err) });
      }
      break;
    }

    case "extractPhonemesDetailed": {
      try {
        const result = await doExtractPhonemesDetailed(msg.audioData);
        self.postMessage({ type: "result", id: msg.id, data: result });
      } catch (err) {
        self.postMessage({ type: "error", id: msg.id, message: String(err) });
      }
      break;
    }
  }
};
