/**
 * PanPhon-based phoneme distance calculation (Node.js version)
 * Uses the shared core with Node.js-compatible JSON loading
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createDistanceCalculator } from "../build/node/src/comparison/panphon-distance-core.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load PanPhon data directly using fs
const panphonDataPath = path.join(__dirname, "../build/data/panphon_features.json");
const panphonData = JSON.parse(fs.readFileSync(panphonDataPath, "utf8"));

// Polyfill atob for Node.js
const atobFn =
  typeof atob !== "undefined" ? atob : (str) => Buffer.from(str, "base64").toString("binary");

/**
 * Decode base64 binary features into a lookup table
 */
function decodePanphonFeatures() {
  const { phonemes, features: featuresBase64, featureCount } = panphonData;

  const binaryString = atobFn(featuresBase64);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const features = new Int8Array(bytes.buffer);
  const featureTable = {};

  for (let i = 0; i < phonemes.length; i++) {
    const phoneme = phonemes[i];
    const startIdx = i * featureCount;
    const endIdx = startIdx + featureCount;
    featureTable[phoneme] = Array.from(features.slice(startIdx, endIdx));
  }

  return featureTable;
}

const panphonFeatures = decodePanphonFeatures();
const calculator = createDistanceCalculator(panphonFeatures);

// Re-export with explicit signature to ensure lang parameter is required
export const calculatePanPhonDistance = (target, actual, lang) =>
  calculator.calculatePanPhonDistance(target, actual, lang);
