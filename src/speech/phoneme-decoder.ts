/**
 * Shared phoneme decoding logic for both web and Node.js
 * Platform-agnostic CTC decoding with confidence filtering
 */

interface TokenWithConfidence {
  tokenId: number;
  symbol: string;
  confidence: number;
}

interface GroupedPhoneme {
  tokenId: number;
  symbol: string;
  duration: number;
  confidences: number[];
  avgConfidence: number;
}

export interface PhonemeWithConfidence {
  symbol: string;
  confidence: number;
  duration: number;
}

export interface PhonemeDecoderOptions {
  /** Minimum confidence for short-duration phonemes (default: 0.54) */
  minConfidence?: number;
  /** Return detailed phoneme info instead of just string */
  returnDetails?: boolean;
}

/**
 * Decode phonemes from logits with confidence filtering
 * @param logitsData - Flat array of logits [seqLen * vocabSize]
 * @param seqLen - Sequence length (number of time steps)
 * @param vocabSize - Vocabulary size
 * @param idToToken - Mapping from token ID to symbol
 * @param options - Decoding options
 * @returns Decoded phoneme string or array of phoneme details
 */
export function decodePhonemes(
  logitsData: ArrayLike<number>,
  seqLen: number,
  vocabSize: number,
  idToToken: Record<number, string>,
  options: PhonemeDecoderOptions = {},
): string | PhonemeWithConfidence[] {
  const { minConfidence = 0.54, returnDetails = false } = options;

  // Greedy decode with confidence tracking
  const tokens: TokenWithConfidence[] = [];
  for (let t = 0; t < seqLen; t++) {
    let maxIdx = 0;
    let maxLogit = logitsData[t * vocabSize];
    for (let v = 1; v < vocabSize; v++) {
      const val = logitsData[t * vocabSize + v];
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

  // Filter out special tokens (including blank and sentence boundary)
  const nonSpecialTokens = grouped.filter(
    (g) => g.tokenId !== 0 && g.symbol !== "<blk>" && g.symbol !== "▁",
  );

  // Apply confidence filtering for short-duration phonemes
  const filteredPhonemes = nonSpecialTokens.filter((g) => {
    // Filter all very short phonemes (duration=1) with low confidence throughout sequence
    // These are often artifacts or noise from the model, particularly in the middle
    if (g.duration === 1 && g.avgConfidence < minConfidence) {
      return false;
    }

    return true;
  });

  if (returnDetails) {
    return filteredPhonemes.map((g) => ({
      symbol: g.symbol,
      confidence: g.avgConfidence,
      duration: g.duration,
    }));
  }

  return filteredPhonemes.map((g) => g.symbol).join("");
}
