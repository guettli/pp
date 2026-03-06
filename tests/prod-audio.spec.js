// @ts-check
import { expect, test } from "@playwright/test";
import { readdirSync } from "fs";
import { resolve } from "path";

const PROD_URL = "https://thomas-guettler.de/phoneme-party/";

/** Pick up to `n` random items from `arr` without repetition. */
function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

/** Return filenames (without extension) that actually exist in the audio dir. */
function getAudioStems(studyLang, voiceName) {
  const projectRoot = resolve(import.meta.dirname, "..");
  const dir = resolve(projectRoot, "static", "audio", studyLang, voiceName);
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".opus"))
      .map((f) => f.replace(/\.opus$/, ""));
  } catch {
    return [];
  }
}

const VOICES = {
  "de-DE": ["edge-tts-male", "edge-tts-female"],
  "en-GB": ["edge-tts-male", "edge-tts-female"],
  "fr-FR": ["edge-tts-male", "edge-tts-female"],
  "it-IT": ["edge-tts-male", "edge-tts-female"],
};

test.describe("Production voice audio files", () => {
  test("3 random audio files per lang/voice are HTTP 200", async ({ request }) => {
    const failures = [];

    for (const [studyLang, voices] of Object.entries(VOICES)) {
      for (const voiceName of voices) {
        const stems = getAudioStems(studyLang, voiceName);
        if (stems.length === 0) {
          failures.push(`${studyLang}/${voiceName}: no audio files found locally`);
          continue;
        }

        const sample = pickRandom(stems, 3);

        for (const stem of sample) {
          const url = `${PROD_URL}audio/${studyLang}/${voiceName}/${stem}.opus`;
          const resp = await request.head(url);
          if (resp.status() !== 200) {
            failures.push(`${studyLang}/${voiceName}: "${stem}" → ${url} → HTTP ${resp.status()}`);
          }
        }
      }
    }

    expect(
      failures,
      `${failures.length} audio file(s) returned non-200:\n${failures.join("\n")}`,
    ).toHaveLength(0);
  });
});
