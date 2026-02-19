import { execSync } from "child_process";

/**
 * Read audio file using ffmpeg and convert to Float32Array at 16kHz mono.
 * Uses f32le (native float32) output to preserve full bit depth of
 * 24-bit/32-bit sources without quantization to 16-bit.
 */
export function readAudioFile(filePath: string): Float32Array {
  const result = execSync(`ffmpeg -i "${filePath}" -f f32le -ar 16000 -ac 1 - 2>/dev/null`, {
    maxBuffer: 50 * 1024 * 1024,
  });
  // f32le output is already IEEE 754 float32, copy directly
  return new Float32Array(result.buffer, result.byteOffset, result.length / 4);
}
