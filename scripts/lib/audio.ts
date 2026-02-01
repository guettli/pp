import { execSync } from 'child_process';

/**
 * Read audio file using ffmpeg and convert to Float32Array at 16kHz mono
 */
export function readAudioFile(filePath: string): Float32Array {
    const result = execSync(
        `ffmpeg -i "${filePath}" -f s16le -acodec pcm_s16le -ar 16000 -ac 1 - 2>/dev/null`,
        { maxBuffer: 50 * 1024 * 1024 }
    );
    const samples = new Float32Array(result.length / 2);
    for (let i = 0; i < samples.length; i++) {
        samples[i] = result.readInt16LE(i * 2) / 32768.0;
    }
    return samples;
}
