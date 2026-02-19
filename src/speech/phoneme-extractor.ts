/**
 * Phoneme extraction using ZIPA small CTC ONNX model
 * Outputs IPA phonemes directly from audio
 */

import { extractKaldiFbank } from "../../wasm/kaldi-fbank/index.js";
import { MODEL_NAME, HF_REPO } from "../lib/model-config.js";
import { getModelFromCache, saveModelToCache } from "./model-cache.js";
import { decodePhonemes } from "./phoneme-decoder.js";

// ONNX Runtime types
interface OrtTensor {
  data: Float32Array | BigInt64Array;
  dims: number[];
}

interface OrtInferenceSession {
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
}

interface OrtRuntime {
  InferenceSession: {
    create(buffer: ArrayBuffer, options?: Record<string, unknown>): Promise<OrtInferenceSession>;
  };
  Tensor: new (type: string, data: Float32Array | BigInt64Array, dims: number[]) => OrtTensor;
}

declare global {
  interface Window {
    ort?: OrtRuntime;
  }
}

interface ProgressInfo {
  status: string;
  name?: string;
  progress: number;
  loaded?: number;
  total?: number;
}

// Use local model when running on localhost in DEV mode to speed up loading
// In production builds, always use CDN
const IS_DEV_LOCALHOST =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

const MODEL_URL = IS_DEV_LOCALHOST
  ? `/onnx/${MODEL_NAME}/model.onnx`
  : `https://huggingface.co/${HF_REPO}/resolve/main/model.onnx`;

const VOCAB_URL = IS_DEV_LOCALHOST
  ? `/onnx/${MODEL_NAME}/vocab.json`
  : `https://huggingface.co/${HF_REPO}/resolve/main/tokens.txt`;

let session: OrtInferenceSession | null = null;
let vocab: Record<string, number> | null = null;
let idToToken: Record<number, string> | null = null;

/**
 * Load the phoneme extraction model
 */
export async function loadPhonemeModel(
  progressCallback: (info: ProgressInfo) => void,
): Promise<void> {
  // Wait for ONNX Runtime to be available
  while (!window.ort) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const ort = window.ort;

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
      name: "model.onnx",
      progress: 10,
    });

    // Configure ONNX Runtime - prefer WebGPU
    const webgpuAvailable = typeof navigator !== "undefined" && !!navigator.gpu;
    const executionProviders = webgpuAvailable ? ["webgpu", "wasm"] : ["wasm"];

    // Try to load model from IndexedDB cache first
    let modelArrayBuffer = await getModelFromCache(MODEL_URL);
    if (!modelArrayBuffer) {
      // Not cached: download and cache

      // Load model with progress tracking
      const modelResponse = await fetch(MODEL_URL);
      if (!modelResponse.ok) {
        throw new Error(`Failed to fetch model: ${modelResponse.status}`);
      }

      const contentLength = modelResponse.headers.get("content-length");
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;

      // Read response as stream for progress tracking
      if (!modelResponse.body) {
        throw new Error("Model response body is null");
      }
      const reader = modelResponse.body.getReader();
      const chunks: Uint8Array[] = [];
      let loadedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        loadedBytes += value.length;

        if (totalBytes > 0) {
          const progress = 10 + (loadedBytes / totalBytes) * 80;
          progressCallback({
            status: "downloading",
            name: "model.onnx",
            progress: Math.round(progress),
            loaded: loadedBytes,
            total: totalBytes,
          });
        }
      }

      // Combine chunks into single ArrayBuffer
      const combinedArray = new Uint8Array(loadedBytes);
      let offset = 0;
      for (const chunk of chunks) {
        combinedArray.set(chunk, offset);
        offset += chunk.length;
      }
      // Save to IndexedDB cache
      await saveModelToCache(MODEL_URL, combinedArray.buffer);
      modelArrayBuffer = combinedArray.buffer;
    }

    // Use cached or freshly downloaded model
    const modelBuffer = new Uint8Array(modelArrayBuffer);

    progressCallback({ status: "initializing", progress: 90 });

    // Create inference session
    session = await ort.InferenceSession.create(modelBuffer.buffer, {
      executionProviders,
      graphOptimizationLevel: "all",
    });

    progressCallback({ status: "ready", progress: 100 });
  } catch (error) {
    console.error("Failed to load phoneme model:", error);
    throw error;
  }
}

/**
 * Extract phonemes from audio data
 */
export async function extractPhonemes(audioData: Float32Array): Promise<string> {
  if (!session) {
    throw new Error("Phoneme model not loaded");
  }

  const ort = window.ort;
  if (!ort) {
    throw new Error("ONNX Runtime not loaded");
  }

  // Extract Kaldi Fbank features (shape: [frames, 80]) - matches ZIPA Python
  const melBands = 80;
  const melFeatures = await extractKaldiFbank(audioData);
  const numFrames = melFeatures.length / melBands;
  // Reshape to [1, numFrames, 80]
  const inputTensor = new ort.Tensor("float32", melFeatures, [1, numFrames, melBands]);
  // Prepare x_lens tensor (number of frames)
  const xLensTensor = new ort.Tensor("int64", new BigInt64Array([BigInt(numFrames)]), [1]);
  // Run inference
  const feeds = { x: inputTensor, x_lens: xLensTensor };
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

  const ort = window.ort;
  if (!ort) {
    throw new Error("ONNX Runtime not loaded");
  }

  if (!idToToken) {
    throw new Error("Vocabulary not loaded");
  }

  // Create a non-null reference for TypeScript
  const tokenMap = idToToken;

  // Extract Kaldi Fbank features (shape: [frames, 80]) - matches ZIPA Python
  const melBands = 80;
  const melFeatures = await extractKaldiFbank(audioData);
  const numFrames = melFeatures.length / melBands;

  // Reshape to [1, numFrames, 80]
  const inputTensor = new ort.Tensor("float32", melFeatures, [1, numFrames, melBands]);

  // Prepare x_lens tensor (number of frames)
  const xLensTensor = new ort.Tensor("int64", new BigInt64Array([BigInt(numFrames)]), [1]);

  // Run inference
  const feeds = { x: inputTensor, x_lens: xLensTensor };
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

  // Extract top-k predictions for each frame (for visualization)
  const topK = 5;
  const frameData: Array<{
    frameIndex: number;
    topPredictions: Array<{
      symbol: string;
      tokenId: number;
      logit: number;
      probability: number;
    }>;
  }> = [];

  // Show ALL frames (no sampling)
  for (let t = 0; t < seqLen; t++) {
    const frameOffset = t * vocabSize;

    // Get all logits for this frame
    const frameLogits: Array<{ tokenId: number; logit: number }> = [];
    for (let v = 0; v < vocabSize; v++) {
      frameLogits.push({
        tokenId: v,
        logit: logitsData[frameOffset + v],
      });
    }

    // Sort by logit (descending)
    frameLogits.sort((a, b) => b.logit - a.logit);

    // Take top-k
    const topPredictions = frameLogits.slice(0, topK).map((item) => {
      const probability = Math.exp(item.logit);
      return {
        symbol: tokenMap[item.tokenId] || "<unk>",
        tokenId: item.tokenId,
        logit: item.logit,
        probability,
      };
    });

    frameData.push({
      frameIndex: t,
      topPredictions,
    });
  }

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
