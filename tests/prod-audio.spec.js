// @ts-check
import { expect, test } from "@playwright/test";

const PROD_URL = "https://thomas-guettler.de/phoneme-party/";

/** Pick up to `n` random items from `arr` without repetition. */
function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

test.describe("Production voice audio files", () => {
  test("all voices in manifest have at least 1 phrase (no broken/empty voices)", async ({
    request,
  }) => {
    const manifestResp = await request.get(`${PROD_URL}audio/manifest.json`);
    expect(manifestResp.status(), "manifest.json must be accessible").toBe(200);
    const manifest = await manifestResp.json();

    const emptyVoices = [];

    for (const [studyLang, voices] of Object.entries(manifest)) {
      for (const [voiceName, phrases] of Object.entries(voices)) {
        if (Object.keys(phrases).length === 0) {
          emptyVoices.push(`${studyLang}/${voiceName}`);
        }
      }
    }

    expect(
      emptyVoices,
      `${emptyVoices.length} voice(s) have 0 phrases in manifest (broken voices):\n${emptyVoices.join("\n")}`,
    ).toHaveLength(0);
  });

  test("3 random audio files per lang/voice are HTTP 200", async ({ request }) => {
    const manifestResp = await request.get(`${PROD_URL}audio/manifest.json`);
    expect(manifestResp.status(), "manifest.json must be accessible").toBe(200);
    const manifest = await manifestResp.json();

    const failures = [];

    for (const [studyLang, voices] of Object.entries(manifest)) {
      for (const [voiceName, phrases] of Object.entries(voices)) {
        const entries = Object.entries(phrases);
        if (entries.length === 0) continue;

        const sample = pickRandom(entries, 3);

        for (const [phrase, hash] of sample) {
          const url = `${PROD_URL}audio/${studyLang}/${voiceName}/${hash}.opus`;
          const resp = await request.head(url);
          if (resp.status() !== 200) {
            failures.push(
              `${studyLang}/${voiceName}: "${phrase}" → ${url} → HTTP ${resp.status()}`,
            );
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
