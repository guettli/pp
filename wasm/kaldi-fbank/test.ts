#!/usr/bin/env tsx
/**
 * Test Kaldi Fbank WASM against Python/Lhotse
 *
 * Usage:
 *   ./run tsx wasm/kaldi-fbank/test.ts                       # self-test (assertions)
 *   ./run tsx wasm/kaldi-fbank/test.ts <audio-file>          # inspect any audio file
 */

import path from "path";
import { fileURLToPath } from "url";
import { readAudioFile } from "../../src/lib/audio.js";
import { extractKaldiFbank } from "./index.js";

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

let _failures = 0;

function assert(desc: string, actual: number, expected: number, tol = 0.001): void {
  const ok = Math.abs(actual - expected) <= tol;
  console.log(
    `  ${ok ? "✓" : "✗"} ${desc}: ${actual.toFixed(6)} (expected ≈ ${expected.toFixed(6)})`,
  );
  if (!ok) _failures++;
}

function assertEqual(desc: string, actual: number, expected: number): void {
  const ok = actual === expected;
  console.log(`  ${ok ? "✓" : "✗"} ${desc}: ${actual} (expected ${expected})`);
  if (!ok) _failures++;
}

// ---------------------------------------------------------------------------
// Self-test: known expected values for Ball-edge-tts-conrad.flac
// Regression values produced by the Zig WASM implementation.
// TODO: cross-check against Python/Lhotse once that env is available.
// ---------------------------------------------------------------------------

async function selfTest(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const audioPath = path.join(__dirname, "../../tests/data/de/Ball/Ball-edge-tts-conrad.flac");

  console.log("=== Kaldi Fbank WASM Self-Test ===\n");
  console.log(`Audio: ${path.relative(process.cwd(), audioPath)}`);

  const audio = readAudioFile(audioPath);
  const features = await extractKaldiFbank(audio);
  const numFrames = features.length / 80;

  const featureMin = Math.min(...features);
  const featureMax = Math.max(...features);
  const mean = features.reduce((a, b) => a + b, 0) / features.length;
  const std = Math.sqrt(features.reduce((a, b) => a + (b - mean) ** 2, 0) / features.length);

  console.log(`\nAssertions:`);
  assertEqual("num_frames", numFrames, 134);
  // log(torch.finfo(float).eps) = log(1.1920929e-07) ≈ -15.9424
  assert("feature_min (log-epsilon floor)", featureMin, -15.942385, 0.0001);
  assert("feature_max", featureMax, 4.051235, 0.1);
  assert("feature_mean", mean, -13.82471, 0.01);
  assert("feature_std", std, 4.475369, 0.01);

  console.log();
  if (_failures === 0) {
    console.log("✓ All assertions passed");
  } else {
    console.error(`✗ ${_failures} assertion(s) failed`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Inspection mode: print stats for any audio file
// ---------------------------------------------------------------------------

async function inspect(audioPath: string): Promise<void> {
  console.log("=== Kaldi Fbank WASM Test ===\n");
  console.log(`Audio file: ${audioPath}\n`);

  const audio = readAudioFile(audioPath);
  console.log(`Audio: ${audio.length} samples (${(audio.length / 16000).toFixed(2)}s)`);

  const features = await extractKaldiFbank(audio);
  const numFrames = features.length / 80;

  console.log(`\nFeatures:`);
  console.log(`  Shape: (${numFrames}, 80)`);
  console.log(
    `  Range: [${Math.min(...features).toFixed(6)}, ${Math.max(...features).toFixed(6)}]`,
  );

  const mean = features.reduce((a, b) => a + b, 0) / features.length;
  const variance = features.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / features.length;
  const std = Math.sqrt(variance);

  console.log(`  Mean:  ${mean.toFixed(6)}`);
  console.log(`  Std:   ${std.toFixed(6)}`);

  console.log(`\nFirst 3 frames (all 80 bins):`);
  for (let i = 0; i < Math.min(3, numFrames); i++) {
    const frame = features.slice(i * 80, (i + 1) * 80);
    const frameMin = Math.min(...frame);
    const frameMax = Math.max(...frame);
    const frameMean = frame.reduce((a, b) => a + b, 0) / frame.length;
    console.log(
      `Frame ${i}: min=${frameMin.toFixed(6)}, max=${frameMax.toFixed(6)}, mean=${frameMean.toFixed(6)}`,
    );
  }

  console.log(`\nLast 3 frames (all 80 bins):`);
  for (let i = Math.max(0, numFrames - 3); i < numFrames; i++) {
    const frame = features.slice(i * 80, (i + 1) * 80);
    const frameMin = Math.min(...frame);
    const frameMax = Math.max(...frame);
    const frameMean = frame.reduce((a, b) => a + b, 0) / frame.length;
    console.log(
      `Frame ${i}: min=${frameMin.toFixed(6)}, max=${frameMax.toFixed(6)}, mean=${frameMean.toFixed(6)}`,
    );
  }

  let maxVal = -Infinity;
  let maxFrameIdx = 0;
  for (let i = 0; i < numFrames; i++) {
    const frame = features.slice(i * 80, (i + 1) * 80);
    const frameMax = Math.max(...frame);
    if (frameMax > maxVal) {
      maxVal = frameMax;
      maxFrameIdx = i;
    }
  }
  console.log(`\nFrame with max value:`);
  const maxFrame = Array.from(features.slice(maxFrameIdx * 80, maxFrameIdx * 80 + 10));
  console.log(`Frame ${maxFrameIdx}: [${maxFrame.map((v) => v.toFixed(6)).join(", ")}]`);

  console.log("\n✓ Extraction successful!");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const audioPath = process.argv[2];
if (audioPath) {
  inspect(audioPath).catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  });
} else {
  selfTest().catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  });
}
