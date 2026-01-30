// src/speech/mel-js.js
// Pure JS log-mel spectrogram extraction (no dependencies)
// Based on standard DSP algorithms (FFT, mel filterbank)

// Hanning window
function hann(N) {
    const win = new Float32Array(N);
    for (let n = 0; n < N; n++) {
        win[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
    }
    return win;
}

// FFT using existing browser API (if available) or fallback to naive DFT
function fftReal(input) {
    // Use browser FFT if available (e.g., in AudioContext)
    // Otherwise, use a simple DFT (slow for large N)
    const N = input.length;
    const re = new Float32Array(N / 2 + 1);
    const im = new Float32Array(N / 2 + 1);
    for (let k = 0; k <= N / 2; k++) {
        let sumRe = 0, sumIm = 0;
        for (let n = 0; n < N; n++) {
            const angle = (2 * Math.PI * k * n) / N;
            sumRe += input[n] * Math.cos(angle);
            sumIm -= input[n] * Math.sin(angle);
        }
        re[k] = sumRe;
        im[k] = sumIm;
    }
    return { re, im };
}

// Mel filterbank
function melFilterbank({
    sampleRate = 16000,
    nFft = 512,
    nMels = 80,
    fMin = 0,
    fMax = 8000,
}) {
    // Helper to convert Hz <-> mel
    const hzToMel = hz => 2595 * Math.log10(1 + hz / 700);
    const melToHz = mel => 700 * (10 ** (mel / 2595) - 1);
    const melMin = hzToMel(fMin);
    const melMax = hzToMel(fMax);
    const melPoints = new Float32Array(nMels + 2);
    for (let i = 0; i < nMels + 2; i++) {
        melPoints[i] = melMin + (i * (melMax - melMin)) / (nMels + 1);
    }
    const hzPoints = Array.from(melPoints, melToHz);
    const bin = hzPoints.map(hz => Math.floor((nFft + 1) * hz / sampleRate));
    const fb = [];
    for (let m = 1; m <= nMels; m++) {
        const f = new Float32Array(nFft / 2 + 1);
        for (let k = 0; k <= nFft / 2; k++) {
            if (k < bin[m - 1]) continue;
            if (k > bin[m + 1]) break;
            if (k < bin[m]) {
                // Avoid division by zero when bins are equal
                const denom = bin[m] - bin[m - 1];
                f[k] = denom > 0 ? (k - bin[m - 1]) / denom : 0;
            } else {
                // Avoid division by zero when bins are equal
                const denom = bin[m + 1] - bin[m];
                f[k] = denom > 0 ? (bin[m + 1] - k) / denom : 0;
            }
        }
        fb.push(f);
    }
    return fb;
}

/**
 * Extract log-mel spectrogram features from audio (pure JS, no dependencies)
 * @param {Float32Array} audioData - Audio samples (mono, 16kHz)
 * @param {number} melBands - Number of mel bands (default 80)
 * @param {number} hopSize - Hop size in samples (default 160)
 * @param {number} winSize - Window size in samples (default 512)
 * @returns {Float32Array} Features as [frames, melBands]
 */
export function extractLogMelJS(audioData, melBands = 80, hopSize = 160, winSize = 512) {
    const sampleRate = 16000;
    const nFft = winSize;
    const window = hann(winSize);
    const fb = melFilterbank({ sampleRate, nFft, nMels: melBands, fMin: 0, fMax: sampleRate / 2 });
    const frames = [];
    for (let i = 0; i + winSize <= audioData.length; i += hopSize) {
        const frame = audioData.slice(i, i + winSize);
        // Apply window
        for (let j = 0; j < winSize; j++) frame[j] *= window[j];
        // Zero pad if needed
        const padded = new Float32Array(nFft);
        padded.set(frame);
        // FFT
        const { re, im } = fftReal(padded);
        // Power spectrum
        const power = new Float32Array(nFft / 2 + 1);
        for (let k = 0; k <= nFft / 2; k++) {
            power[k] = re[k] * re[k] + im[k] * im[k];
        }
        // Mel filterbank
        const mel = new Float32Array(melBands);
        for (let m = 0; m < melBands; m++) {
            let sum = 0;
            for (let k = 0; k <= nFft / 2; k++) {
                sum += fb[m][k] * power[k];
            }
            mel[m] = Math.log(sum + 1e-6);
        }
        frames.push(...mel);
    }
    return new Float32Array(frames);
}
