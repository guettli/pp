#!/usr/bin/env tsx
// Extract phonemes from an audio file
// Usage: tsx scripts/word2phonemes.ts <audio-file>

import fs from 'fs';
import { readAudioFile } from './lib/audio.js';
import { loadPhonemeModel, extractPhonemes } from './lib/phoneme-model.js';

async function main() {
    if (process.argv.length < 3) {
        console.error('Usage: tsx scripts/word2phonemes.ts <audio-file>');
        process.exit(1);
    }

    const audioFile = process.argv[2];

    if (!fs.existsSync(audioFile)) {
        console.error(`Error: Audio file not found: ${audioFile}`);
        process.exit(1);
    }

    try {
        // Load model
        const { session, idToToken } = await loadPhonemeModel();

        // Read audio and extract phonemes
        const audioData = readAudioFile(audioFile);
        const recognizedIPA = await extractPhonemes(audioData, session, idToToken);

        // Output as JSON
        console.log(JSON.stringify({
            audio_file: audioFile,
            recognized_ipa: recognizedIPA
        }));
    } catch (error) {
        console.error('Error:', (error as Error).message);
        process.exit(1);
    }
}

main();
