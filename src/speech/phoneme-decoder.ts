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
 * Phoneme equivalence classes for merging similar sounds
 * When similar phonemes split probability, merge them before decoding
 */
const PHONEME_CLASSES: Array<Set<string>> = [
  new Set(["e", "ɛ"]), // close-mid vs open-mid front vowels
  new Set(["o", "ɔ"]), // close-mid vs open-mid back vowels
  new Set(["a", "ɑ"]), // front vs back open vowels
  new Set(["i", "ɪ"]), // close vs near-close front vowels
  new Set(["u", "ʊ"]), // close vs near-close back vowels
  new Set(["ə", "ɐ"]), // schwa variations
];

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

  // Build reverse mapping: symbol -> phoneme class index
  const symbolToClass = new Map<string, number>();
  for (let i = 0; i < PHONEME_CLASSES.length; i++) {
    for (const symbol of PHONEME_CLASSES[i]) {
      symbolToClass.set(symbol, i);
    }
  }

  // Greedy decode with confidence tracking and phoneme class merging
  const tokens: TokenWithConfidence[] = [];
  for (let t = 0; t < seqLen; t++) {
    const frameOffset = t * vocabSize;

    // First pass: find all probabilities and group by phoneme class
    const classProbs = new Map<
      number,
      { totalProb: number; members: Array<{ id: number; prob: number }> }
    >();
    const ungroupedProbs: Array<{ id: number; prob: number }> = [];

    for (let v = 0; v < vocabSize; v++) {
      const logit = logitsData[frameOffset + v];
      const prob = Math.exp(logit);
      const symbol = idToToken[v] || "";
      const classIdx = symbolToClass.get(symbol);

      if (classIdx !== undefined) {
        // This symbol belongs to a phoneme class
        let classData = classProbs.get(classIdx);
        if (!classData) {
          classData = { totalProb: 0, members: [] };
          classProbs.set(classIdx, classData);
        }
        classData.totalProb += prob;
        classData.members.push({ id: v, prob });
      } else {
        // Independent phoneme
        ungroupedProbs.push({ id: v, prob });
      }
    }

    // Find the best option (either a merged class or an independent phoneme)
    let maxProb = 0;
    let selectedTokenId = 0;
    let selectedProb = 0;

    // Check phoneme classes (use sum of probabilities)
    for (const classData of classProbs.values()) {
      if (classData.totalProb > maxProb) {
        maxProb = classData.totalProb;
        // Pick the member with highest individual probability as representative
        const bestMember = classData.members.reduce((best, curr) =>
          curr.prob > best.prob ? curr : best,
        );
        selectedTokenId = bestMember.id;
        selectedProb = classData.totalProb; // Use merged probability
      }
    }

    // Check ungrouped phonemes
    for (const item of ungroupedProbs) {
      if (item.prob > maxProb) {
        maxProb = item.prob;
        selectedTokenId = item.id;
        selectedProb = item.prob;
      }
    }

    tokens.push({
      tokenId: selectedTokenId,
      symbol: idToToken[selectedTokenId] || "",
      confidence: selectedProb,
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

  // Post-process: Collapse consecutive duplicate phonemes
  // This handles cases where duplicates were separated by blanks: "n <blk> n" → "n"
  const collapsedPhonemes: GroupedPhoneme[] = [];
  for (const phoneme of filteredPhonemes) {
    const lastPhoneme = collapsedPhonemes[collapsedPhonemes.length - 1];
    if (lastPhoneme && lastPhoneme.symbol === phoneme.symbol) {
      // Merge with previous phoneme
      lastPhoneme.duration += phoneme.duration;
      lastPhoneme.confidences.push(...phoneme.confidences);
      lastPhoneme.avgConfidence =
        lastPhoneme.confidences.reduce((a, b) => a + b, 0) / lastPhoneme.confidences.length;
    } else {
      collapsedPhonemes.push(phoneme);
    }
  }

  if (returnDetails) {
    return collapsedPhonemes.map((g) => ({
      symbol: g.symbol,
      confidence: g.avgConfidence,
      duration: g.duration,
    }));
  }

  return collapsedPhonemes.map((g) => g.symbol).join("");
}
