/**
 * Phoneme extraction using ZIPA small CTC ONNX model
 * Outputs IPA phonemes directly from audio
 */

import * as ort from "onnxruntime-web/webgpu";
import { buildPhonemeFeeds } from "./phoneme-feeds.js";
import { MODEL_NAME, HF_REPO, MODEL_FILE } from "../lib/model-config.js";
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
// Save partial download to IndexedDB every 5 MB to limit write overhead
const PARTIAL_SAVE_INTERVAL = 5 * 1024 * 1024;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Use WebGPU only when the GPU adapter supports shader-f16.
 * Qualcomm Adreno GPUs (most Android devices) lack Vulkan shader-f16 support,
 * causing fp16 models to produce garbage output. Fall back to WASM in that case.
 */
async function getExecutionProviders(): Promise<string[]> {
  if (typeof navigator === "undefined" || !navigator.gpu) {
    return ["wasm"];
  }
  if (localStorage.getItem("webgpu-enabled") !== "true") {
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

  // Server ignored Range request — discard stale partial data
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

    // Periodically persist partial progress (fire-and-forget)
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

// Use local model when running on localhost in DEV mode to speed up loading
// In production builds, always use CDN
const IS_DEV_LOCALHOST =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

/**
 * Fetch the expected SHA-256 of the model file from HuggingFace tree API.
 * Returns null in dev mode or if the request fails (e.g. offline).
 */
async function fetchHFChecksum(): Promise<string | null> {
  if (IS_DEV_LOCALHOST) return null;
  try {
    const resp = await fetch(`https://huggingface.co/api/models/${HF_REPO}/tree/main`);
    if (!resp.ok) return null;
    const files = (await resp.json()) as Array<{ path: string; lfs?: { oid: string } }>;
    const entry = files.find((f) => f.path === MODEL_FILE);
    return entry?.lfs?.oid ?? null;
  } catch {
    return null;
  }
}

const MODEL_URL = IS_DEV_LOCALHOST
  ? `/onnx/${MODEL_NAME}/${MODEL_FILE}`
  : `https://huggingface.co/${HF_REPO}/resolve/main/${MODEL_FILE}`;

const VOCAB_URL = IS_DEV_LOCALHOST
  ? `/onnx/${MODEL_NAME}/vocab.json`
  : `https://huggingface.co/${HF_REPO}/resolve/main/tokens.txt`;

let session: ort.InferenceSession | null = null;
let vocab: Record<string, number> | null = null;
let idToToken: Record<number, string> | null = null;

// Tracks whether the WebGPU session failed validation and was replaced by WASM
let webgpuValidationFailed = false;

export function wasWebGpuValidationFailed(): boolean {
  return webgpuValidationFailed;
}

/**
 * Run a short silent inference to check if the current session produces sane output.
 * Some GPUs advertise shader-f16 but produce NaN in fp16 computations.
 * Returns true if output looks valid, false if NaN/Inf detected.
 */
async function validateSession(): Promise<boolean> {
  if (!session) return false;
  try {
    // 1 second of silence at 16 kHz — small enough to be fast, big enough for the model
    const silence = new Float32Array(16000);
    const feeds = await buildPhonemeFeeds(silence, ort.Tensor);
    const results = await session.run(feeds);
    const logits = results.logits ?? results.log_probs ?? results[Object.keys(results)[0]];
    if (!logits) return false;
    const data = logits.data as Float32Array;
    // Check first 500 values for NaN/Inf — broken fp16 always contaminates these
    for (let i = 0; i < Math.min(data.length, 500); i++) {
      if (!isFinite(data[i])) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Load the phoneme extraction model
 */
export async function loadPhonemeModel(
  progressCallback: (info: ProgressInfo) => void,
): Promise<void> {
  if (session !== null) {
    progressCallback({ status: "ready", progress: 100 });
    return;
  }
  try {
    // Load vocab first (small)
    progressCallback({
      status: "downloading",
      name: "vocab",
      progress: 0,
    });

    const vocabResponse = await fetch(VOCAB_URL);
    if (!vocabResponse.ok) {
      throw new Error(`Failed to fetch vocab: ${vocabResponse.status}`);
    }

    // Parse tokens.txt (CDN) or vocab.json (local dev): build id->token map
    idToToken = {};
    vocab = {};
    const vocabText = await vocabResponse.text();
    if (VOCAB_URL.endsWith(".txt")) {
      // tokens.txt format: "token id" per line
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
      // vocab.json format: {"token": id, ...}
      vocab = JSON.parse(vocabText) as Record<string, number>;
      for (const [token, id] of Object.entries(vocab)) {
        idToToken[id as unknown as number] = token;
      }
    }

    progressCallback({
      status: "downloading",
      name: MODEL_NAME,
      progress: 10,
    });

    // Use WebGPU only when shader-f16 is supported (Qualcomm Adreno lacks it)
    const executionProviders = await getExecutionProviders();

    // Try to load model from IndexedDB cache first
    let modelArrayBuffer = await getModelFromCache(MODEL_URL);
    if (modelArrayBuffer) {
      progressCallback({ status: "loading_from_cache", progress: 20 });
      // Verify checksum: prefer remote (detects HF updates), fall back to stored (detects corruption)
      const [storedChecksum, remoteChecksum, actualChecksum] = await Promise.all([
        getModelChecksum(MODEL_URL),
        fetchHFChecksum(),
        computeSHA256(modelArrayBuffer),
      ]);
      const referenceChecksum = remoteChecksum ?? storedChecksum;
      if (!referenceChecksum || actualChecksum !== referenceChecksum) {
        console.warn("Cached model checksum mismatch — redownloading");
        await deleteModelFromCache(MODEL_URL);
        modelArrayBuffer = null;
      }
    }
    if (!modelArrayBuffer) {
      // Not cached (or evicted): download with automatic retry and resume support
      modelArrayBuffer = await downloadWithRetryAndResume(
        MODEL_URL,
        (loaded, total) => {
          if (total > 0) {
            const progress = 10 + (loaded / total) * 80;
            progressCallback({
              status: "downloading",
              name: MODEL_NAME,
              progress: Math.round(progress),
              loaded,
              total,
            });
          }
        },
        (attempt, maxRetries) => {
          progressCallback({
            status: "retrying",
            name: MODEL_NAME,
            progress: 10,
            attempt,
            max: maxRetries,
          });
        },
      );

      // Persist complete download, store checksum, drop partial-download entry
      await saveModelToCache(MODEL_URL, modelArrayBuffer);
      await saveModelChecksum(MODEL_URL, await computeSHA256(modelArrayBuffer));
      void clearPartialDownload(MODEL_URL);
    }

    // Use cached or freshly downloaded model
    const modelBuffer = new Uint8Array(modelArrayBuffer);

    progressCallback({ status: "initializing", progress: 90 });

    // Create inference session
    session = await ort.InferenceSession.create(modelBuffer.buffer, {
      executionProviders,
      graphOptimizationLevel: "all",
    });

    // Validate output: some GPUs advertise shader-f16 but produce NaN in fp16 computations.
    // If validation fails, recreate the session with WASM only.
    if (executionProviders[0] === "webgpu" && !(await validateSession())) {
      console.warn("WebGPU validation failed (NaN detected) — falling back to WASM");
      webgpuValidationFailed = true;
      session = await ort.InferenceSession.create(modelBuffer.buffer, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
    }

    progressCallback({ status: "ready", progress: 100 });
  } catch (error) {
    console.error("Failed to load phoneme model:", error);
    throw error;
  }
}

/**
 * Extract phonemes and count trailing frames where the blank token (CTC ⎵) has high confidence.
 * Used to detect end-of-speech: chars detected followed by N blank frames.
 */
export async function extractPhonemesWithBlankInfo(
  audioData: Float32Array,
  blankConfidenceThreshold = 0.95,
): Promise<{ phonemes: string; trailingBlankFrames: number }> {
  if (!session) {
    throw new Error("Phoneme model not loaded");
  }
  if (!idToToken) {
    throw new Error("Vocabulary not loaded");
  }

  const feeds = await buildPhonemeFeeds(audioData, ort.Tensor);
  const results = await session.run(feeds);
  let logits = results.logits || results.log_probs;
  if (!logits) {
    const firstKey = Object.keys(results)[0];
    logits = results[firstKey];
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

  // Count trailing frames where blank token (ID=0) probability exceeds threshold
  let trailingBlankFrames = 0;
  for (let t = seqLen - 1; t >= 0; t--) {
    const blankProb = Math.exp(logitsData[t * vocabSize]); // token ID 0 is <blk>
    if (blankProb > blankConfidenceThreshold) {
      trailingBlankFrames++;
    } else {
      break;
    }
  }

  return { phonemes, trailingBlankFrames };
}

/**
 * Extract phonemes from audio data
 */
export async function extractPhonemes(audioData: Float32Array): Promise<string> {
  if (!session) {
    throw new Error("Phoneme model not loaded");
  }

  const feeds = await buildPhonemeFeeds(audioData, ort.Tensor);
  const results = await session.run(feeds);
  let logits = results.logits || results.log_probs;
  if (!logits) {
    // Try to use the first output if logits is not found
    const firstKey = Object.keys(results)[0];
    logits = results[firstKey];
  }
  if (!logits) {
    throw new Error(
      "No logits output found in ONNX results. Available keys: " + Object.keys(results).join(", "),
    );
  }
  const logitsData = logits.data as Float32Array;
  const [, seqLen, vocabSize] = logits.dims;

  // Use shared decoder with confidence filtering
  if (!idToToken) {
    throw new Error("Vocabulary not loaded");
  }

  return decodePhonemes(logitsData, seqLen, vocabSize, idToToken, {
    returnDetails: false,
  }) as string;
}

/**
 * Extract phonemes from audio data with full details (for debugging/visualization)
 */
export async function extractPhonemesDetailed(audioData: Float32Array): Promise<{
  phonemes: string;
  details: Array<{
    symbol: string;
    confidence: number;
    duration: number;
  }>;
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
  if (!session) {
    throw new Error("Phoneme model not loaded");
  }

  if (!idToToken) {
    throw new Error("Vocabulary not loaded");
  }

  // Create a non-null reference for TypeScript
  const tokenMap = idToToken;

  const feeds = await buildPhonemeFeeds(audioData, ort.Tensor);
  const results = await session.run(feeds);

  let logits = results.logits || results.log_probs;
  if (!logits) {
    const firstKey = Object.keys(results)[0];
    logits = results[firstKey];
  }
  if (!logits) {
    throw new Error(
      "No logits output found in ONNX results. Available keys: " + Object.keys(results).join(", "),
    );
  }

  const logitsData = logits.data as Float32Array;
  const [, seqLen, vocabSize] = logits.dims;

  // Get detailed phoneme information
  const detailedPhonemes = decodePhonemes(logitsData, seqLen, vocabSize, tokenMap, {
    returnDetails: true,
  }) as Array<{ symbol: string; confidence: number; duration: number }>;

  // Get simple phoneme string
  const phonemeString = decodePhonemes(logitsData, seqLen, vocabSize, tokenMap, {
    returnDetails: false,
  }) as string;

  const frameData = extractFrameData(logitsData, seqLen, vocabSize, tokenMap, 5);

  return {
    phonemes: phonemeString,
    details: detailedPhonemes,
    raw: {
      frames: seqLen,
      vocabSize,
      frameData,
    },
  };
}

/**
 * Check if model is loaded
 * @returns {boolean}
 */
export function isPhonemeModelLoaded() {
  return session !== null && vocab !== null;
}

/**
 * Get the vocabulary
 */
export function getVocab(): Record<string, number> | null {
  return vocab;
}
