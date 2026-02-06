import fs from "fs";
import * as ort from "onnxruntime-node";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  const modelPath =
    customModelPath ||
    path.resolve(__dirname, "../../onnx/zipa-small-ctc-onnx-2026-01-28/model.onnx");
  const vocabPath =
    customVocabPath ||
    path.resolve(__dirname, "../../onnx/zipa-small-ctc-onnx-2026-01-28/vocab.json");

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

export interface PhonemeWithConfidence {
  symbol: string;
  confidence: number;
  duration: number;
}

/**
 * Extract phonemes from audio data with confidence filtering
 */
export async function extractPhonemes(
  audioData: Float32Array,
  session: ort.InferenceSession,
  idToToken: Record<number, string>,
  options: { minConfidence?: number; returnDetails?: boolean } = {},
): Promise<string | PhonemeWithConfidence[]> {
  const { minConfidence = 0.54, returnDetails = false } = options;

  // Import mel extraction - use relative import for compiled code
  const { extractLogMelJS } = await import("../speech/mel-js.js");

  const melBands = 80;
  const melFeatures = extractLogMelJS(audioData, melBands);
  const numFrames = melFeatures.length / melBands;

  const x = new ort.Tensor("float32", melFeatures, [1, numFrames, melBands]);
  const x_lens = new ort.Tensor("int64", new BigInt64Array([BigInt(numFrames)]), [1]);

  const feeds = { x, x_lens };
  const results = await session.run(feeds);

  // Handle different possible output names
  const logitsTensor = results.logits || results.log_probs || results[Object.keys(results)[0]];
  if (!logitsTensor) {
    throw new Error(`No output tensor found. Available keys: ${Object.keys(results).join(", ")}`);
  }
  const logits = logitsTensor.data;
  const seqLen = logitsTensor.dims[1];
  const vocabSize = logitsTensor.dims[2];

  // Greedy decode with confidence tracking
  interface TokenWithConfidence {
    tokenId: number;
    symbol: string;
    confidence: number;
  }

  const tokens: TokenWithConfidence[] = [];
  for (let t = 0; t < seqLen; t++) {
    let maxIdx = 0;
    let maxLogit = Number(logits[t * vocabSize]);
    for (let v = 1; v < vocabSize; v++) {
      const val = Number(logits[t * vocabSize + v]);
      if (val > maxLogit) {
        maxLogit = val;
        maxIdx = v;
      }
    }

    // Convert logit to confidence (using exp for relative comparison)
    const confidence = Math.exp(maxLogit);

    tokens.push({
      tokenId: maxIdx,
      symbol: idToToken[maxIdx] || "",
      confidence,
    });
  }

  // Group consecutive duplicates and calculate statistics
  interface GroupedPhoneme {
    tokenId: number;
    symbol: string;
    duration: number;
    confidences: number[];
    avgConfidence: number;
  }

  const grouped: GroupedPhoneme[] = [];
  let currentGroup: GroupedPhoneme | null = null;

  for (const token of tokens) {
    if (!currentGroup || currentGroup.tokenId !== token.tokenId) {
      if (currentGroup) {
        grouped.push(currentGroup);
      }
      currentGroup = {
        tokenId: token.tokenId,
        symbol: token.symbol,
        duration: 1,
        confidences: [token.confidence],
        avgConfidence: token.confidence,
      };
    } else {
      currentGroup.duration++;
      currentGroup.confidences.push(token.confidence);
    }
  }
  if (currentGroup) {
    grouped.push(currentGroup);
  }

  // Calculate average confidence for each group
  for (const group of grouped) {
    group.avgConfidence = group.confidences.reduce((a, b) => a + b, 0) / group.confidences.length;
  }

  // Filter out special tokens first
  const nonSpecialTokens = grouped.filter(
    (g) => g.tokenId !== 0 && g.symbol !== "<blk>" && g.symbol !== "▁",
  );

  // Apply boundary filtering: only filter first/last phonemes that are BOTH
  // very short (duration=1) AND low confidence. This catches noise at edges
  // while preserving valid vowels (which may have lower confidence but longer duration)
  const phonemes = nonSpecialTokens
    .filter((g, idx) => {
      const isFirstOrLast = idx === 0 || idx === nonSpecialTokens.length - 1;

      if (isFirstOrLast && g.duration === 1) {
        // At boundaries, filter very short phonemes with low confidence (likely noise)
        return g.avgConfidence >= minConfidence;
      }

      // Keep all other phonemes (middle phonemes, or boundary phonemes with duration > 1)
      return true;
    })
    .map((g) => ({
      symbol: g.symbol,
      confidence: g.avgConfidence,
      duration: g.duration,
    }));

  if (returnDetails) {
    return phonemes;
  }

  return phonemes.map((p) => p.symbol).join("");
}
