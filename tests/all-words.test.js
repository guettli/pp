// tests/all-words.test.js
// Test phoneme extraction on all words using TTS-generated audio

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Model configuration
const MODEL_REPO = 'guettli/zipa-small-ctc-onnx-2026-01-28';
const MODEL_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main/model.onnx`;
const VOCAB_URL = `https://huggingface.co/${MODEL_REPO}/resolve/main/vocab.json`;

// XDG Base Directory standard: use $XDG_CACHE_HOME or ~/.cache
const XDG_CACHE_HOME = process.env.XDG_CACHE_HOME || path.join(process.env.HOME, '.cache');
const CACHE_DIR = path.join(XDG_CACHE_HOME, 'phoneme-party');
const DATA_DIR = path.join(__dirname, 'data');

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

async function downloadModelFiles() {
    const modelPath = await downloadIfNeeded(MODEL_URL, 'model.onnx');
    const vocabPath = await downloadIfNeeded(VOCAB_URL, 'vocab.json');
    return { modelPath, vocabPath };
}

/**
 * Run tasks in parallel using worker threads
 */
function runWorkers(tasks, modelPath, vocabPath, numWorkers) {
    return new Promise((resolve, reject) => {
        const results = [];
        let completedWorkers = 0;

        // Split tasks across workers
        const tasksPerWorker = Math.ceil(tasks.length / numWorkers);
        const workerTasks = [];
        for (let i = 0; i < numWorkers; i++) {
            const start = i * tasksPerWorker;
            const end = Math.min(start + tasksPerWorker, tasks.length);
            if (start < tasks.length) {
                workerTasks.push(tasks.slice(start, end));
            }
        }

        const actualWorkers = workerTasks.length;
        if (actualWorkers === 0) {
            resolve([]);
            return;
        }

        for (let i = 0; i < actualWorkers; i++) {
            const worker = new Worker(path.join(__dirname, 'worker-phoneme.js'), {
                workerData: {
                    modelPath,
                    vocabPath,
                    tasks: workerTasks[i]
                },
            });

            worker.on('message', (workerResults) => {
                if (workerResults.error) {
                    reject(new Error(workerResults.error));
                    return;
                }
                results.push(...workerResults);
                completedWorkers++;
                if (completedWorkers === actualWorkers) {
                    resolve(results);
                }
            });

            worker.on('error', reject);
        }
    });
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
                metadataPath: yamlPath,
                metadata,
                source: baseName.replace(`${word}-`, '')
            });
        }
    }

    return audioFiles;
}

function printResults(results) {
    // Sort by similarity descending (best first, worst last)
    const sortedResults = [...results].sort((a, b) => {
        // Handle failed tests (no similarity)
        if (a.status !== 'ok') return 1;
        if (b.status !== 'ok') return -1;
        return b.similarity - a.similarity;
    });

    console.log('\nAll words:\n');
    console.log('Lang'.padEnd(6) + 'Word'.padEnd(15) + 'Source'.padEnd(20) + 'Sim'.padEnd(6) + 'Expected IPA'.padEnd(20) + 'Old IPA'.padEnd(25) + 'New IPA');
    console.log('-'.repeat(135));

    for (const result of sortedResults) {
        if (result.status === 'ok') {
            const simPercent = Math.round(result.similarity * 100) + '%';
            const oldIpa = result.previousRecognizedIpa || '-';
            const newIpa = result.actual;
            const ipaChanged = oldIpa !== '-' && oldIpa !== newIpa;
            const displayNewIpa = ipaChanged ? newIpa : '';
            console.log(
                result.lang.padEnd(6) +
                result.word.padEnd(15) +
                result.source.padEnd(20) +
                simPercent.padEnd(6) +
                result.expected.padEnd(20) +
                oldIpa.padEnd(25) +
                displayNewIpa
            );
        } else {
            console.log(`${result.lang.padEnd(6)}${result.word.padEnd(15)} ${result.source.padEnd(20)} FAILED`);
        }
    }
}

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

    return tests;
}

/**
 * Print usage help
 */
function printHelp() {
    console.log(`Usage: node tests/all-words.test.js [options] [pattern]

Options:
  --list, -l     List all available tests without running them
  --update, -u   Update YAML files with new recognized IPA values
  --help, -h     Show this help message

Pattern:
  Filter tests by word name (case-insensitive, supports * wildcard)

Examples:
  node tests/all-words.test.js              # Run all tests
  node tests/all-words.test.js --list       # List all tests
  node tests/all-words.test.js --update     # Update all YAML files
  node tests/all-words.test.js Brot         # Run tests for "Brot" only
  node tests/all-words.test.js "Sch*"       # Run tests matching "Sch*"
`);
}

