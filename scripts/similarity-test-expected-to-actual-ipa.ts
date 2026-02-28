#!/usr/bin/env tsx
/**
 * Test phoneme similarity between expected and actual pronunciations
 * This script is useful for checking similarity scores without running the full model
 *
 * Usage: ./run tsx scripts/similarity-test-expected-to-actual-ipa.ts <expected_ipa> <actual_phonemes> [lang]
 */

import { calculatePanPhonDistance } from "../tests/panphon-distance-node.js";

function printUsage() {
  console.log(`Usage: ./run tsx scripts/similarity-test-expected-to-actual-ipa.ts <expected_ipa> <actual_phonemes> [lang]

Examples:
  ./run tsx scripts/similarity-test-expected-to-actual-ipa.ts "moːnt" "m u n d"               # Compare expected vs actual (default: German)
  ./run tsx scripts/similarity-test-expected-to-actual-ipa.ts "moːnt" "m u n d a"            # Test with extra phoneme
  ./run tsx scripts/similarity-test-expected-to-actual-ipa.ts "moːnt" "m u n d" "de-DE"      # Explicit language

The script calculates phonetic similarity using PanPhon features.
Similarity ranges from 0% (completely different) to 100% (identical).
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(args.includes("--help") || args.includes("-h") ? 0 : 1);
  }

  const expected = args[0];
  const actual = args[1];
  const lang = args[2] || "de-DE"; // Default to German

  console.log("=".repeat(70));
  console.log("Phoneme Similarity Test");
  console.log("=".repeat(70));
  console.log(`Expected: ${expected}`);
  console.log(`Actual:   ${actual}`);
  console.log(`Language: ${lang}`);
  console.log();

  const result = calculatePanPhonDistance(expected, actual, lang);

  console.log("Results:");
  console.log(`  Similarity:      ${Math.round(result.similarity * 100)}%`);
  console.log(`  Distance:        ${result.distance.toFixed(2)}`);
  console.log(`  Max Length:      ${result.maxLength}`);
  console.log();

  console.log("Phonemes:");
  console.log(
    `  Target:  [${result.targetPhonemes.join(", ")}] (${result.targetPhonemes.length} phonemes)`,
  );
  console.log(
    `  Actual:  [${result.actualPhonemes.join(", ")}] (${result.actualPhonemes.length} phonemes)`,
  );
  console.log();

  if (result.phonemeComparison && result.phonemeComparison.length > 0) {
    console.log("Alignment:");
    console.log("  Target  →  Actual    Distance  Match");
    console.log("  " + "-".repeat(42));
    for (const item of result.phonemeComparison) {
      const target = (item.target || "-").padEnd(8);
      const actual = (item.actual || "-").padEnd(8);
      const dist = item.distance.toFixed(2).padStart(8);
      const match = item.match ? "✓" : "✗";
      console.log(`  ${target}  ${actual}  ${dist}  ${match}`);
    }
  }
}

main();
