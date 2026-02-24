/**
 * Database module using PouchDB for local storage with sync capability
 */

import { PouchDB, find } from "@svouch/pouchdb";
import type { UserStats } from "./types.js";
import { findPhraseByName } from "./utils/random.js";

// Apply the find plugin to enable createIndex and find methods
PouchDB.plugin(find);

export interface PhraseResultDoc {
  _id: string; // Format: "result_{timestamp}_{language}_{phrase}"
  _rev?: string; // PouchDB revision (for sync)
  type: "phrase_result";

  // User identity (for future multi-user sync)
  userId?: string;

  // Phrase data
  phrase: string;
  language: string;
  timestamp: number;
  score: number; // 0-100
  actualIPA: string;
  targetIPA: string;
  duration: number; // milliseconds

  // Spaced repetition fields
  nextReviewDate: number;
  interval: number; // days
  easeFactor: number;
  repetitions: number;
}

export interface PhraseStateDoc {
  _id: string; // Format: "state_{language}_{phrase}"
  _rev?: string;
  type: "phrase_state";

  userId?: string;
  phrase: string;
  language: string;

  // Latest state
  lastAttempt: number;
  nextReviewDate: number;
  interval: number;
  easeFactor: number;
  repetitions: number;
  totalAttempts: number;
  averageScore: number;
  bestScore: number;
}

export interface PaginationResult<T> {
  docs: T[];
  hasMore: boolean;
  totalCount: number;
}

class PhonemePartyDB {
  private db: PouchDB.Database;
  private remoteDB?: PouchDB.Database;
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  private syncHandler?: PouchDB.Replication.Sync<{}>;
  private indexesReady: Promise<void>;

  constructor() {
    // Local database
    this.db = new PouchDB("phoneme-party");

    // Create indexes for efficient queries and track when they're ready
    this.indexesReady = this.initIndexes();
  }

  private async initIndexes() {
    try {
      console.log("Creating PouchDB indexes...");

      // Index for getting phrases by language and next review date
      await this.db.createIndex({
        index: {
          fields: ["type", "language", "nextReviewDate"],
        },
      });

      // Index for getting phrase states
      await this.db.createIndex({
        index: {
          fields: ["type", "language", "phrase"],
        },
      });

      // Index for history queries (by timestamp)
      // PouchDB requires all selector fields + sort fields in the index
      await this.db.createIndex({
        index: {
          name: "history-index",
          fields: ["type", "language", "timestamp"],
        },
      });

      console.log("PouchDB indexes created successfully");
    } catch (error) {
      console.error("Error creating indexes:", error);
      throw error; // Propagate error so callers know initialization failed
    }
  }

  /**
   * Enable sync with remote CouchDB server (for future use)
   */
  enableSync(remoteUrl: string, username?: string, password?: string) {
    const opts: PouchDB.Configuration.RemoteDatabaseConfiguration = {};

    if (username && password) {
      opts.auth = { username, password };
    }

    this.remoteDB = new PouchDB(remoteUrl, opts);

    // Live, bidirectional sync
    // Note: this.remoteDB is guaranteed to be defined here as we just assigned it
    this.syncHandler = this.db
      .sync(this.remoteDB as PouchDB.Database, {
        live: true,
        retry: true,
      })
      .on("change", (info: unknown) => {
        console.log("Sync change:", info);
      })
      .on("error", (err: unknown) => {
        console.error("Sync error:", err);
      });
  }

  /**
   * Disable sync
   */
  disableSync() {
    if (this.syncHandler) {
      this.syncHandler.cancel();
      this.syncHandler = undefined;
    }
  }

  /**
   * Calculate next review using SM-2 spaced repetition algorithm
   */
  private calculateNextReview(
    score: number,
    currentInterval: number,
    currentEaseFactor: number,
    currentRepetitions: number,
  ): {
    nextReviewDate: number;
    interval: number;
    easeFactor: number;
    repetitions: number;
  } {
    // Convert 0-100 score to 0-5 quality scale
    const quality = Math.floor(score / 20);

    // Update ease factor
    let easeFactor = currentEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    easeFactor = Math.max(1.3, easeFactor);

    let interval: number;
    let repetitions = currentRepetitions;

    if (quality < 3) {
      // Score < 60% - reset interval
      interval = 1;
      repetitions = 0;
    } else {
      // Good score - increase interval
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 6;
      } else {
        interval = Math.round(currentInterval * easeFactor);
      }
      repetitions++;
    }

    const nextReviewDate = Date.now() + interval * 24 * 60 * 60 * 1000;

