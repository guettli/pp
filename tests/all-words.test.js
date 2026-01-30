// tests/all-words.test.js
// Test phoneme extraction on all words using TTS-generated audio

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import * as ort from 'onnxruntime-node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the pure JS mel extraction
import { extractLogMelJS } from '../src/speech/mel-js.js';

// Model configuration
const MODEL_REPO = 'guettli/zipa-small-ctc-onnx-2026-01-28';
const MODEL_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main/model.onnx`;
const VOCAB_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main/vocab.json`;

// XDG Base Directory standard: use $XDG_CACHE_HOME or ~/.cache
const XDG_CACHE_HOME = process.env.XDG_CACHE_HOME || path.join(process.env.HOME, '.cache');
const CACHE_DIR = path.join(XDG_CACHE_HOME, 'phoneme-party');
const DATA_DIR = path.join(__dirname, 'data');

let session = null;
let vocab = null;
let idToToken = null;

// TTS voice configurations
const TTS_VOICES = {
    de: { voice: 'de-DE-ConradNeural', source: 'edge-tts-conrad' },
    en: { voice: 'en-US-GuyNeural', source: 'edge-tts-guy' }
};

async function downloadIfNeeded(url, filename) {
    const cachePath = path.join(CACHE_DIR, filename);
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    if (fs.existsSync(cachePath)) {
        return cachePath;
    }
    console.log(`Downloading ${filename}...`);
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download ${url}: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(cachePath, buffer);
    return cachePath;
}

async function loadModel() {
    const vocabPath = await downloadIfNeeded(VOCAB_URL, 'vocab.json');
    vocab = JSON.parse(fs.readFileSync(vocabPath, 'utf8'));
    idToToken = {};
    for (const [token, id] of Object.entries(vocab)) {
        idToToken[id] = token;
    }

    const modelPath = await downloadIfNeeded(MODEL_URL, 'model.onnx');
    session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
    });
    console.log('Model loaded.\n');
}

/**
 * Get the path for a word's audio directory
 */
function getWordDir(lang, word) {
    return path.join(DATA_DIR, lang, word);
}

/**
 * Get paths for audio and metadata files
 */
function getAudioPaths(lang, word, source) {
    const wordDir = getWordDir(lang, word);
    const baseName = `${word}-${source}`;
    return {
        dir: wordDir,
        audio: path.join(wordDir, `${baseName}.flac`),
        metadata: path.join(wordDir, `${baseName}.yaml`)
    };
}

/**
 * Convert object to YAML string (simple implementation)
 */
function toYaml(obj) {
    const lines = [];
    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'string') {
            // Quote strings that contain special characters
            if (value.includes(':') || value.includes('#') || value.includes('\n')) {
                lines.push(`${key}: "${value}"`);
            } else {
                lines.push(`${key}: ${value}`);
            }
        } else if (typeof value === 'number' || typeof value === 'boolean') {
            lines.push(`${key}: ${value}`);
        } else {
            lines.push(`${key}: ${JSON.stringify(value)}`);
        }
    }
    return lines.join('\n') + '\n';
}

/**
 * Parse simple YAML file
 */
function parseYaml(content) {
    const obj = {};
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex === -1) continue;
        const key = trimmed.slice(0, colonIndex).trim();
        let value = trimmed.slice(colonIndex + 1).trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        // Try to parse as number
        if (/^\d+$/.test(value)) {
            obj[key] = parseInt(value, 10);
        } else if (/^\d+\.\d+$/.test(value)) {
            obj[key] = parseFloat(value);
        } else if (value === 'true') {
            obj[key] = true;
        } else if (value === 'false') {
            obj[key] = false;
        } else {
            obj[key] = value;
        }
    }
    return obj;
}

/**
 * Generate TTS audio and save with metadata
 */
function generateTTSAudio(word, lang) {
    const { voice, source } = TTS_VOICES[lang];
    const paths = getAudioPaths(lang, word, source);

    // Check if already exists (support both .yaml and .json for backwards compat)
    const jsonPath = paths.metadata.replace('.yaml', '.json');
    if (fs.existsSync(paths.audio) && (fs.existsSync(paths.metadata) || fs.existsSync(jsonPath))) {
        return { ...paths, cached: true };
    }

    // Create directory
    if (!fs.existsSync(paths.dir)) {
        fs.mkdirSync(paths.dir, { recursive: true });
    }

    try {
        // Generate with edge-tts (outputs mp3)
        const mp3Path = paths.audio.replace('.flac', '.mp3');
        execSync(`edge-tts --voice "${voice}" --text "${word}" --write-media "${mp3Path}" 2>/dev/null`, {
            stdio: 'pipe'
        });

        // Convert to FLAC (better for git, lossless compression)
        execSync(`ffmpeg -y -i "${mp3Path}" -ar 16000 -ac 1 "${paths.audio}" 2>/dev/null`, {
            stdio: 'pipe'
        });
        fs.unlinkSync(mp3Path);

        // Write metadata as YAML
        const metadata = {
            word,
            lang,
            source: 'edge-tts',
            voice,
            created: new Date().toISOString().split('T')[0],
            format: 'flac',
            sampleRate: 16000,
            channels: 1,
            generator: 'tests/all-words.test.js'
        };
        fs.writeFileSync(paths.metadata, toYaml(metadata));

        return { ...paths, cached: false };
    } catch (error) {
        console.error(`Failed to generate TTS for "${word}": ${error.message}`);
        return null;
    }
}

