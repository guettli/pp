/**
 * Audio recording using MediaRecorder API
 */

export class AudioRecorder {
  constructor() {
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.startTime = null;
    this.maxDuration = 4000; // 4 seconds in milliseconds
    this.minDuration = 500;  // 0.5 seconds minimum
    this.autoStopTimer = null;
  }

  /**
   * Start recording audio
   * @param {Function} onAutoStop - Callback when max duration is reached
   */
  async start(onAutoStop = null) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    // Use webm format (widely supported)
    const mimeType = MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/mp4';

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
    this.chunks = [];
    this.startTime = Date.now();

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.start();

    // Auto-stop after max duration
    this.autoStopTimer = setTimeout(() => {
      if (this.isRecording()) {
        console.log('Auto-stopping recording after max duration');
        if (onAutoStop) {
          onAutoStop();
        }
      }
    }, this.maxDuration);
  }

  /**
   * Stop recording and return audio blob with duration info
   * @returns {Promise<Object>} Object with blob and duration
   */
  async stop() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No active recording'));
        return;
      }

      // Clear auto-stop timer
      if (this.autoStopTimer) {
        clearTimeout(this.autoStopTimer);
        this.autoStopTimer = null;
      }

      const duration = this.startTime ? Date.now() - this.startTime : 0;

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType });
        this.chunks = [];
        resolve({ blob, duration });
      };

      this.mediaRecorder.onerror = (error) => {
        reject(error);
      };

      this.mediaRecorder.stop();

      // Stop all tracks
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
    });
  }

  /**
   * Get recording duration in milliseconds
   * @returns {number} Duration in ms
   */
  getDuration() {
    return this.startTime ? Date.now() - this.startTime : 0;
  }

  /**
   * Check if recording duration meets minimum requirement
   * @returns {boolean}
   */
  meetsMinimumDuration() {
    return this.getDuration() >= this.minDuration;
  }

  /**
   * Check if currently recording
   * @returns {boolean}
   */
  isRecording() {
    return this.mediaRecorder && this.mediaRecorder.state === 'recording';
  }
}
