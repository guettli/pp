# Phoneme Party: Speaking Clearly should be fun

Use AI models on your local device to analyze your pronunciation.

Currently, focused on German beginners/kids.

Demo: <https://thomas-guettler.de/phoneme-party/>

Build on:

* [ONNX](https://onnx.ai/)
* [huggingface/transformers.js: State-of-the-art Machine Learning for the web. Run 🤗 Transformers
  directly in your browser, with no need for a
  server!](https://github.com/huggingface/transformers.js)

Github: <https://github.com/guettli/pp>

Built as static web-site. No server required!

First Steps:

* Application has a set of well known words and the desired pronounciation.
* User sees a random word, and the corresponding picture.
* User records his/her voice.
* The distance between desired and actual phonemes gets shown.

## Technical Architecture

Phoneme Party leverages browser-based AI models to provide real-time pronunciation feedback without
sending data to external servers.

### How It Works

1. **Text to Phonemes (Target)**
   * User inputs a German word or sentence
   * A phonetic dictionary or text-to-phoneme model converts the text into the expected phoneme
     sequence
   * For German, this uses IPA (International Phonetic Alphabet) or similar phonetic representation

2. **Audio Recording**
   * User's voice is captured via the browser's Web Audio API
   * Audio is recorded as PCM data in the browser

3. **Speech to Phonemes (Actual)**
   * The recorded audio is processed using transformers.js
   * An automatic speech recognition (ASR) model (e.g., Wav2Vec2 or Whisper) runs locally in the
     browser
   * The model outputs either:
     * Transcribed text (converted to phonemes)
     * Direct phoneme predictions with forced alignment

4. **Phoneme Comparison**
   * The target phoneme sequence is aligned with the actual phoneme sequence
   * Distance metrics calculate pronunciation accuracy:
     * **Phoneme Error Rate (PER)**: percentage of incorrect phonemes
     * **Edit distance**: insertions, deletions, and substitutions needed
     * **Per-phoneme scoring**: identifies which specific sounds were mispronounced

5. **Visual Feedback**
   * Results displayed in a user-friendly format
   * Color-coded phonemes (green = correct, yellow = close, red = incorrect)
   * Suggestions for improvement on specific sounds

### Key Technologies

* **transformers.js**: Runs Hugging Face transformer models directly in the browser
* **Web Audio API**: Captures and processes audio client-side
* **ONNX Runtime**: Optimized inference for neural networks in JavaScript
* **Phoneme Alignment**: Dynamic time warping or similar algorithms for sequence matching

## Running Tests

### Prerequisites

* Node.js (v18+)
* ffmpeg (for audio processing)
* edge-tts (only needed for generating new TTS audio): `pip install edge-tts`

### Install Dependencies

```bash
pnpm install
```

### Usage

```bash
# Run all tests
node tests/all-words.test.js

# List all available tests
node tests/all-words.test.js --list

# Run a single test
node tests/all-words.test.js Brot

# Run tests matching a pattern (case-insensitive)
node tests/all-words.test.js "Sch*"

# Run only mispronunciation tests
node tests/all-words.test.js "*mispro*"

# Show help
node tests/all-words.test.js --help
```

The test:

* Downloads the ONNX model (cached in `~/.cache/phoneme-party/`)
* Uses pre-generated TTS audio from `tests/data/` (committed to git)
* Only generates new audio via edge-tts if files are missing
* Runs phoneme extraction and compares results

### Test Data Structure

Audio test files are stored in git under `tests/data/`:

```text
tests/data/
├── de/
│   ├── Apfel/
│   │   ├── Apfel-edge-tts-conrad.flac
│   │   └── Apfel-edge-tts-conrad.flac.yaml
│   └── ...
└── en/
    ├── Apple/
    │   ├── Apple-edge-tts-guy.flac
    │   └── Apple-edge-tts-guy.flac.yaml
    └── ...
```

Each word can have multiple audio files from different sources. The YAML metadata records the audio
provenance (TTS voice, creation date, format).

## License

MIT License - See [LICENSE](LICENSE) file for details.
