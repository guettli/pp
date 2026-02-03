#!/usr/bin/env tsx
// Extract phonemes from audio and compare with expected IPA
// Usage: tsx scripts/extract-and-compare.ts <audio-file> <word> <lang>

import fs from 'fs';
import { readAudioFile } from '../src/lib/audio.js';
import { loadPhonemeModel, extractPhonemes } from '../src/lib/phoneme-model.js';
import { getExpectedIPA } from '../src/lib/word-data.js';
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
        const { session, idToToken } = await loadPhonemeModel();
        const audioData = readAudioFile(audioFile);
        const recognizedIPA = await extractPhonemes(audioData, session, idToToken, { returnDetails: false }) as string;

        // Try to get expected IPA, but don't fail if word is new
        let expectedIPA: string | null = null;
        let similarity: string | null = null;

        try {
            expectedIPA = getExpectedIPA(word, lang);
            const result = calculatePanPhonDistance(expectedIPA, recognizedIPA);
            similarity = result.similarity.toFixed(2);
        } catch (error) {
            // Word not found in word data - this is OK for new words
            console.error('Note: Word not found in word data (this is OK for new words):', (error as Error).message);
        }

        // Output as JSON
        const output: { recognized_ipa: string; expected_ipa?: string; similarity?: string } = {
            recognized_ipa: recognizedIPA
        };

        if (expectedIPA) {
            output.expected_ipa = expectedIPA;
        }

        if (similarity) {
            output.similarity = similarity;
        }

        console.log(JSON.stringify(output));
    } catch (error) {
        console.error('Error:', (error as Error).message);
        process.exit(1);
    }
}

main();
