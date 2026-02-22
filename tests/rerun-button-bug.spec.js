import { test, expect } from "./fixtures.js";
import path from "path";
import fs from "fs";

/**
 * Regression test: after pressing re-run (reprocess-recording-btn),
 * the record button must be re-enabled and the progress bar must be hidden.
 * Bug: reprocessRecording() was missing resetRecordButton(), leaving
 * the record button disabled and the progress bar stuck at 100%.
 */
test.describe("Re-run button bug", () => {
  test("record button re-enabled and progress bar hidden after re-run", async ({
    modelPage: page,
  }) => {
    const audioPath = path.join(process.cwd(), "tests/data/de/Die_Rose/Die_Rose-Thomas.flac");
    const audioBuffer = fs.readFileSync(audioPath);

    // Set up state via the test API (same module instance as main.ts uses)
    const error = await page.evaluate(
      async ({ audioData }) => {
        try {
          if (!window.__test_api) throw new Error("Test API not available");

          const { prepareAudioForModel } = await import("/src/audio/processor.js");
          const blob = new Blob([new Uint8Array(audioData)], { type: "audio/flac" });
          const audioFloat32 = await prepareAudioForModel(blob);

          // Use test API setState — same state object main.ts uses
          window.__test_api.setState({
            lastRecordingAudioData: audioFloat32,
            lastRecordingBlob: blob,
          });

          // Ensure a phrase is loaded (use test API getState to check)
          if (!window.__test_api.getState().currentPhrase) {
            const { getRandomPhrase } = await import("/src/utils/random.js");
            const phrase = getRandomPhrase("de", 1);
            window.__test_api.setState({ currentPhrase: phrase });
          }

          // Simulate post-recording UI state (record button disabled, progress bar at 100%)
          const recordBtn = document.getElementById("record-btn");
          if (recordBtn) recordBtn.disabled = true;

          const progressContainer = document.getElementById("processing-progress");
          const progressBar = document.getElementById("processing-progress-bar");
          if (progressContainer) progressContainer.style.display = "block";
          if (progressBar) {
            progressBar.style.width = "100%";
            progressBar.setAttribute("aria-valuenow", "100");
          }

          // Trigger reprocess via the test API (uses main.ts's reprocessRecording directly)
          window.__test_api.triggerReprocess();

          return null;
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      },
      { audioData: Array.from(audioBuffer) },
    );

    if (error) throw new Error(error);

    // After re-run completes: record button must be re-enabled
    await expect(page.locator("#record-btn")).toBeEnabled({ timeout: 15000 });

    // Progress bar container must be hidden
    await expect(page.locator("#processing-progress")).toBeHidden();

    console.log("✓ Record button re-enabled after re-run");
    console.log("✓ Progress bar hidden after re-run");
  });
});
