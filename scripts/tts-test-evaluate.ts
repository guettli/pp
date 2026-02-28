#!/usr/bin/env tsx
/**
 * TTS Test Evaluator
 *
 * Reads audio manifest (tts-test/results/audio-manifest.json),
 * extracts IPA from each audio file using the ONNX model,
 * compares with target IPA using PanPhon distance,
 * and writes a full results report to tts-test/results/evaluation.json
 *
 * Usage:
 *   ./run tsx scripts/tts-test-evaluate.ts
 */

import fs from "fs";
import path from "path";
import { readAudioFile } from "../src/lib/audio.js";
import { extractPhonemes, loadPhonemeModel } from "../src/lib/phoneme-model.js";
import { calculatePanPhonDistance } from "../tests/panphon-distance-node.js";

const PROJECT_DIR = path.resolve(import.meta.dirname, "..");
const TTS_TEST_DIR = path.join(PROJECT_DIR, "tts-test");
const SENTENCES_FILE = path.join(TTS_TEST_DIR, "sentences.json");
const MANIFEST_FILE = path.join(TTS_TEST_DIR, "results", "audio-manifest.json");
const EVAL_FILE = path.join(TTS_TEST_DIR, "results", "evaluation.json");
const REPORT_FILE = path.join(TTS_TEST_DIR, "results", "report.md");

interface Sentence {
  id: number;
  text: string;
  focus: string;
  target_ipa: string;
}

interface AudioFile {
  id: number;
  text: string;
  audio_file?: string;
  status: string;
  error?: string;
}

interface VariantManifest {
  label: string;
  files: AudioFile[];
}

interface SentenceResult {
  id: number;
  text: string;
  target_ipa: string;
  recognized_ipa: string;
  similarity: number;
  panphon_distance: number;
}

interface VariantResult {
  variant: string;
  label: string;
  sentences: SentenceResult[];
  avg_similarity: number;
  min_similarity: number;
  total_files: number;
  ok_files: number;
}

