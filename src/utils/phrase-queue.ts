import type { Phrase } from "../types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Lean representation of a phrase's review history.
 * Mirrors the relevant fields of PhraseStateDoc without importing PouchDB.
 */
export interface PhraseHistory {
  phrase: string;
  nextReviewDate: number; // ms timestamp
  interval: number; // days
  averageScore: number; // 0-100
  repetitions: number;
}

export interface PhraseCandidate {
  phrase: Phrase;
  priority: number; // higher = show sooner
}

/**
 * Pure function: assign a priority score to each phrase based on review history.
 *
 * Priority bands:
 *   Overdue phrases       → 1000–1500
 *   New (never seen)      → 500 (×1.0–1.5 difficulty factor)
 *   In-progress (not due) → 0–400 (×1.0–1.5)
 *   Just reviewed well    → ≈ 0
 *
 * The difficulty factor gives phrases with lower average scores more urgency:
 *   diffFactor = 1 + (100 - averageScore) / 200   → range 1.0 (perfect) to 1.5 (0%)
 *
 * Injectable `nowMs` makes the function fully deterministic for tests.
 */
export function computePhraseQueue(
  phrases: Phrase[],
  states: Map<string, PhraseHistory>,
  nowMs: number,
): PhraseCandidate[] {
  const candidates: PhraseCandidate[] = phrases.map((p) => {
    const state = states.get(p.phrase) ?? null;

    let priority: number;

    if (state === null) {
      // Never seen — medium priority so new phrases mix in naturally
      priority = 500;
    } else {
      const overdueDays = (nowMs - state.nextReviewDate) / DAY_MS;

      if (overdueDays >= 0) {
        // Due or overdue: high priority, capped to avoid one phrase dominating
        priority = 1000 + Math.min(overdueDays * 10, 500);
      } else {
        // Not yet due: priority rises linearly as the due date approaches
        const daysUntilDue = -overdueDays;
        const interval = Math.max(state.interval, 1);
        const progress = 1 - daysUntilDue / interval; // 0 at start, 1 at due date
        priority = Math.max(0, progress) * 400;
      }

      // Difficulty multiplier: lower avg score → more urgent
      const diffFactor = 1 + (100 - state.averageScore) / 200;
      priority *= diffFactor;
    }

    return { phrase: p, priority };
  });

  // Highest priority first
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates;
}
