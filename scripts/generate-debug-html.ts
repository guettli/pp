#!/usr/bin/env tsx
// Generate static HTML debug page for phoneme extraction visualization
// Reuses the web UI visualization code

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import yaml from "js-yaml";
import { readAudioFile } from "../src/lib/audio.js";
import { loadPhonemeModel, extractPhonemesDetailed } from "../src/lib/phoneme-model.js";
import { getExpectedIPA } from "../src/lib/phrase-data.js";
import { calculatePanPhonDistance } from "../tests/panphon-distance-node.js";
import type { PhonemeComparisonItem } from "../src/types.js";
import {
  generatePhonemeComparisonHTML,
  getPhonemeComparisonCSS,
} from "../src/ui/phoneme-comparison-view.js";
import { generateModelDetailsHTML } from "../src/ui/model-details-view.js";

// Note: All HTML generation is now imported from shared UI modules

interface DetailedPhonemeData {
  phonemes: string;
  details: Array<{
    symbol: string;
    confidence: number;
    duration: number;
  }>;
  raw: {
    frames: number;
    vocabSize: number;
    frameData: Array<{
      frameIndex: number;
      topPredictions: Array<{
        symbol: string;
        tokenId: number;
        logit: number;
        probability: number;
      }>;
    }>;
  };
}

/**
 * Generate complete HTML page
 */
function generateHTML(data: {
  phrase: string;
  lang: string;
  source: string;
  audioFile: string;
  expectedIPA: string;
  recognizedIPA: string;
  similarity: number;
  phonemeComparison: PhonemeComparisonItem[];
  detailedPhonemes: DetailedPhonemeData;
  audioDuration: number;
}): string {
  const phonemeComparisonHTML = generatePhonemeComparisonHTML(
    data.phonemeComparison,
    (key: string) => key.split(".").pop() || key, // Simple translation function for CLI
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Phoneme Debug: ${data.phrase}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <style>
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      padding: 2rem;
      background: #f8f9fa;
    }
    .container {
      max-width: 1200px;
      background: white;
      padding: 2rem;
      border-radius: 0.5rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    ${getPhonemeComparisonCSS()}
    .phoneme-words-wrapper {
      margin: 2rem 0;
    }
    .info-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.5rem 1rem;
      margin: 1rem 0;
    }
    .info-label {
      font-weight: 600;
      color: #495057;
    }
    .info-value {
      color: #212529;
    }
    .similarity-badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 0.25rem;
      font-weight: 600;
      font-size: 1.1rem;
    }
    .similarity-good { background: #d1e7dd; color: #0f5132; }
    .similarity-fair { background: #fff3cd; color: #997404; }
    .similarity-poor { background: #f8d7da; color: #842029; }
    table {
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1 class="mb-4">🔍 Phoneme Extraction Debug</h1>

    <div class="info-grid">
      <span class="info-label">Phrase:</span>
      <span class="info-value"><strong>${data.phrase}</strong></span>

      <span class="info-label">Language:</span>
      <span class="info-value">${data.lang}</span>

      <span class="info-label">Source:</span>
      <span class="info-value">${data.source}</span>

      <span class="info-label">Audio File:</span>
      <span class="info-value"><code>${data.audioFile}</code></span>

      <span class="info-label">Duration:</span>
      <span class="info-value">${data.audioDuration.toFixed(2)}s</span>
    </div>

    <hr class="my-4">

    <h2 class="mb-3">Phoneme Comparison</h2>

    <div class="info-grid mb-4">
      <span class="info-label">Expected IPA:</span>
      <span class="info-value"><code style="font-size: 1.2rem">${data.expectedIPA}</code></span>

      <span class="info-label">Recognized IPA:</span>
      <span class="info-value"><code style="font-size: 1.2rem">${data.recognizedIPA}</code></span>

      <span class="info-label">Similarity:</span>
      <span class="info-value">
        <span class="similarity-badge ${data.similarity >= 0.85 ? "similarity-good" : data.similarity >= 0.65 ? "similarity-fair" : "similarity-poor"}">
          ${(data.similarity * 100).toFixed(1)}%
        </span>
      </span>
    </div>

    ${phonemeComparisonHTML}

    <hr class="my-4">

    <h2 class="mb-3">Model Details</h2>

    ${generateModelDetailsHTML(data.detailedPhonemes)}

    <hr class="my-4">

    <h2 class="mb-3">Legend</h2>

    <div class="row">
      <div class="col-md-6">
        <h5>Phoneme Status:</h5>
        <ul>
          <li><span class="phoneme-char match">Match</span> - Correct phoneme</li>
          <li><span class="phoneme-char mismatch">Mismatch</span> - Wrong phoneme</li>
          <li><span class="phoneme-char missing">Missing</span> - Expected but not detected</li>
          <li><span class="phoneme-char extra">Extra</span> - Detected but not expected</li>
        </ul>
      </div>
    </div>

    <hr class="my-4">

    <p class="text-muted">
      Generated by <code>scripts/generate-debug-html.ts</code> on ${new Date().toISOString()}
    </p>
  </div>
</body>
</html>`;
}

async function main() {
  let yamlFile = process.argv[2];
  const outputFile = process.argv[3];

  if (!yamlFile) {
    console.error("Usage: tsx scripts/generate-debug-html.ts <flac-or-yaml-file> [output.html]");
    console.error(
      "Example: tsx scripts/generate-debug-html.ts tests/data/de-DE/Erdbeere/Erdbeere-Thomas.flac.yaml debug.html",
    );
    process.exit(1);
  }

  if (yamlFile.endsWith(".flac")) {
    yamlFile = yamlFile + ".yaml";
  }

  if (!fs.existsSync(yamlFile)) {
    console.error(`File not found: ${yamlFile}`);
    process.exit(1);
  }

  console.log("Loading data...");
  const content = fs.readFileSync(yamlFile, "utf8");
  const yamlData = yaml.load(content) as any;

  const flacFile = yamlFile.replace(".yaml", "");
  if (!fs.existsSync(flacFile)) {
    console.error(`Audio file not found: ${flacFile}`);
    process.exit(1);
  }

  const expectedIPA = getExpectedIPA(yamlData.phrase, yamlData.lang);

  console.log("Loading model...");
  const { session, idToToken } = await loadPhonemeModel();

  console.log("Processing audio...");
  const audioData = readAudioFile(flacFile);
  const audioDuration = audioData.length / 16000;

  // Extract phonemes with full details
  const detailedPhonemes = await extractPhonemesDetailed(audioData, session, idToToken);

  // Calculate phoneme comparison
  const panphonResult = calculatePanPhonDistance(
    expectedIPA,
    detailedPhonemes.phonemes,
    yamlData.lang,
  );

  // Generate HTML
  console.log("Generating HTML...");
  const html = generateHTML({
    phrase: yamlData.phrase,
    lang: yamlData.lang,
    source: yamlData.source,
    audioFile: path.basename(flacFile),
    expectedIPA,
    recognizedIPA: detailedPhonemes.phonemes,
    similarity: panphonResult.similarity,
    phonemeComparison: panphonResult.phonemeComparison,
    detailedPhonemes,
    audioDuration,
  });

  // Write output
  const output = outputFile || yamlFile.replace(".flac.yaml", "-debug.html");
  fs.writeFileSync(output, html);

  const absolutePath = path.resolve(output);
  console.log(`\n✅ HTML debug page generated: file://${absolutePath}`);
  execSync(`xdg-open "${absolutePath}"`);
}

main();
