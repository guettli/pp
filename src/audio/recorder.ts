/**
 * Audio recording using MediaRecorder API
 */

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startTime: number | null = null;
  public readonly maxDuration: number = 4000; // 4 seconds in milliseconds
  public readonly minDuration: number = 500; // 0.5 seconds minimum
  private autoStopTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Start recording audio
   */
  async start(onAutoStop: (() => void) | null = null): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    // Use webm format (widely supported)
    const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
    this.chunks = [];
    this.startTime = Date.now();

    this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.start();

    // Auto-stop after max duration
    this.autoStopTimer = setTimeout(() => {
      if (this.isRecording()) {
        console.log("Auto-stopping recording after max duration");
        if (onAutoStop) {
          onAutoStop();
        }
      }
    }, this.maxDuration);
  }

  /**
   * Request microphone permission without starting a recording
   */
  async requestPermission(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    stream.getTracks().forEach((track) => track.stop());
  }

  /**
   * Stop recording and return audio blob with duration info
   */
  async stop(): Promise<{ blob: Blob; duration: number }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error("No active recording"));
        return;
      }

      // Clear auto-stop timer
      if (this.autoStopTimer) {
        clearTimeout(this.autoStopTimer);
        this.autoStopTimer = null;
      }

      const duration = this.startTime ? Date.now() - this.startTime : 0;
      const recorder = this.mediaRecorder;

      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: recorder.mimeType });
        this.chunks = [];
        resolve({ blob, duration });
      };

      recorder.onerror = (event) => {
        reject(event);
      };

      recorder.stop();

      // Stop all tracks
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
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
    return this.mediaRecorder !== null && this.mediaRecorder.state === "recording";
  }
}
