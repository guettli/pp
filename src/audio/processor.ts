/**
 * Audio preprocessing for Whisper model
 * Whisper expects 16kHz mono audio
 */

/**
 * Convert audio blob to format expected by Whisper
 */
export async function prepareAudioForWhisper(audioBlob: Blob): Promise<Float32Array> {
  // Convert blob to ArrayBuffer
  const arrayBuffer = await audioBlob.arrayBuffer();

  // Create audio context with 16kHz sample rate (Whisper requirement)
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContextClass({
    sampleRate: 16000
  });

  // Decode audio data
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Get mono channel data (Whisper expects mono)
  let audioData: Float32Array = audioBuffer.getChannelData(0);

  // If the audio buffer sample rate is not 16kHz, we need to resample
  if (audioBuffer.sampleRate !== 16000) {
    audioData = await resampleAudio(audioData, audioBuffer.sampleRate, 16000);
  }

  // Close the audio context to free resources
  await audioContext.close();

  return audioData;
}

/**
 * Resample audio to target sample rate
 */
async function resampleAudio(
  audioData: Float32Array,
  originSampleRate: number,
  targetSampleRate: number
): Promise<Float32Array> {
  // Create offline audio context for resampling
  const offlineContext = new OfflineAudioContext(
    1, // mono
    Math.ceil(audioData.length * targetSampleRate / originSampleRate),
    targetSampleRate
  );

  // Create buffer source
  const buffer = offlineContext.createBuffer(1, audioData.length, originSampleRate);
  buffer.copyToChannel(new Float32Array(audioData), 0);

  const source = offlineContext.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineContext.destination);
  source.start();

  // Render the audio
  const resampled = await offlineContext.startRendering();
  return resampled.getChannelData(0);
}
