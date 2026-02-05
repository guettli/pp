// tests/worker-phoneme.js
// Worker thread for parallel phoneme extraction

import { parentPort, workerData } from 'worker_threads';

// Import shared libraries from compiled TypeScript
import { readAudioFile } from '../dist-node/src/lib/audio.js';
import { extractPhonemes, loadPhonemeModel } from '../dist-node/src/lib/phoneme-model.js';
import { calculatePanPhonDistance } from './panphon-distance-node.js';

let session = null;
let idToToken = null;

async function initModel(modelPath, vocabPath) {
    const result = await loadPhonemeModel({
        modelPath,
        vocabPath,
        useCache: false,
        singleThreaded: true
    });
    session = result.session;
    idToToken = result.idToToken;
}

async function processTask(task) {
    const { audioPath, metadataPath, expectedIPA, phrase, lang, source, metadata } = task;

    // Get previous values from metadata for regression detection
    const previousSimilarity = metadata?.similarity;
    const previousRecognizedIpa = metadata?.recognized_ipa;

    try {
        const audio = readAudioFile(audioPath);
        const extractedPhonemes = await extractPhonemes(audio, session, idToToken);

        // Handle multiple IPAs separated by |
        const expectedIPAs = expectedIPA.split('|');
        let bestSimilarity = 0;
        let bestResult = null;

        // Try each expected IPA and use the best match
        for (const ipa of expectedIPAs) {
            const panphonResult = calculatePanPhonDistance(ipa, extractedPhonemes);
            if (panphonResult.similarity > bestSimilarity) {
                bestSimilarity = panphonResult.similarity;
                bestResult = panphonResult;
            }
        }

        return {
            phrase,
            lang,
            source,
            metadataPath,
            expected: expectedIPA,
            actual: extractedPhonemes,
            similarity: bestSimilarity,
            previousSimilarity,
            previousRecognizedIpa,
            status: 'ok'
        };
    } catch (error) {
        return {
            phrase,
            lang,
            source,
            metadataPath,
            status: 'error',
            error: error.message
        };
    }
}

async function main() {
    const { modelPath, vocabPath, tasks } = workerData;

    await initModel(modelPath, vocabPath);

    const results = [];
    for (const task of tasks) {
        const result = await processTask(task);
        results.push(result);
    }

    parentPort.postMessage(results);
}

main().catch(e => {
    parentPort.postMessage({ error: e.message });
});
