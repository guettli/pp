# Phoneme Party: Speaking Clearly should be fun

Use AI models on your local device to analyze your pronunciation.

Currently, focused on German beginners/kids.

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

## License

MIT License - See [LICENSE](LICENSE) file for details.
