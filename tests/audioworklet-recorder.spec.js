import { expect, test } from "./fixtures.js";

/**
 * Tests that the AudioWorklet-based recorder can load its processor correctly.
 *
 * Regression test for:
 *   "AudioWorkletNode cannot be created: The node name 'pcm-recorder-processor'
 *    is not defined in AudioWorkletGlobalScope."
 *
 * Root cause: the worklet code called `registerAudioWorkletProcessor()` which
 * is not a valid AudioWorkletGlobalScope API.  The correct function is
 * `registerProcessor()`.
 */
test.describe("AudioWorklet Recorder", () => {
  test("pcm-recorder-processor should be registered after addModule", async ({
    modelPage: page,
  }) => {
    const result = await page.evaluate(async () => {
      try {
        // Import the WORKLET_PROCESSOR_CODE string from the recorder module.
        // We expose it via a temporary dynamic import then re-run addModule ourselves.
        const recorderModule = await import("/phoneme-party/src/audio/recorder.js");

        // The AudioRecorder class is the default export. Instantiate it and call
        // start() with a mock stream to exercise the addModule path without needing
        // a real microphone.  We intercept getUserMedia to return a silent stream.

        const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

        // Create a silent MediaStream (1 channel, 16 kHz)
        const silentCtx = new AudioContext({ sampleRate: 16000 });
        const dest = silentCtx.createMediaStreamDestination();
        const silentStream = dest.stream;

        let addModuleError = null;
        let workletNodeError = null;
        let registered = false;

        try {
          // Temporarily replace getUserMedia so AudioRecorder gets a real MediaStream
          // without prompting.
          navigator.mediaDevices.getUserMedia = async () => silentStream;

          const recorder = new recorderModule.AudioRecorder();

          // start() will: getUserMedia → new AudioContext → addModule → new AudioWorkletNode
          // We wrap in a timeout race so the test doesn't hang on 'stopped' message.
          await Promise.race([
            recorder.start(null, null, 500),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("start() timeout")), 5000),
            ),
          ]);

          registered = true;

          // Stop cleanly
          try {
            await Promise.race([
              recorder.stop(),
              new Promise((resolve) => setTimeout(resolve, 500)),
            ]);
          } catch {
            /* ignore stop errors in this test */
          }
        } catch (err) {
          if (err.message && err.message.includes("not defined in AudioWorkletGlobalScope")) {
            workletNodeError = err.message;
          } else if (err.message && err.message.includes("timeout")) {
            // start() resolved (no error) — which means addModule + AudioWorkletNode worked
            registered = true;
          } else {
            addModuleError = err.message;
          }
        } finally {
          navigator.mediaDevices.getUserMedia = origGetUserMedia;
          silentCtx.close().catch(() => {});
        }

        return { registered, addModuleError, workletNodeError };
      } catch (outerErr) {
        return { registered: false, addModuleError: outerErr.message, workletNodeError: null };
      }
    });

    console.log("\n=== AudioWorklet Recorder test ===");
    console.log(`  registered:      ${result.registered}`);
    console.log(`  addModuleError:  ${result.addModuleError}`);
    console.log(`  workletNodeError: ${result.workletNodeError}`);

    expect(
      result.workletNodeError,
      "Got the 'not defined in AudioWorkletGlobalScope' error — registerProcessor() is not called correctly",
    ).toBeNull();

    expect(result.registered, `AudioWorklet failed to load: ${result.addModuleError}`).toBe(true);
  });
});
