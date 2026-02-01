import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as ort from 'onnxruntime-node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Polyfill atob for Node.js
if (typeof globalThis.atob === 'undefined') {
    globalThis.atob = (str) => Buffer.from(str, 'base64').toString('binary');
}

// Cached session and vocab
let cachedSession: ort.InferenceSession | null = null;
let cachedIdToToken: Record<number, string> | null = null;

/**
 * Load ONNX model and vocab (cached after first load)
 */
export async function loadPhonemeModel(): Promise<{
    session: ort.InferenceSession;
    idToToken: Record<number, string>;
}> {
    if (cachedSession && cachedIdToToken) {
        return { session: cachedSession, idToToken: cachedIdToToken };
    }

    const modelPath = path.resolve(__dirname, '../../onnx/zipa-small-ctc-onnx-2026-01-28/model.onnx');
    const vocabPath = path.resolve(__dirname, '../../onnx/zipa-small-ctc-onnx-2026-01-28/vocab.json');

    if (!fs.existsSync(modelPath) || !fs.existsSync(vocabPath)) {
        throw new Error(`ONNX model or vocab not found at: ${modelPath}`);
    }

    const vocab = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));
    const idToToken: Record<number, string> = {};
    for (const [token, id] of Object.entries(vocab)) {
        idToToken[id as number] = token;
    }

    const session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
    });

    cachedSession = session;
    cachedIdToToken = idToToken;

    return { session, idToToken };
}

/**
 * Extract phonemes from audio data
 */
export async function extractPhonemes(
    audioData: Float32Array,
    session: ort.InferenceSession,
    idToToken: Record<number, string>
): Promise<string> {
    // Import mel extraction from compiled TypeScript
    const distPath = path.resolve(__dirname, '../../dist-node');
    if (!fs.existsSync(distPath)) {
        throw new Error('dist-node not found. Run "pnpm build:node" first.');
    }

    const { extractLogMelJS } = await import(`${distPath}/src/speech/mel-js.js`);

    const melFeatures = extractLogMelJS(audioData, 16000);
    const numFrames = melFeatures.length / 80;

    const x = new ort.Tensor('float32', melFeatures, [1, numFrames, 80]);
    const x_lens = new ort.Tensor('int64', new BigInt64Array([BigInt(numFrames)]), [1]);

    const feeds = { x, x_lens };
    const results = await session.run(feeds);
    const logits = results.logits.data;
    const seqLen = results.logits.dims[1];
    const vocabSize = results.logits.dims[2];

    // Greedy decode
    const tokens: number[] = [];
    for (let t = 0; t < seqLen; t++) {
        let maxIdx = 0;
        let maxVal = logits[t * vocabSize];
        for (let v = 1; v < vocabSize; v++) {
            const val = logits[t * vocabSize + v];
            if (val > maxVal) {
                maxVal = val;
                maxIdx = v;
            }
        }
        tokens.push(maxIdx);
    }

    // Remove consecutive duplicates and special tokens
    const phonemes: string[] = [];
    let prev = -1;
    for (const tok of tokens) {
        if (tok !== prev && tok !== 0) {  // Skip <pad> (0) and duplicates
            const symbol = idToToken[tok];
            if (symbol && symbol !== '<blk>' && symbol !== '▁') {
                phonemes.push(symbol);
            }
        }
        prev = tok;
    }

    return phonemes.join('');
}
