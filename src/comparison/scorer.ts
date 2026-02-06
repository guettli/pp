/**
 * Pronunciation scoring logic using PanPhon phoneme features
 */

import { calculateIPADistance } from "./distance.js";
import { calculatePanPhonDistance } from "./panphon-distance.js";
import { t } from "../i18n.js";
import type { Score } from "../types.js";

/**
 * Score pronunciation based on phoneme feature similarity using PanPhon
 */
export function scorePronunciation(targetIPA: string, actualIPA: string): Score {
  // Use PanPhon-based phoneme distance for more accurate scoring
  const panphonResult = calculatePanPhonDistance(targetIPA, actualIPA);
  const { distance: dist, similarity, phonemeComparison } = panphonResult;

  // Also calculate basic Levenshtein for fallback/comparison
  const basicResult = calculateIPADistance(targetIPA, actualIPA);

  let grade: string;
  let color: string;
  let message: string;
  let bootstrapClass: string;

  // Determine grade based on PanPhon similarity threshold
  // PanPhon is more lenient with phonetically similar sounds
  if (similarity >= 0.85) {
    grade = t("score.excellent");
    color = "success";
    bootstrapClass = "alert-success";
    message = t("score.message.excellent");
  } else if (similarity >= 0.65) {
    grade = t("score.good");
    color = "primary";
    bootstrapClass = "alert-primary";
    message = t("score.message.good");
  } else if (similarity >= 0.45) {
    grade = t("score.fair");
    color = "warning";
    bootstrapClass = "alert-warning";
    message = t("score.message.fair");
  } else {
    grade = t("score.try_again");
    color = "danger";
    bootstrapClass = "alert-danger";
    message = t("score.message.try_again");
  }

  return {
    grade,
    color,
    bootstrapClass,
    message,
    similarity,
    similarityPercent: Math.round(similarity * 100),
    distance: dist,
    phonemeComparison,
    targetPhonemes: panphonResult.targetPhonemes,
    actualPhonemes: panphonResult.actualPhonemes,
    basicSimilarity: basicResult.similarity, // For comparison
  };
}
