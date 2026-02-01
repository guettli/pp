#!/usr/bin/env tsx
// Extract phonemes from audio and compare with expected IPA
// Usage: tsx scripts/extract-and-compare.ts <audio-file> <word> <lang>

import fs from 'fs';
import { readAudioFile } from './lib/audio.js';
import { loadPhonemeModel, extractPhonemes } from './lib/phoneme-model.js';
import { getExpectedIPA } from './lib/word-data.js';
import { calculatePanPhonDistance } from '../tests/panphon-distance-node.js';

async function main() {
    if (process.argv.length < 5) {
        console.error('Usage: tsx scripts/extract-and-compare.ts <audio-file> <word> <lang>');
        process.exit(1);
    }

    const audioFile = process.argv[2];
    const word = process.argv[3];
    const lang = process.argv[4];

    if (!fs.existsSync(audioFile)) {
        console.error(`Error: Audio file not found: ${audioFile}`);
        process.exit(1);
    }

    try {
        // Load model and extract phonemes
        const { session, idToToken } = await loadPhonemeModel();
        const audioData = readAudioFile(audioFile);
        const recognizedIPA = await extractPhonemes(audioData, session, idToToken);

        // Get expected IPA and calculate similarity
        const expectedIPA = getExpectedIPA(word, lang);
        const result = calculatePanPhonDistance(expectedIPA, recognizedIPA);

        // Output as JSON (matching old extract-phonemes.js format)
        console.log(JSON.stringify({
            recognized_ipa: recognizedIPA,
            similarity: result.similarity.toFixed(2)
        }));
    } catch (error) {
        console.error('Error:', (error as Error).message);
        process.exit(1);
    }
}

main();
