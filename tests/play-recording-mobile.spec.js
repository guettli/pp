/**
 * Test that play-recording-btn works in strict autoplay environments (simulates Android).
 *
 * Root cause of the Android bug:
 *   The original code used audio.load() + oncanplay → audio.play().
 *   The oncanplay callback fires asynchronously, outside the user gesture context.
 *   Android enforces that audio.play() must be called within a user gesture handler,
 *   causing NotAllowedError when called from an async callback.
 *
 * Fix:
 *   Call audio.play() directly within the click handler (synchronously within the gesture).
 *
 * Simulation technique:
 *   We mock HTMLAudioElement.prototype.play via addInitScript. The mock rejects with
 *   NotAllowedError when called outside an active gesture context (tracked via a flag that
 *   is set synchronously before the click and cleared after the first microtask).
 *   This precisely replicates Android's behavior without relying on Chrome autoplay flags.
 */
import { devices, expect, test } from "@playwright/test";

test.describe("play-recording-btn - mobile autoplay @slow", () => {
  test("plays without NotAllowedError when audio.play() is called within the gesture handler", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      ...devices["Pixel 5"],
    });

    // Install the gesture-tracking mock before any page script runs.
    // window._pp_gestureActive: true while the synchronous click handler is running.
    // HTMLAudioElement.prototype.play: rejects when called outside the gesture window,
    // exactly like Android's strict autoplay policy.
    await context.addInitScript(() => {
      window._pp_gestureActive = false;

      const originalPlay = HTMLAudioElement.prototype.play;
      HTMLAudioElement.prototype.play = function () {
        if (!window._pp_gestureActive) {
          const err = new DOMException(
            "play() failed because the user agent disallowed it outside a user gesture.",
            "NotAllowedError",
          );
          // Surface the full error with stack so it is visible in Playwright console output
          console.error("Playback error:", err.name, err.message, err.stack);
          return Promise.reject(err);
        }
        // Gesture is active: allow play (resolve immediately — audio is silent in tests)
        return Promise.resolve();
      };
    });

    const page = await context.newPage();

    const playbackErrors = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("Playback error") || text.includes("NotAllowedError")) {
        playbackErrors.push(text);
      }
    });

    // Navigate to the app (full URL, no baseURL set on this context).
    await page.goto("http://localhost:5173/phoneme-party");
    // Wait for the overlay to appear (proves the app loaded), then for it to disappear
    // (model loaded, __test_api is now available).
    await page.waitForSelector("#loading-overlay", { state: "visible", timeout: 30000 });
    await page.locator("#loading-overlay").waitFor({ state: "hidden", timeout: 180000 });

    // Inject a short silent WAV blob via __test_api (DEV mode only).
    // This simulates having made a recording so that play-recording-btn appears in DOM.
    await page.evaluate(() => {
      const sampleRate = 8000;
      const numSamples = Math.floor(sampleRate * 0.5); // 0.5 s of silence
      const buf = new ArrayBuffer(44 + numSamples * 2);
      const v = new DataView(buf);
      const ws = (off, s) => {
        for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
      };
      ws(0, "RIFF");
      v.setUint32(4, 36 + numSamples * 2, true);
      ws(8, "WAVE");
      ws(12, "fmt ");
      v.setUint32(16, 16, true);
      v.setUint16(20, 1, true); // PCM
      v.setUint16(22, 1, true); // mono
      v.setUint32(24, sampleRate, true);
      v.setUint32(28, sampleRate * 2, true);
      v.setUint16(32, 2, true); // block align
      v.setUint16(34, 16, true); // bits per sample
      ws(36, "data");
      v.setUint32(40, numSamples * 2, true);

      const blob = new Blob([buf], { type: "audio/wav" });
      window.__test_api.setState({ lastRecordingBlob: blob });
    });

    // Wait for the button to appear in the DOM (Svelte re-renders after setState).
    // state:'attached' because the button lives inside display:none containers.
    await page.waitForSelector("#play-recording-btn", { state: "attached", timeout: 5000 });

    // Simulate the click with precise gesture-window tracking:
    //   1. Set _pp_gestureActive = true (gesture starts)
    //   2. Schedule microtask to clear it (gesture ends after synchronous handler)
    //   3. Call element.click() — triggers playRecordingAudio()
    //
    // With the OLD code (oncanplay): play() fires in a later macrotask when
    //   _pp_gestureActive is already false → NotAllowedError → test FAILS.
    //
    // With the NEW code (direct play()): play() fires synchronously inside click()
    //   while _pp_gestureActive is still true → resolves → test PASSES.
    await page.evaluate(() => {
      window._pp_gestureActive = true;
      Promise.resolve().then(() => {
        window._pp_gestureActive = false;
      });
      document.getElementById("play-recording-btn").click();
    });

    // Wait for macrotask callbacks (oncanplay, setTimeout retries) to fire
    await page.waitForTimeout(500);

    expect(
      playbackErrors,
      "audio.play() must be called synchronously within the click handler (not in oncanplay)",
    ).toHaveLength(0);

    await context.close();
  });
});
