/**
 * PanPhon-based phoneme distance calculation (browser version)
 * Uses articulatory features for more accurate phonetic distance
 */

import panphonFeatures from './panphon-loader.js';
import { createDistanceCalculator } from './panphon-distance-core.js';

const calculator = createDistanceCalculator(panphonFeatures);

export const calculatePanPhonDistance = calculator.calculatePanPhonDistance;
export const getPhonemeFeatures = calculator.getPhonemeFeatures;
export const isKnownPhoneme = calculator.isKnownPhoneme;