    return { nextReviewDate, interval, easeFactor, repetitions };
  }

  /**
   * Save a phrase training result
   */
  async savePhraseResult(
    phrase: string,
    studyLang: string,
    score: number,
    actualIPA: string,
    targetIPA: string,
    duration: number,
  ): Promise<PhraseStateDoc> {
    const timestamp = Date.now();

    // Get current phrase state
    const stateId = `state_${studyLang}_${phrase}`;
    let state: PhraseStateDoc;

    try {
      state = await this.db.get<PhraseStateDoc>(stateId);
    } catch {
      // First time for this phrase
      state = {
        _id: stateId,
        type: "phrase_state",
        phrase,
        language: studyLang,
        lastAttempt: 0,
        nextReviewDate: 0,
        interval: 0,
        easeFactor: 2.5,
        repetitions: 0,
        totalAttempts: 0,
        averageScore: 0,
        bestScore: 0,
      };
    }

    // Calculate next review
    const { nextReviewDate, interval, easeFactor, repetitions } = this.calculateNextReview(
      score,
      state.interval,
      state.easeFactor,
      state.repetitions,
    );

    // Update state
    state.lastAttempt = timestamp;
    state.nextReviewDate = nextReviewDate;
    state.interval = interval;
    state.easeFactor = easeFactor;
    state.repetitions = repetitions;
    state.totalAttempts++;
    state.averageScore =
      (state.averageScore * (state.totalAttempts - 1) + score) / state.totalAttempts;
    state.bestScore = Math.max(state.bestScore, score);

    // Save state (this updates existing doc with new _rev)
    await this.db.put(state);

    // Save individual result for history
    const resultDoc: PhraseResultDoc = {
      _id: `result_${timestamp}_${studyLang}_${phrase}`,
      type: "phrase_result",
      phrase,
      language: studyLang,
      timestamp,
      score,
      actualIPA,
      targetIPA,
      duration,
      nextReviewDate,
      interval,
      easeFactor,
      repetitions,
    };

    await this.db.put(resultDoc);

    return state;
  }

  /**
   * Get phrases that are due for review
   */
  async getPhrasesForReview(studyLang: string, limit = 10): Promise<PhraseStateDoc[]> {
    // Wait for indexes to be ready before querying
    await this.indexesReady;

    const now = Date.now();

    const result = await this.db.find({
      selector: {
        type: "phrase_state",
        language: studyLang,
        nextReviewDate: { $lte: now },
      },
      sort: [{ nextReviewDate: "asc" }],
      limit: limit,
    });

    return result.docs as PhraseStateDoc[];
  }

  /**
   * Get all phrase states for a language
   */
  async getAllPhraseStates(studyLang: string): Promise<PhraseStateDoc[]> {
    // Wait for indexes to be ready before querying
    await this.indexesReady;

    const result = await this.db.find({
      selector: {
        type: "phrase_state",
        language: studyLang,
      },
    });

    return result.docs as PhraseStateDoc[];
  }

  /**
   * Get phrase state for a specific phrase
   */
  async getPhraseState(phrase: string, studyLang: string): Promise<PhraseStateDoc | null> {
    const stateId = `state_${studyLang}_${phrase}`;

    try {
      const doc = await this.db.get<PhraseStateDoc>(stateId);
      return doc as PhraseStateDoc;
    } catch {
      return null; // Never attempted
    }
  }

  /**
   * Get history of all attempts with pagination (for infinite scroll)
   * Returns newest first (descending by timestamp)
   */
  async getHistory(
    studyLang: string,
    limit = 20,
    skip = 0,
  ): Promise<PaginationResult<PhraseResultDoc>> {
    // Wait for indexes to be ready before querying
    await this.indexesReady;

    // Get total count first
    const countResult = await this.db.find({
      selector: {
        type: "phrase_result",
        language: studyLang,
      },
      fields: ["_id"],
    });

    const totalCount = countResult.docs.length;

    // Get paginated results
    // Note: PouchDB requires sorting by all index fields in order
    // Index is ["type", "language", "timestamp"], so we sort by all three
    // PouchDB limitation: all sort directions must be the same, so we fetch in asc order
    // and reverse manually to get newest first
    //
    // To get newest-first pagination, we need to calculate skip from the end:
    // - For skip=0, limit=20: we want items at positions [totalCount-20, totalCount)
    // - For skip=20, limit=20: we want items at positions [totalCount-40, totalCount-20)
    const adjustedSkip = Math.max(0, totalCount - skip - limit);
    const adjustedLimit = Math.min(limit, totalCount - skip);

    const result = await this.db.find({
      selector: {
        type: "phrase_result",
        language: studyLang,
        timestamp: { $exists: true }, // Ensure timestamp field is in selector to match index
      },
      sort: [{ type: "asc" }, { language: "asc" }, { timestamp: "asc" }],
      limit: adjustedLimit,
      skip: adjustedSkip,
    });

    // Reverse to get newest first (since PouchDB returned oldest first)
    const docs = (result.docs as PhraseResultDoc[]).reverse();
    return {
      docs,
      hasMore: skip + docs.length < totalCount,
      totalCount,
    };
  }

  /**
   * Get stats for a specific phrase
   */
  async getPhraseStats(phrase: string, studyLang: string) {
    // Wait for indexes to be ready before querying
    await this.indexesReady;

    const state = await this.getPhraseState(phrase, studyLang);

    if (!state) {
      return null;
    }

    // Get history for this specific phrase
    const results = await this.db.find({
      selector: {
        type: "phrase_result",
        language: studyLang,
        phrase: phrase,
      },
      sort: [{ timestamp: "asc" }],
    });

    return {
      state,
      history: results.docs as PhraseResultDoc[],
    };
  }

  /**
   * Get user statistics based on last 30 attempts
   * User level is calculated as the 80th percentile of mastered phrase levels
   */
  async getUserStats(studyLang: string): Promise<UserStats> {
    // Wait for indexes to be ready
    await this.indexesReady;

    // Get last 30 results
    const result = await this.db.find({
      selector: {
        type: "phrase_result",
        language: studyLang,
        timestamp: { $exists: true },
      },
      sort: [{ type: "asc" }, { language: "asc" }, { timestamp: "desc" }],
      limit: 30,
    });

    const docs = result.docs as PhraseResultDoc[];

    // Filter for mastered phrases (score ≥95%)
    const mastered = docs.filter((doc) => doc.score >= 95);

    // Get phrase levels for mastered phrases
    const levels: number[] = [];
    for (const doc of mastered) {
      const phrase = findPhraseByName(doc.phrase, studyLang);
      if (phrase?.level) {
        levels.push(phrase.level);
      }
    }

    // Calculate 80th percentile
    let userLevel = 1; // Default to level 1
    if (levels.length > 0) {
      // Sort levels in ascending order
      levels.sort((a, b) => a - b);

      // Calculate 80th percentile index
      const index = Math.ceil(levels.length * 0.8) - 1;
      userLevel = levels[Math.max(0, index)];
    }

    return {
      userLevel,
      masteredCount: mastered.length,
      totalInWindow: docs.length,
      language: studyLang,
    };
  }

  /**
   * Get all data (for debugging/export)
   */
  async getAllData(): Promise<unknown[]> {
    const result = await this.db.allDocs({ include_docs: true });
    const docs: unknown[] = [];
    for (const row of result.rows) {
      if (row.doc !== undefined) {
        docs.push(row.doc as unknown);
      }
    }
    return docs;
  }

  /**
   * Clear all data (for testing)
   */
  async clearAll() {
    await this.db.destroy();
    // Recreate
    this.db = new PouchDB("phoneme-party");
    this.indexesReady = this.initIndexes();
    await this.indexesReady;
  }

  /**
   * Get database info
   */
  async getInfo(): Promise<PouchDB.Core.DatabaseInfo> {
    return await this.db.info();
  }

  /**
   * Save preferred voice for a language
   */
  async savePreferredVoice(studyLang: string, voiceName: string): Promise<void> {
    const docId = `voice_pref_${studyLang}`;
    try {
      // Try to get existing doc
      const existingDoc = await this.db.get(docId);
      await this.db.put({
        ...existingDoc,
        voiceName,
        timestamp: Date.now(),
      });
    } catch {
      // Create new doc if doesn't exist
      await this.db.put({
        _id: docId,
        type: "voice_preference",
        language: studyLang,
        voiceName,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get preferred voice for a language
   */
  async getPreferredVoice(studyLang: string): Promise<string | null> {
    const docId = `voice_pref_${studyLang}`;
    try {
      const doc = (await this.db.get(docId)) as { voiceName: string };
      return doc.voiceName;
    } catch {
      return null; // No preference saved
    }
  }

  /**
   * Save user's manual level preference for a language
   */
  async saveUserLevel(studyLang: string, userLevel: number): Promise<void> {
    const docId = `user_level_${studyLang}`;
    try {
      // Try to get existing doc
      const existingDoc = await this.db.get(docId);
      await this.db.put({
        ...existingDoc,
        userLevel,
        timestamp: Date.now(),
      });
    } catch {
      // Create new doc if doesn't exist
      await this.db.put({
        _id: docId,
        type: "user_level_preference",
        language: studyLang,
        userLevel,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get user's manual level preference for a language
   */
  async getUserLevel(studyLang: string): Promise<number | null> {
    const docId = `user_level_${studyLang}`;
    try {
      const doc = (await this.db.get(docId)) as { userLevel: number };
      return doc.userLevel;
    } catch {
      return null; // No preference saved
    }
  }
}

// Export singleton instance
export const db = new PhonemePartyDB();
