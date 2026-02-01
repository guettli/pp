#!/usr/bin/env bash
# Test phoneme similarity between expected and actual pronunciations
# This script is useful for checking similarity scores without running the full model

set -e

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Check if tmp/similarity-test.js exists, if not create it
SIMILARITY_TEST="$PROJECT_ROOT/tmp/similarity-test.js"

if [ ! -f "$SIMILARITY_TEST" ]; then
    echo "Creating $SIMILARITY_TEST..."
    cat >"$SIMILARITY_TEST" <<'EOF'
// tmp/similarity-test.js
// Test phoneme similarity calculation without running the model

import { calculatePanPhonDistance } from '../tests/panphon-distance-node.js';

function printUsage() {
    console.log(`Usage: npm run similarity <expected_ipa> <actual_phonemes>

Examples:
  npm run similarity "moːnt" "m u n d"       # Compare expected vs actual
  npm run similarity "moːnt" "m u n d a"     # Test with extra phoneme
  npm run similarity "/bʁoːt/" "b l o ː t"   # Mispronunciation test

The script calculates phonetic similarity using PanPhon features.
Similarity ranges from 0% (completely different) to 100% (identical).
`);
}

function main() {
    const args = process.argv.slice(2);

    if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
    }

    const expected = args[0];
    const actual = args[1];

    console.log('='.repeat(70));
    console.log('Phoneme Similarity Test');
    console.log('='.repeat(70));
    console.log(`Expected: ${expected}`);
    console.log(`Actual:   ${actual}`);
    console.log();

    const result = calculatePanPhonDistance(expected, actual);

    console.log('Results:');
    console.log(`  Similarity:      ${Math.round(result.similarity * 100)}%`);
    console.log(`  Distance:        ${result.distance.toFixed(2)}`);
    console.log(`  Max Length:      ${result.maxLength}`);
    console.log();

    console.log('Phonemes:');
    console.log(`  Target:  [${result.targetPhonemes.join(', ')}] (${result.targetPhonemes.length} phonemes)`);
    console.log(`  Actual:  [${result.actualPhonemes.join(', ')}] (${result.actualPhonemes.length} phonemes)`);
    console.log();

    if (result.phonemeComparison && result.phonemeComparison.length > 0) {
        console.log('Alignment:');
        console.log('  Target  →  Actual    Distance  Match');
        console.log('  ' + '-'.repeat(42));
        for (const item of result.phonemeComparison) {
            const target = (item.target || '-').padEnd(8);
            const actual = (item.actual || '-').padEnd(8);
            const dist = item.distance.toFixed(2).padStart(8);
            const match = item.match ? '✓' : '✗';
            console.log(`  ${target}  ${actual}  ${dist}  ${match}`);
        }
    }
}

main();
EOF
fi

# Build TypeScript to dist-node if not already built or if source changed
if [ ! -d "$PROJECT_ROOT/dist-node" ] || [ "$PROJECT_ROOT/src" -nt "$PROJECT_ROOT/dist-node" ]; then
    echo "Building TypeScript..."
    cd "$PROJECT_ROOT"
    npm run build:node >/dev/null 2>&1 || tsc -p tsconfig.build.json
fi

# Run the similarity test
cd "$PROJECT_ROOT"
exec node "$SIMILARITY_TEST" "$@"