/**
 * Find all audio files for a word
 */
function findAudioFiles(lang, word) {
    const wordDir = getWordDir(lang, word);
    if (!fs.existsSync(wordDir)) {
        return [];
    }

    const files = fs.readdirSync(wordDir);
    const audioFiles = [];

    for (const file of files) {
        if (file.endsWith('.flac') || file.endsWith('.wav')) {
            const baseName = file.replace(/\.(flac|wav)$/, '');
            const yamlPath = path.join(wordDir, `${baseName}.yaml`);
            const jsonPath = path.join(wordDir, `${baseName}.json`);
            const audioPath = path.join(wordDir, file);

            let metadata = null;
            if (fs.existsSync(yamlPath)) {
                metadata = parseYaml(fs.readFileSync(yamlPath, 'utf8'));
            } else if (fs.existsSync(jsonPath)) {
                metadata = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            }

            audioFiles.push({
                path: audioPath,
                metadata,
                source: baseName.replace(`${word}-`, '')
            });
        }
    }

    return audioFiles;
}

function readAudioFile(filePath) {
    // Convert to raw 16kHz mono PCM using ffmpeg
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

async function testWord(word, expectedIPA, lang) {
    // Ensure TTS audio exists
    const ttsResult = generateTTSAudio(word, lang);
    if (!ttsResult) {
        return [{ word, lang, status: 'tts_failed', expected: expectedIPA }];
    }

    // Find all audio files for this word
    const audioFiles = findAudioFiles(lang, word);
    const results = [];

    for (const audioFile of audioFiles) {
        const audio = readAudioFile(audioFile.path);
        const extractedPhonemes = await extractPhonemes(audio);

        results.push({
            word,
            lang,
            source: audioFile.source,
            expected: expectedIPA,
            actual: extractedPhonemes,
            cached: ttsResult.cached,
            status: 'ok'
        });
    }

    return results;
}

async function main() {
    console.log('=== Phoneme Extraction Test for All Words ===\n');

    await loadModel();

    // Load word lists
    const wordsDE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'words-de.json'), 'utf8'));
    const wordsEN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'words-en.json'), 'utf8'));

    const allResults = [];

    console.log('Testing German words...\n');
    console.log('Word'.padEnd(20) + 'Source'.padEnd(20) + 'Expected IPA'.padEnd(20) + 'Extracted');
    console.log('-'.repeat(80));

    for (const { word, ipa } of wordsDE) {
        const results = await testWord(word, ipa, 'de');
        allResults.push(...results);
        for (const result of results) {
            if (result.status === 'ok') {
                const cached = result.cached ? ' (cached)' : '';
                console.log(
                    result.word.padEnd(20) +
                    (result.source + cached).padEnd(20) +
                    result.expected.padEnd(20) +
                    result.actual
                );
            } else {
                console.log(`${word.padEnd(20)} FAILED`);
            }
        }
    }

    console.log('\nTesting English words...\n');
    console.log('Word'.padEnd(20) + 'Source'.padEnd(20) + 'Expected IPA'.padEnd(20) + 'Extracted');
    console.log('-'.repeat(80));

    for (const { word, ipa } of wordsEN) {
        const results = await testWord(word, ipa, 'en');
        allResults.push(...results);
        for (const result of results) {
            if (result.status === 'ok') {
                const cached = result.cached ? ' (cached)' : '';
                console.log(
                    result.word.padEnd(20) +
                    (result.source + cached).padEnd(20) +
                    result.expected.padEnd(20) +
                    result.actual
                );
            } else {
                console.log(`${word.padEnd(20)} FAILED`);
            }
        }
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));

    const successful = allResults.filter(r => r.status === 'ok');
    const failed = allResults.filter(r => r.status !== 'ok');

    console.log(`Total audio files tested: ${allResults.length}`);
    console.log(`Successful extractions: ${successful.length}`);
    console.log(`Failed: ${failed.length}`);

    // Count unique words
    const uniqueWords = new Set(allResults.map(r => `${r.lang}:${r.word}`));
    console.log(`Unique words: ${uniqueWords.size}`);

    console.log(`\nAudio files stored in: ${DATA_DIR}`);
    console.log('\nTest completed!');
}

main().catch(e => {
    console.error('Test failed:', e);
    process.exit(1);
});
