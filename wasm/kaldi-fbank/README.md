# Kaldi Fbank WASM

WebAssembly compilation of Kaldi's Fbank (filterbank) feature extraction, implemented in Zig and
built with Zig's native build system.

## Goal

Achieve 100% exact feature parity with ZIPA's Python/Lhotse/Kaldi inference pipeline.

## Structure

```text
wasm/kaldi-fbank/
├── fbank-standalone.zig  # Zig implementation (WASM export)
├── build.zig             # Zig build system
├── build.zig.zon         # Zig package manifest
├── index.ts              # TypeScript wrapper (native WebAssembly API)
└── test.ts               # TypeScript test
```

## Dependencies

Zig is installed via Nix (see `flake.nix`). No external Zig packages are needed.

## Build

```bash
cd wasm/kaldi-fbank
zig build
```

Output: `build/kaldi-fbank.wasm` (gitignored via root `.gitignore`)

Build optimisation (Zig 0.15 flag syntax):

```bash
zig build -Drelease=true   # ReleaseFast (default preferred mode)
zig build                  # Debug — useful for error traces
```

## Usage

```typescript
import { extractKaldiFbank } from './index.js';

const audio = new Float32Array([...]); // 16kHz audio
const features = await extractKaldiFbank(audio);
// features: Float32Array with shape (frames, 80)
```

The TypeScript wrapper loads `build/kaldi-fbank.wasm` via the native `WebAssembly` API — no
Emscripten JS glue required.

## Implementation

`fbank-standalone.zig` implements:

- Kaldi's Povey window (periodic Hann with 0.85 power)
- Radix-2 Cooley-Tukey FFT for power-of-2 sizes
- Power spectrum computation
- Torchaudio-compatible mel filterbank (triangular filters, mel-space interpolation)
- Log-mel energy computation with `torch.finfo(float).eps` floor

Exact Kaldi parameters:

- 80 mel bins
- 16 kHz sample rate
- 25 ms frame length (400 samples)
- 10 ms frame shift (160 samples)
- 512-point FFT
- 20 Hz – 7600 Hz frequency range

## Exported WASM symbols

| Symbol          | Description                                         |
| --------------- | --------------------------------------------------- |
| `extract_fbank` | Main feature extraction (returns f32\* to features) |
| `free_features` | Free the buffer returned by `extract_fbank`         |
| `malloc`        | Allocate a buffer in WASM linear memory             |
| `free`          | Free a buffer allocated with `malloc`               |

## Validation

```bash
# Self-test with assertions (no argument):
./run tsx wasm/kaldi-fbank/test.ts

# Inspect any audio file:
./run tsx wasm/kaldi-fbank/test.ts tests/data/de/Ball/Ball-edge-tts-conrad.flac
```

## Success Criteria

- Feature extraction 100% matches Python/Lhotse/Kaldi
- WASM size < 200 KB
- Works in both Node.js and browser
- All test files pass with same or better accuracy
- No regressions from current baseline
