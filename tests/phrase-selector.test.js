/**
 * Unit tests for the spaced-repetition phrase selection algorithm.
 *
 * Tests only computePhraseQueue (pure function) — no DB, no Playwright.
 * Run with: node tests/phrase-selector.test.js
 */

import { computePhraseQueue } from "../build/node/src/utils/phrase-queue.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

function makePhrase(text, level = 100) {
  return { phrase: text, emoji: "🔤", ipas: [{ ipa: text, category: "test" }], level };
}

function makeState(phrase, { nextReviewDate, interval, averageScore, repetitions }) {
  return { phrase, nextReviewDate, interval, averageScore, repetitions };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const NOW = 1_000_000 * DAY_MS; // arbitrary fixed timestamp

console.log("\nPhrase Selector — computePhraseQueue\n");

// ── Test 1: Never-seen phrases all get priority 500 ───────────────────────────
{
  console.log("1. Never-seen phrases get base priority 500");
  const phrases = [makePhrase("cat"), makePhrase("dog"), makePhrase("bird")];
  const states = new Map();
  const queue = computePhraseQueue(phrases, states, NOW);

  assert(queue.length === 3, "queue contains all 3 phrases");
  assert(
    queue.every((c) => c.priority === 500),
    "all priorities are exactly 500",
  );
}

// ── Test 2: Overdue phrase has priority ≥ 1000 ────────────────────────────────
{
  console.log("\n2. Overdue phrase gets priority ≥ 1000");
  const phrases = [makePhrase("cat"), makePhrase("dog")];
  const states = new Map([
    [
      "cat",
      makeState("cat", {
        nextReviewDate: NOW - 2 * DAY_MS, // 2 days overdue
        interval: 6,
        averageScore: 80,
        repetitions: 3,
      }),
    ],
  ]);
  const queue = computePhraseQueue(phrases, states, NOW);

  const catCandidate = queue.find((c) => c.phrase.phrase === "cat");
  const dogCandidate = queue.find((c) => c.phrase.phrase === "dog");
  assert(catCandidate.priority >= 1000, `overdue phrase priority=${catCandidate.priority} ≥ 1000`);
  assert(
    catCandidate.priority > dogCandidate.priority,
    `overdue cat (${catCandidate.priority.toFixed(1)}) outranks unseen dog (${dogCandidate.priority})`,
  );
  assert(queue[0].phrase.phrase === "cat", "overdue phrase is first in queue");
}

// ── Test 3: Just-reviewed phrase with high score has low priority ─────────────
{
  console.log("\n3. Recently reviewed, high score → low priority");
  const phrases = [makePhrase("cat"), makePhrase("dog")];
  const states = new Map([
    [
      "cat",
      makeState("cat", {
        nextReviewDate: NOW + 6 * DAY_MS, // due in 6 days
        interval: 6, // just reviewed today
        averageScore: 100,
        repetitions: 5,
      }),
    ],
  ]);
  const queue = computePhraseQueue(phrases, states, NOW);

  const catCandidate = queue.find((c) => c.phrase.phrase === "cat");
  const dogCandidate = queue.find((c) => c.phrase.phrase === "dog");
  assert(
    catCandidate.priority < dogCandidate.priority,
    `recently reviewed cat (${catCandidate.priority.toFixed(1)}) < unseen dog (${dogCandidate.priority})`,
  );
  assert(
    catCandidate.priority < 10,
    `just-reviewed high-score priority ≈ 0 (got ${catCandidate.priority.toFixed(2)})`,
  );
}

// ── Test 4: Difficulty multiplier boosts low-score phrases ────────────────────
{
  console.log("\n4. Difficulty multiplier: low-score phrase outranks high-score when both due");
  const phrases = [makePhrase("easy"), makePhrase("hard")];
  const states = new Map([
    [
      "easy",
      makeState("easy", {
        nextReviewDate: NOW, // due exactly now
        interval: 6,
        averageScore: 100, // perfect score
        repetitions: 4,
      }),
    ],
    [
      "hard",
      makeState("hard", {
        nextReviewDate: NOW, // due exactly now
        interval: 6,
        averageScore: 20, // poor score
        repetitions: 4,
      }),
    ],
  ]);
  const queue = computePhraseQueue(phrases, states, NOW);

  const easyCandidate = queue.find((c) => c.phrase.phrase === "easy");
  const hardCandidate = queue.find((c) => c.phrase.phrase === "hard");
  assert(
    hardCandidate.priority > easyCandidate.priority,
    `poor-score hard (${hardCandidate.priority.toFixed(1)}) > perfect easy (${easyCandidate.priority.toFixed(1)})`,
  );
  assert(queue[0].phrase.phrase === "hard", "low-score phrase is first");
}

// ── Test 5: Pool of 1 phrase always returns something ────────────────────────
{
  console.log("\n5. Single-phrase pool never causes empty result");
  const phrases = [makePhrase("solo")];
  const states = new Map();
  const queue = computePhraseQueue(phrases, states, NOW);

  assert(queue.length === 1, "queue has exactly 1 entry");
  assert(queue[0].phrase.phrase === "solo", "the single phrase is returned");
}

// ── Test 6: In-progress phrase (not yet due) has 0-400 priority ───────────────
{
  console.log("\n6. Not-yet-due phrase: priority rises linearly toward due date");
  const phrases = [makePhrase("cat"), makePhrase("dog")];

  // cat was just reviewed; due in 6 days; 3 days have passed → halfway through interval
  const halfwayStates = new Map([
    [
      "cat",
      makeState("cat", {
        nextReviewDate: NOW + 3 * DAY_MS, // 3 days left
        interval: 6,
        averageScore: 80,
        repetitions: 2,
      }),
    ],
  ]);
  const queueHalf = computePhraseQueue(phrases, halfwayStates, NOW);
  const halfPriority = queueHalf.find((c) => c.phrase.phrase === "cat").priority;

  // cat due tomorrow → near-due, higher priority
  const nearDueStates = new Map([
    [
      "cat",
      makeState("cat", {
        nextReviewDate: NOW + 1 * DAY_MS, // 1 day left
        interval: 6,
        averageScore: 80,
        repetitions: 2,
      }),
    ],
  ]);
  const queueNear = computePhraseQueue(phrases, nearDueStates, NOW);
  const nearPriority = queueNear.find((c) => c.phrase.phrase === "cat").priority;

  assert(
    nearPriority > halfPriority,
    `near-due (${nearPriority.toFixed(1)}) > half-interval (${halfPriority.toFixed(1)})`,
  );
  assert(halfPriority > 0, `half-interval priority (${halfPriority.toFixed(1)}) > 0`);
  assert(halfPriority < 400 * 1.5, `half-interval priority (${halfPriority.toFixed(1)}) ≤ 600`);
}

// ── Test 7: Sorted descending by priority ─────────────────────────────────────
{
  console.log("\n7. Queue is sorted highest priority first");
  const phrases = [makePhrase("a"), makePhrase("b"), makePhrase("c")];
  const states = new Map([
    [
      "a",
      makeState("a", {
        nextReviewDate: NOW + 10 * DAY_MS, // far in future
        interval: 10,
        averageScore: 100,
        repetitions: 5,
      }),
    ],
    [
      "b",
      makeState("b", {
        nextReviewDate: NOW - 3 * DAY_MS, // overdue 3 days
        interval: 6,
        averageScore: 80,
        repetitions: 2,
      }),
    ],
    // c: never seen → priority 500
  ]);
  const queue = computePhraseQueue(phrases, states, NOW);

  assert(queue[0].phrase.phrase === "b", `first is overdue 'b', got '${queue[0].phrase.phrase}'`);
  assert(queue[1].phrase.phrase === "c", `second is unseen 'c', got '${queue[1].phrase.phrase}'`);
  assert(queue[2].phrase.phrase === "a", `last is future-due 'a', got '${queue[2].phrase.phrase}'`);
  for (let i = 0; i < queue.length - 1; i++) {
    assert(
      queue[i].priority >= queue[i + 1].priority,
      `queue[${i}].priority (${queue[i].priority.toFixed(1)}) ≥ queue[${i + 1}].priority (${queue[i + 1].priority.toFixed(1)})`,
    );
  }
}

// ── Test 8: Empty phrase list returns empty queue ────────────────────────────
{
  console.log("\n8. Empty phrase list → empty queue (no crash)");
  const queue = computePhraseQueue([], new Map(), NOW);
  assert(queue.length === 0, "empty queue for empty input");
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} checks: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
