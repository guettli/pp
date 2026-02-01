#!/usr/bin/env tsx
// Compare two IPA strings and calculate similarity
// Usage: tsx scripts/compare-ipa.ts <expected-ipa> <recognized-ipa>

import { calculatePanPhonDistance } from '../tests/panphon-distance-node.js';

async function main() {
    if (process.argv.length < 4) {
        console.error('Usage: tsx scripts/compare-ipa.ts <expected-ipa> <recognized-ipa>');
        console.error('Example: tsx scripts/compare-ipa.ts "ˈfaːɐ̯ʁaːt" "faːʁaːt"');
        process.exit(1);
    }

    const expectedIPA = process.argv[2];
    const recognizedIPA = process.argv[3];

    try {
        const result = calculatePanPhonDistance(expectedIPA, recognizedIPA);

        // Output as JSON
        console.log(JSON.stringify({
            expected_ipa: expectedIPA,
            recognized_ipa: recognizedIPA,
            similarity: parseFloat(result.similarity.toFixed(2)),
            distance: parseFloat(result.distance.toFixed(4)),
            phoneme_comparison: result.phonemeComparison
        }, null, 2));
    } catch (error) {
        console.error('Error:', (error as Error).message);
        process.exit(1);
    }
}

main();
