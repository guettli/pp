/**
 * Audio recording using AudioWorklet API for true real-time PCM streaming.
 *
 * Unlike MediaRecorder (which produces compressed container chunks that cannot be
 * decoded individually), AudioWorklet delivers raw Float32 PCM samples on every
 * callback. This means callers receive independently usable data on each chunk —
 * no need to re-process all accumulated audio from scratch every time.
 */

const SAMPLE_RATE = 16000;

/**
 * AudioWorkletProcessor source loaded as a Blob URL so it works with any bundler
 * without needing a separate build step.  The processor collects 128-sample blocks,
 * assembles them into batches of `intervalSamples` length, then posts each batch
 * to the main thread as a transferable Float32Array.
 */
const WORKLET_PROCESSOR_CODE = `
class PcmRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._collectedSamples = 0;
    this._intervalSamples = 8000; // default: ~500ms at 16 kHz
    this._stopped = false;

    this.port.onmessage = (e) => {
      if (e.data.type === 'config') {
        this._intervalSamples = e.data.intervalSamples;
      } else if (e.data.type === 'stop') {
        this._stopped = true;
        const remaining = this._flush();
        if (remaining.length > 0) {
          this.port.postMessage({ type: 'chunk', samples: remaining }, [remaining.buffer]);
        }
        this.port.postMessage({ type: 'stopped' });
      }
    };
  }

  _flush() {
    if (this._buffer.length === 0) return new Float32Array(0);
    const combined = new Float32Array(this._collectedSamples);
    let offset = 0;
    for (const chunk of this._buffer) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    this._buffer = [];
    this._collectedSamples = 0;
    return combined;
  }

  process(inputs, _outputs, _parameters) {
    if (this._stopped) return false;
    const channel = inputs[0]?.[0];
    if (channel && channel.length > 0) {
      this._buffer.push(new Float32Array(channel));
      this._collectedSamples += channel.length;
      if (this._collectedSamples >= this._intervalSamples) {
        const batch = this._flush();
        this.port.postMessage({ type: 'chunk', samples: batch }, [batch.buffer]);
      }
    }
    return true;
  }
}

registerProcessor('pcm-recorder-processor', PcmRecorderProcessor);
`;

/**
 * Encode a mono Float32 PCM array as a 16-bit WAV Blob.
 * The resulting Blob can be played back with the Web Audio API or a plain <audio> element.
 */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const write = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  write(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  write(36, "data");
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private allSamples: Float32Array[] = [];
  private totalSamples = 0;
  private startTime: number | null = null;
  public readonly maxDuration: number = 4000; // 4 seconds in milliseconds
  public readonly minDuration: number = 500; // 0.5 seconds minimum
  private autoStopTimer: ReturnType<typeof setTimeout> | null = null;
  private onDataCallback: ((samples: Float32Array) => void) | null = null;
  private _isRecording = false;
  private stopResolve: ((result: { blob: Blob; duration: number }) => void) | null = null;

  /**
   * Start recording audio via AudioWorklet.
   * @param onAutoStop - Callback when max duration is reached
   * @param onDataAvailable - Callback fired each time a batch of raw PCM samples is ready
   * @param streamingIntervalMs - How often (in ms) to fire onDataAvailable (default: 500 ms)
   */
  async start(
    onAutoStop: (() => void) | null = null,
    onDataAvailable: ((samples: Float32Array) => void) | null = null,
    streamingIntervalMs = 500,
  ): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: SAMPLE_RATE,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });

    // Load the worklet processor from an inline Blob URL (bundler-agnostic)
    const processorBlob = new Blob([WORKLET_PROCESSOR_CODE], { type: "application/javascript" });
    const processorUrl = URL.createObjectURL(processorBlob);
    try {
      await this.audioContext.audioWorklet.addModule(processorUrl);
    } finally {
      URL.revokeObjectURL(processorUrl);
    }

    this.workletNode = new AudioWorkletNode(this.audioContext, "pcm-recorder-processor");

    // Tell the worklet how many samples to collect per batch
    const intervalSamples = Math.round((streamingIntervalMs / 1000) * SAMPLE_RATE);
    this.workletNode.port.postMessage({ type: "config", intervalSamples });

    this.allSamples = [];
    this.totalSamples = 0;
    this.startTime = Date.now();
    this.onDataCallback = onDataAvailable;
    this._isRecording = true;

    this.workletNode.port.onmessage = (e: MessageEvent) => {
      if (e.data.type === "chunk") {
        const samples: Float32Array = e.data.samples;
        this.allSamples.push(samples);
        this.totalSamples += samples.length;
        if (this.onDataCallback) {
          this.onDataCallback(samples);
        }
      } else if (e.data.type === "stopped") {
        this._isRecording = false;
        const combined = this._getCombinedSamples();
        const duration = this.startTime ? Date.now() - this.startTime : 0;
        const blob = encodeWav(combined, SAMPLE_RATE);
        this.stopResolve?.({ blob, duration });
        this.stopResolve = null;
        this._cleanup();
      }
    };

    // Connect: mic stream → worklet node
    // Route through a silent gain so the microphone is never heard in speakers
    const source = this.audioContext.createMediaStreamSource(this.stream);
    const silentGain = this.audioContext.createGain();
    silentGain.gain.value = 0;
    source.connect(this.workletNode);
    this.workletNode.connect(silentGain);
    silentGain.connect(this.audioContext.destination);

    // AudioContext may start suspended; resume for the audio graph to process
    await this.audioContext.resume();

    // Auto-stop after max duration
    this.autoStopTimer = setTimeout(() => {
      if (this._isRecording) {
        console.log("Auto-stopping recording after max duration");
        onAutoStop?.();
      }
    }, this.maxDuration);
  }

  private _getCombinedSamples(): Float32Array {
    const combined = new Float32Array(this.totalSamples);
    let offset = 0;
    for (const chunk of this.allSamples) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return combined;
  }

  private _cleanup(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.workletNode = null;
  }

  /**
   * Request microphone permission without starting a recording
   */
  async requestPermission(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: SAMPLE_RATE,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    stream.getTracks().forEach((track) => track.stop());
  }

  /**
   * Stop recording and return a WAV Blob with duration info.
   * The WAV is encoded at 16 kHz mono 16-bit PCM and is directly playable.
   */
  async stop(): Promise<{ blob: Blob; duration: number }> {
    if (!this.workletNode || !this._isRecording) {
      throw new Error("No active recording");
    }

    if (this.autoStopTimer) {
      clearTimeout(this.autoStopTimer);
      this.autoStopTimer = null;
    }

    return new Promise((resolve, _reject) => {
      this.stopResolve = resolve;
      // Stop the mic stream tracks so the OS recording indicator goes away promptly
      if (this.stream) {
        this.stream.getTracks().forEach((t) => t.stop());
        this.stream = null;
      }
      // Signal the worklet to flush remaining samples and send 'stopped'
      const node = this.workletNode;
      if (node) node.port.postMessage({ type: "stop" });
    });
  }

  /**
   * Get recording duration in milliseconds
   */
  getDuration(): number {
    return this.startTime ? Date.now() - this.startTime : 0;
  }

  /**
   * Check if recording duration meets minimum requirement
   */
  meetsMinimumDuration(): boolean {
    return this.getDuration() >= this.minDuration;
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this._isRecording;
  }
}
