/**
 * Load and decode PanPhon binary feature data
 */

import type { PhonemeFeatureTable } from "../types.js";

// For browser: Vite bundles this JSON import at build time
// For Node.js: the test workers handle JSON loading separately
import panphonData from "../../build/data/panphon_features.json";

interface PanphonData {
  phonemes: string[];
  features: string;
  featureCount: number;
}

/**
 * Decode base64 binary features into a lookup table
 */
function decodePanphonFeatures(): PhonemeFeatureTable {
  const { phonemes, features: featuresBase64, featureCount } = panphonData as PanphonData;

  // Decode base64 to binary
  const binaryString = atob(featuresBase64);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Convert to Int8Array (signed bytes: -128 to 127)
  const features = new Int8Array(bytes.buffer);

  // Build lookup table: phoneme -> feature array
  const featureTable: PhonemeFeatureTable = {};

  for (let i = 0; i < phonemes.length; i++) {
    const phoneme = phonemes[i];
    const startIdx = i * featureCount;
    const endIdx = startIdx + featureCount;

    // Extract feature slice for this phoneme
    featureTable[phoneme] = Array.from(features.slice(startIdx, endIdx));
  }

  return featureTable;
}

// Load and cache the features
const panphonFeatures: PhonemeFeatureTable = decodePanphonFeatures();

export default panphonFeatures;