async function main() {
  if (!fs.existsSync(MANIFEST_FILE)) {
    console.error(`ERROR: Audio manifest not found: ${MANIFEST_FILE}`);
    console.error("Run generate-audio.py first.");
    process.exit(1);
  }

  if (!fs.existsSync(SENTENCES_FILE)) {
    console.error(`ERROR: Sentences file not found: ${SENTENCES_FILE}`);
    process.exit(1);
  }

  const sentencesData = JSON.parse(fs.readFileSync(SENTENCES_FILE, "utf8")) as {
    study_lang: string;
    sentences: Sentence[];
  };
  const sentenceMap = new Map<number, Sentence>(sentencesData.sentences.map((s) => [s.id, s]));
  const studyLang = sentencesData.study_lang;

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, "utf8")) as Record<
    string,
    VariantManifest
  >;

  console.log("Loading ONNX phoneme model...");
  const { session, idToToken } = await loadPhonemeModel();
  console.log("Model loaded.\n");

  const allResults: VariantResult[] = [];

  for (const [variantKey, variantData] of Object.entries(manifest)) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Evaluating: ${variantKey}`);
    console.log(`  ${variantData.label}`);
    console.log("=".repeat(60));

    const sentenceResults: SentenceResult[] = [];
    let okCount = 0;

    for (const fileEntry of variantData.files) {
      const sentence = sentenceMap.get(fileEntry.id);
      if (!sentence) continue;

      if (fileEntry.status !== "ok" || !fileEntry.audio_file) {
        console.log(
          `  [${String(fileEntry.id).padStart(2, "0")}] SKIP (status=${fileEntry.status})`,
        );
        continue;
      }

      const audioPath = path.join(PROJECT_DIR, fileEntry.audio_file);
      if (!fs.existsSync(audioPath)) {
        console.log(`  [${fileEntry.id}] SKIP (file missing: ${audioPath})`);
        continue;
      }

      try {
        const audioData = readAudioFile(audioPath);
        const recognizedIPA = (await extractPhonemes(audioData, session, idToToken, {
          minConfidence: 0.3,
          returnDetails: false,
        })) as string;

        const { similarity, distance } = calculatePanPhonDistance(
          sentence.target_ipa,
          recognizedIPA,
          studyLang,
        );

        const simPct = (similarity * 100).toFixed(1);
        const bar =
          "█".repeat(Math.round(similarity * 20)) + "░".repeat(20 - Math.round(similarity * 20));
        console.log(
          `  [${String(fileEntry.id).padStart(2, "0")}] ${simPct.padStart(5)}% ${bar} | target: ${sentence.target_ipa}`,
        );
        console.log(`         recognized: ${recognizedIPA}`);

        sentenceResults.push({
          id: sentence.id,
          text: sentence.text,
          target_ipa: sentence.target_ipa,
          recognized_ipa: recognizedIPA,
          similarity,
          panphon_distance: distance,
        });
        okCount++;
      } catch (err) {
        console.error(`  [${fileEntry.id}] ERROR: ${(err as Error).message}`);
      }
    }

    if (sentenceResults.length === 0) {
      console.log("  No results for this variant.");
      continue;
    }

    const avgSimilarity =
      sentenceResults.reduce((sum, r) => sum + r.similarity, 0) / sentenceResults.length;
    const minSimilarity = Math.min(...sentenceResults.map((r) => r.similarity));

    console.log(`\n  Average similarity: ${(avgSimilarity * 100).toFixed(1)}%`);

    allResults.push({
      variant: variantKey,
      label: variantData.label,
      sentences: sentenceResults,
      avg_similarity: avgSimilarity,
      min_similarity: minSimilarity,
      total_files: variantData.files.length,
      ok_files: okCount,
    });
  }

  // Sort by average similarity descending
  allResults.sort((a, b) => b.avg_similarity - a.avg_similarity);

  // Write JSON evaluation
  fs.writeFileSync(EVAL_FILE, JSON.stringify(allResults, null, 2));
  console.log(`\nEvaluation written to: ${EVAL_FILE}`);

  // Write Markdown report
  const report = generateMarkdownReport(allResults);
  fs.writeFileSync(REPORT_FILE, report);
  console.log(`Report written to: ${REPORT_FILE}`);

  // Print ranking summary
  console.log("\n" + "=".repeat(70));
  console.log("TTS RANKING (by average IPA similarity to target)");
  console.log("=".repeat(70));
  for (let i = 0; i < allResults.length; i++) {
    const r = allResults[i];
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
    console.log(
      `${medal} ${String(i + 1).padStart(2)}. ${(r.avg_similarity * 100).toFixed(1).padStart(5)}% avg | min=${(r.min_similarity * 100).toFixed(1).padStart(5)}% | ${r.variant}`,
    );
    console.log(`       ${r.label}`);
  }
}

function generateMarkdownReport(results: VariantResult[]): string {
  const lines: string[] = [];
  lines.push("# TTS Test Report – German Pronunciation Evaluation");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Ranking");
  lines.push("");
  lines.push("| Rank | Variant | Avg Similarity | Min Similarity | Label |");
  lines.push("|------|---------|---------------|---------------|-------|");

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    lines.push(
      `| ${medal} | \`${r.variant}\` | ${(r.avg_similarity * 100).toFixed(1)}% | ${(r.min_similarity * 100).toFixed(1)}% | ${r.label} |`,
    );
  }

  lines.push("");
  lines.push("## Detailed Results per Variant");
  lines.push("");

  for (const r of results) {
    lines.push(`### ${r.variant} – ${(r.avg_similarity * 100).toFixed(1)}% avg`);
    lines.push(`> ${r.label}`);
    lines.push("");
    lines.push("| # | Text | Target IPA | Recognized IPA | Similarity |");
    lines.push("|---|------|-----------|---------------|-----------|");
    for (const s of r.sentences) {
      const bar = "█".repeat(Math.round(s.similarity * 10));
      lines.push(
        `| ${s.id} | ${s.text} | \`${s.target_ipa}\` | \`${s.recognized_ipa}\` | ${(s.similarity * 100).toFixed(1)}% ${bar} |`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
