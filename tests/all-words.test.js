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
        metadata: path.join(wordDir, `${baseName}.flac.yaml`)
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

    // Check if already exists
    if (fs.existsSync(paths.audio) && fs.existsSync(paths.metadata)) {
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
            voice
        };
        fs.writeFileSync(paths.metadata, toYaml(metadata));

        return { ...paths, cached: false };
    } catch (error) {
        console.error(`Failed to generate TTS for "${word}": ${error.message}`);
        return null;
    }
}

/**
 * Generate mispronunciation TTS audio
 * @param {string} word - The correct word (for directory)
 * @param {string} spokenAs - What to actually speak (mispronunciation)
 * @param {string} lang - Language code
 * @param {string} expectedPhonemes - Expected phoneme sequence (e.g., "b l o ː t")
 */
function generateMispronunciationAudio(word, spokenAs, lang, expectedPhonemes) {
    const { voice } = TTS_VOICES[lang];
    const wordDir = getWordDir(lang, word);
    const baseName = `${word}-mispro-${spokenAs.toLowerCase()}`;
    const audioPath = path.join(wordDir, `${baseName}.flac`);
    const metadataPath = path.join(wordDir, `${baseName}.flac.yaml`);

    // Check if already exists
    if (fs.existsSync(audioPath) && fs.existsSync(metadataPath)) {
        return { audio: audioPath, metadata: metadataPath, cached: true };
    }

    // Create directory
    if (!fs.existsSync(wordDir)) {
        fs.mkdirSync(wordDir, { recursive: true });
    }

    try {
        // Generate with edge-tts (outputs mp3)
        const mp3Path = audioPath.replace('.flac', '.mp3');
        execSync(`edge-tts --voice "${voice}" --text "${spokenAs}" --write-media "${mp3Path}" 2>/dev/null`, {
            stdio: 'pipe'
        });

        // Convert to FLAC
        execSync(`ffmpeg -y -i "${mp3Path}" -ar 16000 -ac 1 "${audioPath}" 2>/dev/null`, {
            stdio: 'pipe'
        });
        fs.unlinkSync(mp3Path);

        // Write metadata as YAML
        const metadata = {
            word,
            spoken_as: spokenAs,
            lang,
            mispronunciation: true,
            expected_phonemes: expectedPhonemes,
            source: 'edge-tts',
            voice
        };
        fs.writeFileSync(metadataPath, toYaml(metadata));

        return { audio: audioPath, metadata: metadataPath, cached: false };
    } catch (error) {
        console.error(`Failed to generate mispronunciation TTS for "${spokenAs}": ${error.message}`);
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
            const yamlPath = path.join(wordDir, `${file}.yaml`);
            const audioPath = path.join(wordDir, file);

            let metadata = null;
            if (fs.existsSync(yamlPath)) {
                metadata = parseYaml(fs.readFileSync(yamlPath, 'utf8'));
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
        const meta = audioFile.metadata || {};

        // Check if this is a mispronunciation test
        if (meta.mispronunciation) {
            const expected = meta.expected_phonemes || '';
            const match = extractedPhonemes === expected;

            results.push({
                word,
                lang,
                source: audioFile.source,
                spokenAs: meta.spoken_as,
                expected: expected,
                actual: extractedPhonemes,
                mispronunciation: true,
                match,
                status: match ? 'ok' : 'mispro_mismatch'
            });
        } else {
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
    }

    return results;
}

function printResults(results, lang) {
    // Separate normal and mispronunciation results
    const normalResults = results.filter(r => !r.mispronunciation);
    const misproResults = results.filter(r => r.mispronunciation);

    if (normalResults.length > 0) {
        console.log(`\n${lang === 'de' ? 'German' : 'English'} words:\n`);
        console.log('Word'.padEnd(20) + 'Source'.padEnd(20) + 'Expected IPA'.padEnd(20) + 'Extracted');
        console.log('-'.repeat(80));

        for (const result of normalResults) {
            if (result.status === 'ok') {
                const cached = result.cached ? ' (cached)' : '';
                console.log(
                    result.word.padEnd(20) +
                    (result.source + cached).padEnd(20) +
                    result.expected.padEnd(20) +
                    result.actual
                );
            } else {
                console.log(`${result.word.padEnd(20)} FAILED`);
            }
        }
    }

    if (misproResults.length > 0) {
        console.log(`\n${lang === 'de' ? 'German' : 'English'} mispronunciation tests:\n`);
        console.log('Word'.padEnd(15) + 'Spoken As'.padEnd(12) + 'Expected'.padEnd(20) + 'Actual'.padEnd(20) + 'Match');
        console.log('-'.repeat(80));

        for (const result of misproResults) {
            const matchStr = result.match ? '✓' : '✗';
            console.log(
                result.word.padEnd(15) +
                result.spokenAs.padEnd(12) +
                result.expected.padEnd(20) +
                result.actual.padEnd(20) +
                matchStr
            );
        }
    }
}

// Mispronunciation test definitions
const MISPRONUNCIATION_TESTS = [
    { word: 'Brot', spokenAs: 'Blot', lang: 'de', expectedPhonemes: 'b l o ː t' },
    { word: 'Katze', spokenAs: 'Tatze', lang: 'de', expectedPhonemes: 't ɑ t s e' },
];

/**
 * Simple glob matching (supports * wildcard)
 */
function matchesPattern(text, pattern) {
    if (!pattern || pattern === '*') return true;
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$', 'i');
    return regex.test(text);
}

/**
 * Get all available tests
 */
function getAllTests(wordsDE, wordsEN) {
    const tests = [];

    // Add word tests
    for (const { word, ipa } of wordsDE) {
        tests.push({ word, ipa, lang: 'de', type: 'word' });
    }
    for (const { word, ipa } of wordsEN) {
        tests.push({ word, ipa, lang: 'en', type: 'word' });
    }

    // Add mispronunciation tests
    for (const test of MISPRONUNCIATION_TESTS) {
        tests.push({ ...test, type: 'mispronunciation' });
    }

    return tests;
}

/**
 * Print usage help
 */
function printHelp() {
    console.log(`Usage: node tests/all-words.test.js [options] [pattern]

Options:
  --list, -l     List all available tests without running them
  --help, -h     Show this help message

Pattern:
  Filter tests by word name (case-insensitive, supports * wildcard)

Examples:
  node tests/all-words.test.js              # Run all tests
  node tests/all-words.test.js --list       # List all tests
  node tests/all-words.test.js Brot         # Run tests for "Brot" only
  node tests/all-words.test.js "Sch*"       # Run tests matching "Sch*"
  node tests/all-words.test.js "*mispro*"   # Run mispronunciation tests
`);
}

async function main() {
    const args = process.argv.slice(2);

    // Parse arguments
    const showList = args.includes('--list') || args.includes('-l');
    const showHelp = args.includes('--help') || args.includes('-h');
    const pattern = args.find(a => !a.startsWith('-')) || '*';

    if (showHelp) {
        printHelp();
        return;
    }

    // Load word lists
    const wordsDE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'words-de.json'), 'utf8'));
    const wordsEN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'words-en.json'), 'utf8'));

    const allTests = getAllTests(wordsDE, wordsEN);

    // Filter tests by pattern
    const filteredTests = allTests.filter(t => {
        const testName = t.type === 'mispronunciation'
            ? `${t.word}-mispro-${t.spokenAs}`
            : t.word;
        return matchesPattern(testName, pattern);
    });

    if (showList) {
        console.log('Available tests:\n');
        console.log('Lang  Type            Word');
        console.log('-'.repeat(50));
        for (const t of filteredTests) {
            const type = t.type === 'mispronunciation' ? `mispro(${t.spokenAs})` : 'word';
            console.log(`${t.lang.padEnd(6)}${type.padEnd(16)}${t.word}`);
        }
        console.log(`\nTotal: ${filteredTests.length} tests`);
        return;
    }

    console.log('=== Phoneme Extraction Test ===\n');

    if (pattern !== '*') {
        console.log(`Filter: ${pattern}`);
        console.log(`Matching tests: ${filteredTests.length}\n`);
    }

    await loadModel();

    // Generate mispronunciation audio for filtered tests
    for (const test of filteredTests.filter(t => t.type === 'mispronunciation')) {
        generateMispronunciationAudio(test.word, test.spokenAs, test.lang, test.expectedPhonemes);
    }

    // Get filtered word tests by language
    const filteredDE = filteredTests.filter(t => t.lang === 'de' && t.type === 'word');
    const filteredEN = filteredTests.filter(t => t.lang === 'en' && t.type === 'word');

    console.log('Running tests in parallel...');

    // Run filtered tests in parallel
    const [resultsDE, resultsEN] = await Promise.all([
        Promise.all(filteredDE.map(({ word, ipa }) => testWord(word, ipa, 'de'))),
        Promise.all(filteredEN.map(({ word, ipa }) => testWord(word, ipa, 'en')))
    ]);

    // Flatten results
    const allResultsDE = resultsDE.flat();
    const allResultsEN = resultsEN.flat();
    const allResults = [...allResultsDE, ...allResultsEN];

    // Print results
    if (allResultsDE.length > 0) printResults(allResultsDE, 'de');
    if (allResultsEN.length > 0) printResults(allResultsEN, 'en');

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));

    const successful = allResults.filter(r => r.status === 'ok');
    const failed = allResults.filter(r => r.status !== 'ok');

    console.log(`Total audio files tested: ${allResults.length}`);
    console.log(`Successful: ${successful.length}`);
    console.log(`Failed: ${failed.length}`);

    if (failed.length > 0) {
        process.exit(1);
    }
}

main().catch(e => {
    console.error('Test failed:', e);
    process.exit(1);
});
