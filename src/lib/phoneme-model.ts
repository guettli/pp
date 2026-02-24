import fs from "fs";
import os from "os";
import * as ort from "onnxruntime-node";
import path from "path";
import { MODEL_NAME, MODEL_FILE } from "./model-config.js";
import { buildPhonemeFeeds } from "../speech/phoneme-feeds.js";
import { decodePhonemes, type PhonemeWithConfidence } from "../speech/phoneme-decoder.js";

// Polyfill atob for Node.js
if (typeof globalThis.atob === "undefined") {
  globalThis.atob = (str) => Buffer.from(str, "base64").toString("binary");
}

// Cached session and vocab
let cachedSession: ort.InferenceSession | null = null;
let cachedIdToToken: Record<number, string> | null = null;

export interface LoadModelOptions {
  modelPath?: string;
  vocabPath?: string;
  useCache?: boolean;
  singleThreaded?: boolean;
}

/**
 * Load ONNX model and vocab (optionally cached)
 */
export async function loadPhonemeModel(options: LoadModelOptions = {}): Promise<{
  session: ort.InferenceSession;
  idToToken: Record<number, string>;
}> {
  const {
    modelPath: customModelPath,
    vocabPath: customVocabPath,
    useCache = true,
    singleThreaded = false,
  } = options;

  // Return cached instance if caching is enabled and available
  if (useCache && cachedSession && cachedIdToToken) {
    return { session: cachedSession, idToToken: cachedIdToToken };
  }

  // Determine paths
  const cacheDir = path.join(os.homedir(), ".cache", "phoneme-party", "models");
  const modelPath = customModelPath || path.join(cacheDir, MODEL_FILE.replace("model", MODEL_NAME));
  const vocabPath = customVocabPath || path.join(cacheDir, `${MODEL_NAME}.vocab.json`);

  if (!fs.existsSync(modelPath) || !fs.existsSync(vocabPath)) {
    throw new Error(`ONNX model or vocab not found at: ${modelPath}`);
  }

  const vocab = JSON.parse(fs.readFileSync(vocabPath, "utf8"));
  const idToToken: Record<number, string> = {};
  for (const [token, id] of Object.entries(vocab)) {
    idToToken[id as number] = token;
  }

  const sessionOptions: ort.InferenceSession.SessionOptions = {
    executionProviders: ["cpu"],
    logSeverityLevel: 3, // ERROR only — suppress onnxruntime [W:] warnings
  };

  // For worker threads, use single-threaded mode to avoid contention
  if (singleThreaded) {
    sessionOptions.intraOpNumThreads = 1;
    sessionOptions.interOpNumThreads = 1;
  }

  const session = await ort.InferenceSession.create(modelPath, sessionOptions);

  // Cache if requested
  if (useCache) {
    cachedSession = session;
    cachedIdToToken = idToToken;
  }

  return { session, idToToken };
}

// Re-export PhonemeWithConfidence from shared module
export type { PhonemeWithConfidence } from "../speech/phoneme-decoder.js";

/**
 * Extract phonemes from audio data with confidence filtering
 */
export async function extractPhonemes(
  audioData: Float32Array,
  session: ort.InferenceSession,
  idToToken: Record<number, string>,
  options: { minConfidence?: number; returnDetails?: boolean } = {},
): Promise<string | PhonemeWithConfidence[]> {
  const { minConfidence = 0.5, returnDetails = false } = options;

  const feeds = await buildPhonemeFeeds(audioData, ort.Tensor);
  const results = await session.run(feeds);

  // Handle different possible output names
  const logitsTensor = results.logits || results.log_probs || results[Object.keys(results)[0]];
  if (!logitsTensor) {
    throw new Error(`No output tensor found. Available keys: ${Object.keys(results).join(", ")}`);
  }
  const logits = logitsTensor.data as ArrayLike<number>;
  const seqLen = logitsTensor.dims[1];
  const vocabSize = logitsTensor.dims[2];

  // Use shared decoder with confidence filtering
  return decodePhonemes(logits, seqLen, vocabSize, idToToken, {
    minConfidence,
    returnDetails,
  });
}

/**
 * Extract phonemes with full details (for debugging/visualization)
 */
export async function extractPhonemesDetailed(
  audioData: Float32Array,
  session: ort.InferenceSession,
  idToToken: Record<number, string>,
): Promise<{
  phonemes: string;
  details: PhonemeWithConfidence[];
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
  const feeds = await buildPhonemeFeeds(audioData, ort.Tensor);
  const results = await session.run(feeds);

  // Handle different possible output names
  const logitsTensor = results.logits || results.log_probs || results[Object.keys(results)[0]];
  if (!logitsTensor) {
    throw new Error(`No output tensor found. Available keys: ${Object.keys(results).join(", ")}`);
  }
  const logits = logitsTensor.data as Float32Array;
  const seqLen = logitsTensor.dims[1];
  const vocabSize = logitsTensor.dims[2];

  // Get detailed phoneme information
  const detailedPhonemes = decodePhonemes(logits, seqLen, vocabSize, idToToken, {
    returnDetails: true,
  }) as PhonemeWithConfidence[];

  // Get simple phoneme string
  const phonemeString = decodePhonemes(logits, seqLen, vocabSize, idToToken, {
    returnDetails: false,
  }) as string;

  // Extract top-k predictions for each frame (for visualization)
  const topK = 7;
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
        logit: logits[frameOffset + v],
      });
    }

    // Sort by logit (descending)
    frameLogits.sort((a, b) => b.logit - a.logit);

    // Take top-k
    const topPredictions = frameLogits.slice(0, topK).map((item) => {
      const probability = Math.exp(item.logit);
      return {
        symbol: idToToken[item.tokenId] || "<unk>",
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
