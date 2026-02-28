/**
 * PanPhon-based phoneme distance calculation (browser version)
 * Uses articulatory features for more accurate phonetic distance
 */

import panphonFeatures from "./panphon-loader.js";
import { createDistanceCalculator } from "./panphon-distance-core.js";

const calculator = createDistanceCalculator(panphonFeatures);

// Re-export with explicit signatures to ensure studyLang parameter is required
export const calculatePanPhonDistance = (target: string, actual: string, studyLang: string) =>
  calculator.calculatePanPhonDistance(target, actual, studyLang);
export const getPhonemeFeatures = calculator.getPhonemeFeatures;
export const isKnownPhoneme = calculator.isKnownPhoneme;
