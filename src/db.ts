/**
 * Database module using PouchDB for local storage with sync capability
 */

import { PouchDB, find } from "@svouch/pouchdb";

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

  constructor() {
    // Local database
    this.db = new PouchDB("phoneme-party");

    // Create indexes for efficient queries (async, but don't block constructor)
    void this.initIndexes();
  }

  private async initIndexes() {
    try {
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

      // Index for history queries (by timestamp descending)
      await this.db.createIndex({
        index: {
          fields: ["type", "language", "timestamp"],
        },
      });
    } catch (error) {
      console.error("Error creating indexes:", error);
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
    language: string,
    score: number,
    actualIPA: string,
    targetIPA: string,
    duration: number,
  ): Promise<PhraseStateDoc> {
    const timestamp = Date.now();

    // Get current phrase state
    const stateId = `state_${language}_${phrase}`;
    let state: PhraseStateDoc;

    try {
      state = await this.db.get<PhraseStateDoc>(stateId);
    } catch {
      // First time for this phrase
      state = {
        _id: stateId,
        type: "phrase_state",
        phrase,
        language,
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
      _id: `result_${timestamp}_${language}_${phrase}`,
      type: "phrase_result",
      phrase,
      language,
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
  async getPhrasesForReview(language: string, limit = 10): Promise<PhraseStateDoc[]> {
    const now = Date.now();

    const result = await this.db.find({
      selector: {
        type: "phrase_state",
        language: language,
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
  async getAllPhraseStates(language: string): Promise<PhraseStateDoc[]> {
    const result = await this.db.find({
      selector: {
        type: "phrase_state",
        language: language,
      },
    });

    return result.docs as PhraseStateDoc[];
  }

  /**
   * Get phrase state for a specific phrase
   */
  async getPhraseState(phrase: string, language: string): Promise<PhraseStateDoc | null> {
    const stateId = `state_${language}_${phrase}`;

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
    language: string,
    limit = 20,
    skip = 0,
  ): Promise<PaginationResult<PhraseResultDoc>> {
    // Get total count first
    const countResult = await this.db.find({
      selector: {
        type: "phrase_result",
        language: language,
      },
      fields: ["_id"],
    });

    const totalCount = countResult.docs.length;

    // Get paginated results
    const result = await this.db.find({
      selector: {
        type: "phrase_result",
        language: language,
      },
      sort: [{ timestamp: "desc" }],
      limit: limit,
      skip: skip,
    });

    const docs = result.docs as PhraseResultDoc[];
    return {
      docs,
      hasMore: skip + docs.length < totalCount,
      totalCount,
    };
  }

  /**
   * Get stats for a specific phrase
   */
  async getPhraseStats(phrase: string, language: string) {
    const state = await this.getPhraseState(phrase, language);

    if (!state) {
      return null;
    }

    // Get history for this specific phrase
    const results = await this.db.find({
      selector: {
        type: "phrase_result",
        language: language,
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
    await this.initIndexes();
  }

  /**
   * Get database info
   */
  async getInfo(): Promise<PouchDB.Core.DatabaseInfo> {
    return await this.db.info();
  }
}

// Export singleton instance
export const db = new PhonemePartyDB();
