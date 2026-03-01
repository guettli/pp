import { db } from "../db.js";
import type { Phrase, SupportedLanguage } from "../types.js";
import { getAllPhrases, filterByLevel } from "./random.js";
import { computePhraseQueue } from "./phrase-queue.js";
import type { PhraseHistory } from "./phrase-queue.js";

/**
 * Return the top-N phrase texts by priority score for prefetch purposes.
 * Unlike selectNextPhrase, this is deterministic (no random top-3 sampling).
 */
export async function getTopPhrasesForPrefetch(
  phraseLang: SupportedLanguage,
  userLevel: number,
  studyLang: string,
  n: number = 100,
): Promise<string[]> {
  const levelFiltered = filterByLevel(getAllPhrases(phraseLang), userLevel);
  const stateList = await db.getAllPhraseStates(studyLang);
  const stateMap = new Map<string, PhraseHistory>(
    stateList.map((s) => [
      s.phrase,
      {
        phrase: s.phrase,
        nextReviewDate: s.nextReviewDate,
        interval: s.interval,
        averageScore: s.averageScore,
        repetitions: s.repetitions,
      },
    ]),
  );
  const queue = computePhraseQueue(levelFiltered, stateMap, Date.now());
  return queue.slice(0, n).map((c) => c.phrase.phrase);
}

/**
 * Select the next phrase to show using spaced repetition.
 *
 * Steps:
 *  1. Filter phrases to the user's level window.
 *  1b. Apply optional audio filter (only phrases with audio available).
 *  2. Load all phrase states from the DB.
 *  3. Score each phrase with computePhraseQueue.
 *  4. Exclude recently shown phrases if alternatives exist (short-term dedup).
 *  5. Pick randomly from the top 3 to add some variety.
 *
 * Never loops; all operations are a single pass + sort.
 */
export async function selectNextPhrase(
  phraseLang: SupportedLanguage,
  userLevel: number,
  studyLang: string,
  recentPhrases: string[],
  nowMs: number = Date.now(),
  hasAudio: ((phraseText: string) => boolean) | null = null,
): Promise<Phrase> {
  // 1. Level-filtered candidate pool
  const levelFiltered = filterByLevel(getAllPhrases(phraseLang), userLevel);

  // 1b. Restrict to phrases that have pre-generated audio (if filter provided)
  const audioFiltered =
    hasAudio !== null ? levelFiltered.filter((p) => hasAudio(p.phrase)) : levelFiltered;

  // 2. Load all phrase states from DB
  const stateList = await db.getAllPhraseStates(studyLang);
  const stateMap = new Map<string, PhraseHistory>(
    stateList.map((s) => [
      s.phrase,
      {
        phrase: s.phrase,
        nextReviewDate: s.nextReviewDate,
        interval: s.interval,
        averageScore: s.averageScore,
        repetitions: s.repetitions,
      },
    ]),
  );

  // 3. Compute priority-sorted queue
  const queue = computePhraseQueue(audioFiltered, stateMap, nowMs);

  // 4. Remove recently shown phrases from the top if alternatives exist
  const recentSet = new Set(recentPhrases);
  const filtered = queue.filter((c) => !recentSet.has(c.phrase.phrase));
  const pool = filtered.length > 0 ? filtered : queue;

  // 5. Pick randomly from top 3 for variety (top 1 would always repeat same phrase)
  const topN = Math.min(3, pool.length);
  const idx = Math.floor(Math.random() * topN);
  return pool[idx].phrase;
}
