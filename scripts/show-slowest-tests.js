#!/usr/bin/env node
/**
 * Parse playwright-results.json and print the N slowest tests.
 * Usage: node scripts/show-slowest-tests.js [N]   (default N=10)
 */
import { readFileSync } from "fs";

const TOP_N = parseInt(process.argv[2] ?? "10", 10);
const resultsPath = new URL("../playwright-results.json", import.meta.url);

let data;
try {
  data = JSON.parse(readFileSync(resultsPath, "utf8"));
} catch {
  process.stderr.write("show-slowest-tests: playwright-results.json not found, skipping.\n");
  process.exit(0);
}

function collectSpecs(suite, prefix) {
  const results = [];
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const duration = Math.max(...test.results.map((r) => r.duration));
      results.push({ title: `${prefix}${spec.title}`, duration });
    }
  }
  for (const child of suite.suites ?? []) {
    const childPrefix = child.title ? `${prefix}${child.title} › ` : prefix;
    results.push(...collectSpecs(child, childPrefix));
  }
  return results;
}

const all = data.suites.flatMap((s) => collectSpecs(s, ""));
all.sort((a, b) => b.duration - a.duration);

const maxMs = String(all[0]?.duration ?? 0).length;
console.log(`\nSlowest ${TOP_N} tests:`);
for (const { duration, title } of all.slice(0, TOP_N)) {
  const ms = String(duration).padStart(maxMs);
  console.log(`  ${ms}ms  ${title}`);
}
console.log();
