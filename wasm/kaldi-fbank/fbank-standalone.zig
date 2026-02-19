// Standalone Kaldi Fbank implementation for WASM
// Matches Lhotse's Wav2LogFilterBank with torchaudio_compatible_mel_scale=True
// (which is the default used by ZIPA's Python inference)
//
// Processing pipeline (per Lhotse source):
//   1. Reflect-pad audio (npad_left = (frame_length - frame_shift) / 2)
//   2. Extract frames at stride=frame_shift
//   3. DC offset removal (subtract frame mean)
//   4. Pre-emphasis per frame (replicate padding: first sample * (1 - coeff))
//   5. Povey window
//   6. Zero-pad to FFT size
//   7. Power spectrum
//   8. Torchaudio-compatible mel filterbank (mel-space interpolation)
//   9. Log with energy_floor=1e-10
//
// License: Apache 2.0 (matching Kaldi/Lhotse)

const std = @import("std");

const M_PI: f32 = 3.14159265358979323846;
// Lhotse uses torch.finfo(torch.float).eps for the mel filterbank floor
const MEL_FLOOR: f32 = 1.1920929e-07;

// Global page allocator for WASM linear memory
const page_alloc = std.heap.page_allocator;

// ---------------------------------------------------------------------------
// Exported C API (called from JavaScript)
// ---------------------------------------------------------------------------

/// malloc/free for JS to allocate buffers in WASM linear memory.
/// Uses a size-tagged layout: [ size:usize (8 bytes) | user_data... ]
/// so that free() can reconstruct the full slice.
export fn malloc(size: usize) ?[*]u8 {
    const mem = page_alloc.alloc(u8, size + 8) catch return null;
    @as(*usize, @ptrCast(@alignCast(mem.ptr))).* = size;
    return @ptrCast(mem.ptr + 8);
}

export fn free(ptr: ?[*]u8) void {
    const p = ptr orelse return;
    const base: [*]u8 = p - 8;
    const size = @as(*const usize, @ptrCast(@alignCast(base))).*;
    page_alloc.free(base[0 .. size + 8]);
}

/// Extract Kaldi Fbank features from raw audio.
/// Returns pointer to (num_frames * 80) f32 values, or null on failure.
/// The returned buffer has an 8-byte size header so free_features() can free it.
export fn extract_fbank(
    audio: [*]const f32,
    num_samples: i32,
    out_num_frames: *i32,
) ?[*]f32 {
    return extractFbankImpl(audio, @intCast(num_samples), out_num_frames) catch null;
}

