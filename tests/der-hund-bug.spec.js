import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";
import yaml from "js-yaml";

/**
 * Test for Der_Hund bug: web produces "ejahoni" instead of "ejahond"
 */
test.describe("Der_Hund Bug", () => {
  test("Der_Hund-Thomas.flac: web should match Node.js extraction", async ({ page }) => {
    // Load expected data
    const yamlPath = path.join(process.cwd(), "tests/data/de/Der_Hund/Der_Hund-Thomas.flac.yaml");
    const yamlContent = fs.readFileSync(yamlPath, "utf8");
    const expectedData = yaml.load(yamlContent);

    const expectedIPA = expectedData.recognized_ipa; // ejahond (from Node.js)
    const phrase = expectedData.phrase;

    console.log(`\nTesting: ${phrase}`);
    console.log(`Expected IPA (from Node.js): ${expectedIPA}`);
    console.log(`User reported via web: ejahoni\n`);

    // Load audio file
    const audioPath = path.join(process.cwd(), "tests/data/de/Der_Hund/Der_Hund-Thomas.flac");
    const audioBuffer = fs.readFileSync(audioPath);

    // Navigate to app
    await page.goto("/");
    await page.locator("#loading-overlay").waitFor({ state: "hidden", timeout: 180000 });

    console.log("Model loaded\n");

    // Test: Extract IPA using web UI's loaded model
    const webResult = await page.evaluate(
      async ({ audioData }) => {
        if (!window.__test_api) {
          return { ipa: "SKIP", error: "Test API not available" };
        }

        const { prepareAudioForWhisper } = await import("/src/audio/processor.js");

        const blob = new Blob([new Uint8Array(audioData)], { type: "audio/flac" });
        const audioFloat32 = await prepareAudioForWhisper(blob);
        const ipa = await window.__test_api.extractPhonemes(audioFloat32);

        return { ipa };
      },
      { audioData: Array.from(audioBuffer) },
    );

    console.log("=== RESULTS ===");
    console.log(`Expected (Node.js): ${expectedIPA}`);
    console.log(`Actual (Web UI):    ${webResult.ipa}`);
    console.log(`User reported:      ejahoni`);

    if (webResult.ipa !== expectedIPA) {
      console.log(`\n🐛 BUG DETECTED!`);
      console.log(`Web UI produces: ${webResult.ipa}`);
      console.log(`Expected:        ${expectedIPA}`);
      console.log(`Difference: Web UI produces different IPA than Node.js`);
    }

    // Should match expected
    expect(webResult.ipa).toBe(expectedIPA);
  });
});
