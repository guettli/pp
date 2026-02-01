/**
 * Unit tests for similarity calculation
 *
 * Run with: node tests/similarity.test.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDistanceCalculator } from '../dist-node/src/comparison/panphon-distance-core.js';
import { calculateIPADistance } from '../dist-node/src/comparison/distance.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load PanPhon data
const panphonDataPath = path.join(__dirname, '../src/data/panphon_features.json');
const panphonData = JSON.parse(fs.readFileSync(panphonDataPath, 'utf8'));

// Decode base64 binary features into a lookup table
function decodePanphonFeatures() {
    const { phonemes, features: featuresBase64, featureCount } = panphonData;
    const binaryString = Buffer.from(featuresBase64, 'base64').toString('binary');
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const features = new Int8Array(bytes.buffer);
    const featureTable = {};

    for (let i = 0; i < phonemes.length; i++) {
        const phoneme = phonemes[i];
        const startIdx = i * featureCount;
        const endIdx = startIdx + featureCount;
        featureTable[phoneme] = Array.from(features.slice(startIdx, endIdx));
    }

    return featureTable;
}

const panphonFeatures = decodePanphonFeatures();
const calculator = createDistanceCalculator(panphonFeatures);

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (condition) {
        testsPassed++;
        console.log(`  ✓ ${message}`);
    } else {
        testsFailed++;
        console.log(`  ✗ ${message}`);
    }
}

function assertGreater(a, b, message) {
    if (a > b) {
        testsPassed++;
        console.log(`  ✓ ${message} (${(a * 100).toFixed(1)}% > ${(b * 100).toFixed(1)}%)`);
    } else {
        testsFailed++;
        console.log(`  ✗ ${message} (${(a * 100).toFixed(1)}% NOT > ${(b * 100).toFixed(1)}%)`);
    }
}

function describe(name, fn) {
    console.log(`\n${name}`);
    fn();
}

// Tests
describe('PanPhon similarity - German "Mond" mispronunciations', () => {
    // Mond = /moːnt/ (German for "moon")
    const mondIPA = 'moːnt';

    // Possible mispronunciations:
    // - "mund" would be /mʊnt/ (just vowel change o→ʊ)
    // - "muda" would be /muːda/ (vowel change + consonant changes)
    const mundIPA = 'mʊnt';    // Only vowel differs (oː → ʊ)
    const mudaIPA = 'muːda';   // Vowel differs AND final consonants differ

    const simMund = calculator.calculatePanPhonDistance(mondIPA, mundIPA);
    const simMuda = calculator.calculatePanPhonDistance(mondIPA, mudaIPA);

    console.log(`\n  Target: "${mondIPA}" (Mond)`);
    console.log(`  Compare with "${mundIPA}" (mund): ${(simMund.similarity * 100).toFixed(1)}%`);
    console.log(`  Compare with "${mudaIPA}" (muda): ${(simMuda.similarity * 100).toFixed(1)}%`);
    console.log();

    assertGreater(
        simMund.similarity,
        simMuda.similarity,
        '"mund" should be MORE similar to "Mond" than "muda"'
    );
});

describe('Basic Levenshtein similarity - German "Mond" mispronunciations', () => {
    const mondIPA = 'moːnt';
    const mundIPA = 'mʊnt';
    const mudaIPA = 'muːda';

    const simMund = calculateIPADistance(mondIPA, mundIPA);
    const simMuda = calculateIPADistance(mondIPA, mudaIPA);

    console.log(`\n  Target: "${mondIPA}" (Mond)`);
    console.log(`  Compare with "${mundIPA}" (mund): ${(simMund.similarity * 100).toFixed(1)}%`);
    console.log(`  Compare with "${mudaIPA}" (muda): ${(simMuda.similarity * 100).toFixed(1)}%`);
    console.log();

    assertGreater(
        simMund.similarity,
        simMuda.similarity,
        '"mund" should be MORE similar to "Mond" than "muda"'
    );
});

describe('Phoneme alignment details', () => {
    const mondIPA = 'moːnt';
    const mundIPA = 'mʊnt';
    const mudaIPA = 'muːda';

    console.log('\n  Mond vs mund alignment:');
    const resultMund = calculator.calculatePanPhonDistance(mondIPA, mundIPA);
    console.log(`    Target phonemes: [${resultMund.targetPhonemes.join(', ')}]`);
    console.log(`    Actual phonemes: [${resultMund.actualPhonemes.join(', ')}]`);
    for (const comp of resultMund.phonemeComparison) {
        const matchStr = comp.match ? '✓' : '✗';
        console.log(`    ${comp.target || '∅'} ↔ ${comp.actual || '∅'}: distance=${comp.distance.toFixed(2)} ${matchStr}`);
    }

    console.log('\n  Mond vs muda alignment:');
    const resultMuda = calculator.calculatePanPhonDistance(mondIPA, mudaIPA);
    console.log(`    Target phonemes: [${resultMuda.targetPhonemes.join(', ')}]`);
    console.log(`    Actual phonemes: [${resultMuda.actualPhonemes.join(', ')}]`);
    for (const comp of resultMuda.phonemeComparison) {
        const matchStr = comp.match ? '✓' : '✗';
        console.log(`    ${comp.target || '∅'} ↔ ${comp.actual || '∅'}: distance=${comp.distance.toFixed(2)} ${matchStr}`);
    }

    assert(true, 'Alignment details printed above');
});

describe('Identical strings should have 100% similarity', () => {
    const result = calculator.calculatePanPhonDistance('moːnt', 'moːnt');
    assert(result.similarity === 1.0, `Identical strings: ${(result.similarity * 100).toFixed(1)}% === 100%`);
});

describe('Single phoneme change should have high similarity', () => {
    // Only one phoneme differs: oː → uː
    const result = calculator.calculatePanPhonDistance('moːnt', 'muːnt');
    assert(
        result.similarity >= 0.7,
        `Single phoneme change (oː→uː): ${(result.similarity * 100).toFixed(1)}% >= 70%`
    );
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`SUMMARY: ${testsPassed} passed, ${testsFailed} failed`);
console.log('='.repeat(50));

if (testsFailed > 0) {
    process.exit(1);
}