async function main() {
    const args = process.argv.slice(2);

    // Parse arguments
    const showList = args.includes('--list') || args.includes('-l');
    const showHelp = args.includes('--help') || args.includes('-h');
    const updateYaml = args.includes('--update') || args.includes('-u');
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
    const filteredTests = allTests.filter(t => matchesPattern(t.word, pattern));

    if (showList) {
        console.log('Available tests:\n');
        console.log('Lang  Word');
        console.log('-'.repeat(50));
        for (const t of filteredTests) {
            console.log(`${t.lang.padEnd(6)}${t.word}`);
        }
        console.log(`\nTotal: ${filteredTests.length} tests`);
        return;
    }

    console.log('=== Phoneme Extraction Test ===\n');

    if (pattern !== '*') {
        console.log(`Filter: ${pattern}`);
        console.log(`Matching tests: ${filteredTests.length}\n`);
    }

    // Download model files
    const { modelPath, vocabPath } = await downloadModelFiles();

    // Generate TTS audio for word tests
    for (const test of filteredTests) {
        generateTTSAudio(test.word, test.lang);
    }

    // Build list of all tasks (audio files to process)
    const tasks = [];
    for (const test of filteredTests) {
        const audioFiles = findAudioFiles(test.lang, test.word);
        for (const audioFile of audioFiles) {
            const meta = audioFile.metadata || {};

            tasks.push({
                audioPath: audioFile.path,
                metadataPath: audioFile.metadataPath,
                expectedIPA: test.ipa || '',
                word: test.word,
                lang: test.lang,
                source: audioFile.source,
                metadata: meta
            });
        }
    }

    const numWorkers = os.cpus().length;
    console.log(`Running ${tasks.length} tests using ${numWorkers} workers...`);

    // Run tests in parallel using workers
    const allResults = await runWorkers(tasks, modelPath, vocabPath, numWorkers);

    // Print all results combined
    if (allResults.length > 0) printResults(allResults);

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));

    const successful = allResults.filter(r => r.status === 'ok');
    const failed = allResults.filter(r => r.status !== 'ok');

    // Calculate average similarity
    const withSimilarity = allResults.filter(r => r.similarity !== undefined);
    const avgSimilarity = withSimilarity.length > 0
        ? withSimilarity.reduce((sum, r) => sum + r.similarity, 0) / withSimilarity.length
        : 0;

    console.log(`Total audio files tested: ${allResults.length}`);
    console.log(`Successful: ${successful.length}`);
    console.log(`Failed: ${failed.length}`);
    console.log(`Average similarity: ${Math.round(avgSimilarity * 100)}%`);

    // Check for regressions and update YAML files (only if strictly better)
    const regressions = [];
    const degraded = [];  // Worse but within tolerance
    const improved = [];
    const ipaChanged = []; // IPA changed but similarity same
    for (const r of withSimilarity) {
        if (!r.metadataPath) continue;

        const hasPrevious = r.previousSimilarity !== undefined;
        const hasPreviousIpa = r.previousRecognizedIpa !== undefined;
        // Regression: new is worse than previous (with small tolerance)
        const isRegression = hasPrevious && r.similarity < r.previousSimilarity - 0.01;
        // Improvement: new is better than previous (with small tolerance)
        const isImprovement = hasPrevious && r.similarity > r.previousSimilarity + 0.01;
        // Degraded: slightly worse but within tolerance (not a regression)
        const isDegraded = hasPrevious && r.similarity < r.previousSimilarity && !isRegression;
        // IPA changed but similarity is same (within tolerance)
        const isSameSimilarity = hasPrevious && Math.abs(r.similarity - r.previousSimilarity) <= 0.01;
        const isIpaChanged = hasPreviousIpa && r.previousRecognizedIpa !== r.actual && isSameSimilarity;

        if (isRegression) {
            regressions.push({
                word: r.word,
                source: r.source,
                previousSimilarity: r.previousSimilarity,
                newSimilarity: r.similarity,
                previousIpa: r.previousRecognizedIpa,
                newIpa: r.actual
            });
            // Don't update YAML on regression unless --update flag is used
            if (updateYaml && fs.existsSync(r.metadataPath)) {
                const content = fs.readFileSync(r.metadataPath, 'utf8');
                const metadata = parseYaml(content);
                metadata.recognized_ipa = r.actual;
                metadata.similarity = Math.round(r.similarity * 100) / 100;
                fs.writeFileSync(r.metadataPath, toYaml(metadata));
            }
        } else if (fs.existsSync(r.metadataPath) && (!hasPrevious || isImprovement || updateYaml)) {
            // Update YAML file if:
            // - no previous value exists, OR
            // - there's improvement, OR
            // - --update flag is used (force update)
            const content = fs.readFileSync(r.metadataPath, 'utf8');
            const metadata = parseYaml(content);
            metadata.recognized_ipa = r.actual;
            metadata.similarity = Math.round(r.similarity * 100) / 100; // Round to 2 decimal places
            fs.writeFileSync(r.metadataPath, toYaml(metadata));
            if (isImprovement) {
                improved.push({ word: r.word, source: r.source, old: r.previousSimilarity, new: r.similarity });
            }
        }

        // Track degraded results (worse but within tolerance)
        // Only report if the rounded percentages actually differ
        if (isDegraded) {
            const oldPercent = Math.round(r.previousSimilarity * 100);
            const newPercent = Math.round(r.similarity * 100);
            if (oldPercent !== newPercent) {
                degraded.push({
                    word: r.word,
                    source: r.source,
                    previousSimilarity: r.previousSimilarity,
                    newSimilarity: r.similarity,
                    previousIpa: r.previousRecognizedIpa,
                    newIpa: r.actual
                });
            }
        }

        // Track IPA changes with same similarity
        if (isIpaChanged && !isDegraded) {
            ipaChanged.push({
                word: r.word,
                source: r.source,
                similarity: r.similarity,
                previousIpa: r.previousRecognizedIpa,
                newIpa: r.actual
            });
        }
    }

    // Report improvements
    if (improved.length > 0) {
        console.log('\nImprovements:');
        for (const imp of improved) {
            const oldPercent = Math.round(imp.old * 100) + '%';
            const newPercent = Math.round(imp.new * 100) + '%';
            console.log(`  ${imp.word} (${imp.source}): ${oldPercent} -> ${newPercent}`);
        }
    }

    // Report degraded (worse but within tolerance - not failing)
    if (degraded.length > 0) {
        console.log('\nDegraded (within tolerance, not updated):');
        for (const deg of degraded) {
            const oldPercent = Math.round(deg.previousSimilarity * 100) + '%';
            const newPercent = Math.round(deg.newSimilarity * 100) + '%';
            const change = Math.round((deg.newSimilarity - deg.previousSimilarity) * 100);
            console.log(`  ${deg.word} (${deg.source}): ${oldPercent} -> ${newPercent} (${change}%)`);
            if (deg.previousIpa !== deg.newIpa) {
                console.log(`    IPA: "${deg.previousIpa}" vs "${deg.newIpa}"`);
            }
        }
    }

    // Report IPA changes with same similarity (not updated)
    if (ipaChanged.length > 0) {
        console.log('\nIPA changed (same similarity, not updated):');
        for (const chg of ipaChanged) {
            const simPercent = Math.round(chg.similarity * 100) + '%';
            console.log(`  ${chg.word} (${chg.source}): ${simPercent}`);
            console.log(`    stored:    "${chg.previousIpa}"`);
            console.log(`    extracted: "${chg.newIpa}"`);
        }
    }

    // Report regressions
    if (regressions.length > 0) {
        console.log('\n' + '='.repeat(80));
        console.log('REGRESSIONS DETECTED');
        console.log('='.repeat(80));
        console.log('Word'.padEnd(15) + 'Source'.padEnd(20) + 'Old'.padEnd(6) + 'New'.padEnd(6) + 'Change');
        console.log('-'.repeat(80));
        for (const reg of regressions) {
            const oldPercent = Math.round(reg.previousSimilarity * 100) + '%';
            const newPercent = Math.round(reg.newSimilarity * 100) + '%';
            const change = Math.round((reg.newSimilarity - reg.previousSimilarity) * 100) + '%';
            console.log(
                reg.word.padEnd(15) +
                reg.source.padEnd(20) +
                oldPercent.padEnd(6) +
                newPercent.padEnd(6) +
                change
            );
            if (reg.previousIpa !== reg.newIpa) {
                console.log(`  IPA changed: "${reg.previousIpa}" -> "${reg.newIpa}"`);
            }
        }
        console.log(`\n${regressions.length} regression(s) found!`);
    }

    if (failed.length > 0 || regressions.length > 0) {
        process.exit(1);
    }
}

main().catch(e => {
    console.error('Test failed:', e);
    process.exit(1);
});
