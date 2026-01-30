// tests/worker-phoneme.js
// Worker thread for parallel phoneme extraction

import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import * as ort from 'onnxruntime-node';

// Polyfill atob for Node.js
if (typeof globalThis.atob === 'undefined') {
    globalThis.atob = (str) => Buffer.from(str, 'base64').toString('binary');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the pure JS mel extraction
import { extractLogMelJS } from '../src/speech/mel-js.js';

// Import PanPhon distance calculation for similarity
import { calculatePanPhonDistance } from '../src/comparison/panphon-distance.js';

let session = null;
let idToToken = null;

async function initModel(modelPath, vocabPath) {
    const vocab = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));
    idToToken = {};
    for (const [token, id] of Object.entries(vocab)) {
        idToToken[id] = token;
    }

    session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        intraOpNumThreads: 1,  // Single thread per worker
        interOpNumThreads: 1,
    });
}

function readAudioFile(filePath) {
    const result = execSync(
        `ffmpeg -i "${filePath}" -f s16le -acodec pcm_s16le -ar 16000 -ac 1 - 2>/dev/null`,
        { maxBuffer: 50 * 1024 * 1024 }
    );
    const samples = new Float32Array(result.length / 2);
    for (let i = 0; i < samples.length; i++) {
        samples[i] = result.readInt16LE(i * 2) / 32768.0;
    }
    return samples;
}

async function extractPhonemes(audioData) {
    const melBands = 80;
    const melFeatures = extractLogMelJS(audioData, melBands);
    const numFrames = melFeatures.length / melBands;

    const inputTensor = new ort.Tensor('float32', melFeatures, [1, numFrames, melBands]);
    const xLensTensor = new ort.Tensor('int64', new BigInt64Array([BigInt(numFrames)]), [1]);

    const results = await session.run({ x: inputTensor, x_lens: xLensTensor });
    let logits = results.logits || results.log_probs || results[Object.keys(results)[0]];

    const logitsData = logits.data;
    const [, seqLen, vocabSize] = logits.dims;

    const predictedIds = [];
    for (let t = 0; t < seqLen; t++) {
        let maxIdx = 0;
        let maxVal = logitsData[t * vocabSize];
        for (let v = 1; v < vocabSize; v++) {
            const val = logitsData[t * vocabSize + v];
            if (val > maxVal) {
                maxVal = val;
                maxIdx = v;
            }
        }
        predictedIds.push(maxIdx);
    }

    // CTC decode
    const phonemes = [];
    let prevId = -1;
    for (const id of predictedIds) {
        if (id === prevId) continue;
        prevId = id;
        const token = idToToken[id];
        if (!token || token === '<pad>' || token === '<s>' || token === '</s>' || token === '<unk>' || token === '<blk>' || token === '▁') {
            continue;
        }
        phonemes.push(token);
    }
    return phonemes.join(' ');
}

async function processTask(task) {
    const { audioPath, expectedIPA, word, lang, source, metadata } = task;

    try {
        const audio = readAudioFile(audioPath);
        const extractedPhonemes = await extractPhonemes(audio);

        const isMispro = metadata?.mispronunciation;

        if (isMispro) {
            const expected = metadata.expected_phonemes || '';
            const match = extractedPhonemes === expected;
            return {
                word,
                lang,
                source,
                spokenAs: metadata.spoken_as,
                expected,
                actual: extractedPhonemes,
                mispronunciation: true,
                match,
                status: match ? 'ok' : 'mispro_mismatch'
            };
        } else {
            const panphonResult = calculatePanPhonDistance(expectedIPA, extractedPhonemes);
            return {
                word,
                lang,
                source,
                expected: expectedIPA,
                actual: extractedPhonemes,
                similarity: panphonResult.similarity,
                status: 'ok'
            };
        }
    } catch (error) {
        return {
            word,
            lang,
            source,
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
