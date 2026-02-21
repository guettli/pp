import { test, expect } from "./fixtures.js";
import path from "path";
import fs from "fs";
import yaml from "js-yaml";

/**
 * Test for Regenbogen bug: web produces "eːgɛnbuːg" instead of "ɾeːgɛnboːgən"
 *
 * This test DETECTS the bug - it should FAIL until the bug is fixed.
 */
test.describe("Regenbogen Bug Detection", () => {
  test("Regenbogen-Thomas.flac: web produces wrong IPA", async ({ modelPage: page }) => {
    // Load expected data from Node.js extraction
    const yamlPath = path.join(
      process.cwd(),
      "tests/data/de/Regenbogen/Regenbogen-Thomas.flac.yaml",
    );
    const yamlContent = fs.readFileSync(yamlPath, "utf8");
    const expectedData = yaml.load(yamlContent);

    const expectedIPA = expectedData.recognized_ipa; // ɾeːgɛnboːgən (from Node.js)
    const phrase = expectedData.phrase;

    console.log(`\n========================================`);
    console.log(`Testing: ${phrase}`);
    console.log(`Expected IPA (Node.js): ${expectedIPA}`);
    console.log(`User reported (Web UI): eːgɛnbuːg`);
    console.log(`========================================\n`);

    // Load audio file
    const audioPath = path.join(process.cwd(), "tests/data/de/Regenbogen/Regenbogen-Thomas.flac");
    const audioBuffer = fs.readFileSync(audioPath);

    // Extract IPA using web UI's loaded model
    const webResult = await page.evaluate(
      async ({ audioData }) => {
        if (!window.__test_api) {
          return { ipa: "SKIP", error: "Test API not available" };
        }

        const { prepareAudioForModel } = await import("/src/audio/processor.js");

        const blob = new Blob([new Uint8Array(audioData)], { type: "audio/flac" });
        const audioFloat32 = await prepareAudioForModel(blob);
        const ipa = await window.__test_api.extractPhonemes(audioFloat32);

        return { ipa };
      },
      { audioData: Array.from(audioBuffer) },
    );

    console.log("\n========================================");
    console.log("RESULTS:");
    console.log(`Expected (Node.js):  ${expectedIPA}`);
    console.log(`Actual (Web UI):     ${webResult.ipa}`);
    console.log(`User reported:       eːgɛnbuːg`);
    console.log("========================================\n");

    // Calculate similarity
    const match = webResult.ipa === expectedIPA;
    const actualMatchesUserReport =
      webResult.ipa === "eːgɛnbuːg" || webResult.ipa.includes("eːgɛnbuːg");

    if (!match) {
      console.log(`🐛 BUG DETECTED!`);
      console.log(`  Web UI produces:  ${webResult.ipa}`);
      console.log(`  Expected:         ${expectedIPA}`);
      console.log(`  Difference:       Web UI produces different IPA than Node.js\n`);

      if (actualMatchesUserReport) {
        console.log(`  ✓ Confirms user report: Web UI produces "${webResult.ipa}"\n`);
      }

      // Show character-by-character comparison
      console.log("Character comparison:");
      const maxLen = Math.max(expectedIPA.length, webResult.ipa.length);
      for (let i = 0; i < maxLen; i++) {
        const expectedChar = expectedIPA[i] || " ";
        const actualChar = webResult.ipa[i] || " ";
        const match = expectedChar === actualChar ? "✓" : "✗";
        console.log(`  [${i}] Expected: '${expectedChar}' | Actual: '${actualChar}' ${match}`);
      }
    } else {
      console.log(`✓ Web UI produces correct IPA (bug may be fixed)`);
    }

    // This test should FAIL until the bug is fixed
    expect(webResult.ipa).toBe(expectedIPA);
  });
});
