/**
 * Level adjustment logic - gradually brings user's manual level toward their actual level
 */

import { db } from "../db.js";

/**
 * Adjust user's level based on their performance
 * This function gradually pulls the user's manual level toward their actual level
 *
 * @param currentUserLevel - User's current manually set level
 * @param actualLevel - User's actual level based on performance
 * @param score - Score from the last attempt (0-100)
 * @param _phraseLevel - Difficulty level of the phrase they just attempted (reserved for future use)
 * @returns New adjusted user level
 */
export function adjustUserLevel(
  currentUserLevel: number,
  actualLevel: number,
  score: number,
  _phraseLevel: number,
): number {
  // Calculate the offset (how far user has moved from their actual level)
  const offset = currentUserLevel - actualLevel;

  // If user set level too high and performed poorly, pull them down faster
  if (offset > 0 && score < 60) {
    // Poor performance on difficult material - reduce level by 5% of offset
    const adjustment = Math.ceil(offset * 0.05);
    return Math.max(actualLevel, currentUserLevel - adjustment);
  }

  // If user set level too low and performed excellently, push them up
  if (offset < 0 && score >= 95) {
    // Excellent performance on easier material - increase level by 3% of offset
    const adjustment = Math.ceil(Math.abs(offset) * 0.03);
    return Math.min(actualLevel, currentUserLevel + adjustment);
  }

  // Natural decay toward actual level (1% per attempt)
  // This slowly brings the user back to their true level regardless of performance
  if (Math.abs(offset) > 5) {
    const decay = Math.ceil(Math.abs(offset) * 0.01);
    if (offset > 0) {
      // User is above actual level, pull down
      return Math.max(actualLevel, currentUserLevel - decay);
    } else {
      // User is below actual level, pull up
      return Math.min(actualLevel, currentUserLevel + decay);
    }
  }

  // If offset is small (within 5 levels), no adjustment needed
  return currentUserLevel;
}

/**
 * Load user's manual level preference from database
 */
export async function loadUserLevel(studyLang: string): Promise<number | null> {
  return await db.getUserLevel(studyLang);
}

/**
 * Save user's manual level preference to database
 */
export async function saveUserLevel(studyLang: string, level: number): Promise<void> {
  await db.saveUserLevel(studyLang, level);
}
