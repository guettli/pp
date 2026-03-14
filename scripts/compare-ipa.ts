#!/usr/bin/env tsx
// Compare two IPA strings and calculate similarity
// Usage: tsx scripts/compare-ipa.ts <expected-ipa> <recognized-ipa>

import { calculatePanPhonDistance } from "../tests/panphon-distance-node.js";

function printHelp() {
  console.log(`Usage: ./run tsx scripts/compare-ipa.ts <expected-ipa> <recognized-ipa> <lang>

Compare two IPA strings and output a similarity score using PanPhon feature distance.
Uses the same PanPhon scoring algorithm as the web UI.

Arguments:
  <expected-ipa>    The reference IPA string (from phrase data)
  <recognized-ipa>  The IPA string to compare against the reference
  <lang>            Language code (e.g. de-DE, en-GB, fr-FR)

Options:
  --help            Show this help message

Output:
  JSON with expected_ipa, recognized_ipa, similarity (0-1), distance, and phoneme_comparison.

Examples:
  ./run tsx scripts/compare-ipa.ts "ˈfaːɐ̯ʁaːt" "faːʁaːt" de-DE
  ./run tsx scripts/compare-ipa.ts "/dɛɐ̯ ˈhʊnt/" "deːɐ̯ hʊnt" de-DE
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.length < 3) {
    console.error("Usage: tsx scripts/compare-ipa.ts <expected-ipa> <recognized-ipa> <lang>");
    console.error('Example: tsx scripts/compare-ipa.ts "ˈfaːɐ̯ʁaːt" "faːʁaːt" de-DE');
    process.exit(1);
  }

  const expectedIPA = args[0];
  const recognizedIPA = args[1];
  const lang = args[2];

  try {
    const result = calculatePanPhonDistance(expectedIPA, recognizedIPA, lang);

    // Output as JSON
    console.log(
      JSON.stringify(
        {
          expected_ipa: expectedIPA,
          recognized_ipa: recognizedIPA,
          similarity: parseFloat(result.similarity.toFixed(2)),
          distance: parseFloat(result.distance.toFixed(4)),
          phoneme_comparison: result.phonemeComparison,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error("Error:", (error as Error).message);
    process.exit(1);
  }
}

main();