export fn free_features(ptr: [*]f32) void {
    const base: [*]u8 = @as([*]u8, @ptrCast(ptr)) - 8;
    const count = @as(*const usize, @ptrCast(@alignCast(base))).*;
    page_alloc.free(base[0 .. count * @sizeOf(f32) + 8]);
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

fn extractFbankImpl(
    audio: [*]const f32,
    num_samples: usize,
    out_num_frames: *i32,
) !?[*]f32 {
    // Parameters matching Lhotse defaults
    const sample_rate: usize = 16000;
    const frame_length: usize = 400; // 25ms at 16kHz
    const frame_shift: usize = 160; // 10ms at 16kHz
    const fft_size: usize = 512; // next power of 2 >= 400
    const num_mel_bins: usize = 80;
    const low_freq: f32 = 20.0;
    const high_freq: f32 = -400.0; // 7600 Hz (8000 - 400)
    const preemph_coeff: f32 = 0.97;
    const remove_dc = true;

    // ── 1. Reflect-pad the audio ──────────────────────────────────────────
    // npad_left = (frame_length - frame_shift) / 2 = (400 - 160) / 2 = 120
    const npad_left: usize = (frame_length - frame_shift) / 2;
    const num_frames: usize = (num_samples + frame_shift / 2) / frame_shift;
    const new_num_samples: usize = (num_frames - 1) * frame_shift + frame_length;
    const npad_right: usize = if (new_num_samples > num_samples + npad_left)
        new_num_samples - num_samples - npad_left
    else
        0;

    const total_samples = num_samples + npad_left + npad_right;
    const padded = try page_alloc.alloc(f32, total_samples);
    defer page_alloc.free(padded);

    // Left reflection: reversed first npad_left samples
    for (0..npad_left) |i| {
        const src = if (npad_left - 1 - i >= num_samples) num_samples - 1 else npad_left - 1 - i;
        padded[i] = audio[src];
    }
    // Original audio
    for (0..num_samples) |i| {
        padded[npad_left + i] = audio[i];
    }
    // Right reflection: reversed last npad_right samples
    for (0..npad_right) |i| {
        const src: usize = if (i + 1 > num_samples) 0 else num_samples - 1 - i;
        padded[npad_left + num_samples + i] = audio[src];
    }

    out_num_frames.* = @intCast(num_frames);
    if (num_frames == 0) return null;

    // ── 2. Build mel filterbank once ──────────────────────────────────────
    const filters = try buildMelFilterbank(
        num_mel_bins,
        fft_size,
        @floatFromInt(sample_rate),
        low_freq,
        high_freq,
    );
    defer page_alloc.free(filters);

    // ── 3. Build Povey window ─────────────────────────────────────────────
    const window = try computePoveyWindow(frame_length);
    defer page_alloc.free(window);

    // ── 4. Allocate output with size header (for free_features) ──────────
    const feature_count = num_frames * num_mel_bins;
    const feature_mem = try page_alloc.alloc(u8, feature_count * @sizeOf(f32) + 8);
    @as(*usize, @ptrCast(@alignCast(feature_mem.ptr))).* = feature_count;
    const features: []f32 = @as([*]f32, @ptrCast(@alignCast(feature_mem.ptr + 8)))[0..feature_count];

    // Temporary buffers reused each frame
    const frame = try page_alloc.alloc(f32, frame_length);
    defer page_alloc.free(frame);
    const fft_buf = try page_alloc.alloc(f32, fft_size);
    defer page_alloc.free(fft_buf);
    const imag = try page_alloc.alloc(f32, fft_size);
    defer page_alloc.free(imag);
    const power_spec = try page_alloc.alloc(f32, fft_size / 2 + 1);
    defer page_alloc.free(power_spec);
    const mel_energies = try page_alloc.alloc(f32, num_mel_bins);
    defer page_alloc.free(mel_energies);

    for (0..num_frames) |t| {
        const start = t * frame_shift;

        // Extract raw frame
        for (0..frame_length) |i| {
            const idx = start + i;
            frame[i] = if (idx < total_samples) padded[idx] else 0.0;
        }

        // ── a. DC offset removal (subtract frame mean) ────────────────────
        if (remove_dc) {
            var mu: f32 = 0.0;
            for (frame) |s| mu += s;
            mu /= @floatFromInt(frame_length);
            for (frame) |*s| s.* -= mu;
        }

        // ── b. Pre-emphasis per frame (replicate padding) ─────────────────
        // y[0] = x[0] * (1 - coeff),  y[i] = x[i] - coeff * x[i-1]
        {
            var i: usize = frame_length - 1;
            while (i > 0) : (i -= 1) {
                frame[i] -= preemph_coeff * frame[i - 1];
            }
            frame[0] *= 1.0 - preemph_coeff;
        }

        // ── c. Povey window ───────────────────────────────────────────────
        for (0..frame_length) |i| {
            frame[i] *= window[i];
        }

        // ── d. Zero-pad to FFT size ───────────────────────────────────────
        @memcpy(fft_buf[0..frame_length], frame);
        @memset(fft_buf[frame_length..], @as(f32, 0.0));

        // ── e. In-place FFT + power spectrum ──────────────────────────────
        @memset(imag, @as(f32, 0.0));
        fft(fft_buf, imag);
        for (0..fft_size / 2 + 1) |k| {
            power_spec[k] = fft_buf[k] * fft_buf[k] + imag[k] * imag[k];
        }

        // ── f. Mel filterbank ─────────────────────────────────────────────
        @memset(mel_energies, @as(f32, 0.0));
        for (0..power_spec.len) |j| {
            const row = j * num_mel_bins;
            if (row >= filters.len) break;
            for (0..num_mel_bins) |i| {
                mel_energies[i] += filters[row + i] * power_spec[j];
            }
        }

        // ── g. Log with float32 epsilon floor (matches Lhotse's self._eps) ──
        for (0..num_mel_bins) |i| {
            features[t * num_mel_bins + i] = @log(@max(mel_energies[i], MEL_FLOOR));
        }
    }

    return features.ptr;
}

// Lhotse's Povey window: torch.hann_window(N, periodic=False).pow(0.85)
// = (0.5 - 0.5 * cos(2*pi*i / (N-1))) ^ 0.85
fn computePoveyWindow(window_size: usize) ![]f32 {
    const window = try page_alloc.alloc(f32, window_size);
    const a: f32 = 2.0 * M_PI / @as(f32, @floatFromInt(window_size - 1));
    for (0..window_size) |i| {
        const hann = 0.5 - 0.5 * @cos(a * @as(f32, @floatFromInt(i)));
        window[i] = std.math.pow(f32, hann, 0.85);
    }
    return window;
}

// Cooley-Tukey FFT (radix-2, in-place, decimation-in-time)
fn fft(real: []f32, imag: []f32) void {
    const N = real.len;

    // Bit-reversal permutation
    var j: usize = 0;
    var i: usize = 0;
    while (i < N - 1) : (i += 1) {
        if (i < j) {
            std.mem.swap(f32, &real[i], &real[j]);
            std.mem.swap(f32, &imag[i], &imag[j]);
        }
        var k: usize = N / 2;
        while (k <= j) {
            j -= k;
            k /= 2;
        }
        j += k;
    }

    // FFT computation
    var len: usize = 2;
    while (len <= N) : (len *= 2) {
        const angle = -2.0 * M_PI / @as(f32, @floatFromInt(len));
        const wlen_r = @cos(angle);
        const wlen_i = @sin(angle);

        i = 0;
        while (i < N) : (i += len) {
            var w_r: f32 = 1.0;
            var w_i: f32 = 0.0;
            for (0..len / 2) |jj| {
                const u_r = real[i + jj];
                const u_i = imag[i + jj];
                const v_r = real[i + jj + len / 2];
                const v_i = imag[i + jj + len / 2];

                const t_r = w_r * v_r - w_i * v_i;
                const t_i = w_r * v_i + w_i * v_r;

                real[i + jj] = u_r + t_r;
                imag[i + jj] = u_i + t_i;
                real[i + jj + len / 2] = u_r - t_r;
                imag[i + jj + len / 2] = u_i - t_i;

                const w_r_next = w_r * wlen_r - w_i * wlen_i;
                w_i = w_r * wlen_i + w_i * wlen_r;
                w_r = w_r_next;
            }
        }
    }
}

fn lin2mel(hz: f64) f64 {
    return 1127.0 * @log(1.0 + hz / 700.0);
}

/// Build torchaudio-compatible mel filterbank matrix.
/// Returns flat array: filters[fft_bin * num_bins + mel_bin]
/// shape = (fft_size/2+1, num_mel_bins); Nyquist bin always has weight 0.
fn buildMelFilterbank(
    num_bins: usize,
    fft_size: usize,
    sample_rate: f32,
    low_freq: f32,
    high_freq_in: f32,
) ![]f32 {
    const nyquist = sample_rate / 2.0;
    const high_freq = if (high_freq_in <= 0.0) nyquist + high_freq_in else high_freq_in;

    const fft_bin_width: f64 = @as(f64, @floatCast(sample_rate)) / @as(f64, @floatFromInt(fft_size));
    const mel_low = lin2mel(@floatCast(low_freq));
    const mel_high = lin2mel(@floatCast(high_freq));
    const mel_freq_delta = (mel_high - mel_low) / @as(f64, @floatFromInt(num_bins + 1));

    const num_fft_bins = fft_size / 2;
    const total_bins = fft_size / 2 + 1;

    const filters = try page_alloc.alloc(f32, total_bins * num_bins);
    @memset(filters, @as(f32, 0.0));

    const mel_of_bin = try page_alloc.alloc(f64, num_fft_bins);
    defer page_alloc.free(mel_of_bin);
    for (0..num_fft_bins) |j| {
        mel_of_bin[j] = lin2mel(fft_bin_width * @as(f64, @floatFromInt(j)));
    }

    for (0..num_bins) |i| {
        const left_mel = mel_low + @as(f64, @floatFromInt(i)) * mel_freq_delta;
        const center_mel = mel_low + @as(f64, @floatFromInt(i + 1)) * mel_freq_delta;
        const right_mel = mel_low + @as(f64, @floatFromInt(i + 2)) * mel_freq_delta;

        for (0..num_fft_bins) |j| {
            const mel_j = mel_of_bin[j];
            const up_slope = (mel_j - left_mel) / (center_mel - left_mel);
            const down_slope = (right_mel - mel_j) / (right_mel - center_mel);
            const w = @max(@as(f64, 0.0), @min(up_slope, down_slope));
            filters[j * num_bins + i] = @floatCast(w);
        }
        // filters[num_fft_bins * num_bins + i] = 0 (Nyquist bin, already zero)
    }

    return filters;
}
