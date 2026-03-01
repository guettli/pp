# Peak normalize audio before inference

## Task

The file `tests/data/en-GB/camera/camera-guettli.flac` was not being detected well because the
recording was too quiet (peak amplitude 0.063, RMS 0.0063).

## Solution

Added peak normalization (scale to 0.9 peak amplitude) before feeding audio to the fbank feature
extractor, in both the Python inference path and the browser audio processor:

- `zipa/inference.py`: normalize after reading/resampling audio
- `src/audio/processor.ts`: normalize after decoding/resampling audio

This ensures that quiet recordings are amplified to a usable level before phoneme extraction, while
loud recordings are scaled down if they exceed 0.9.

## Result

Before normalization: recognized `kæmə` with 0.83 similarity. After normalization: recognized
`kæm˞ə` (correct rhotic vowel for en-GB "camera"). All 7 production tests pass.
