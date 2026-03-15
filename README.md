# Phoneme Party: Speaking Clearly should be fun

Use AI models on your local device to analyze your pronunciation.

Currently, focused on German beginners/kids.

Two language settings:

- **ui-lang**: language of the UI (auto-detected from browser, changeable)
- **study-lang**: language being practised (must be chosen explicitly; en-GB or de)

Demo: <https://relaxandplay.de/phoneme-party/>

Build on:

- [ONNX](https://onnx.ai/)
- [ZIPA: A family of efficient speech models for multilingual phone recognition](https://github.com/lingjzhu/zipa)

Github: <https://github.com/guettli/pp>

Built as static web-site. No server required!

First Steps:

- Application has a set of well known phrases and the desired pronounciation.
- User sees a random phrase, and the corresponding picture.
- User records his/her voice.
- The distance between desired and actual phonemes gets shown.

## Goal: Help Children in Developing Countries

My goal is to help children in developing countries to learn reading and speaking.

Currently, learning English and German is worked on.

I was inspired by the book [Moral Ambition](https://www.moralambition.org/book).

## Why British English

Most developing countries in Africa and South Asia use British English in their schools and official
exams. By using en-GB, my web app helps children pass their classes and succeed in the system they
already live in. British spelling and grammar are still seen as the "gold standard" for professional
jobs and higher education in these regions. Choosing this version ensures the web app is a practical
tool for a child's academic and future career growth.

## Technical Architecture

Phoneme Party leverages browser-based AI models to provide real-time pronunciation feedback without
sending data to external servers.

### How It Works

1. **Text to Phonemes (Target)**
   - User inputs a German phrase or sentence
   - A phonetic dictionary or text-to-phoneme model converts the text into the expected phoneme
     sequence
   - For German, this uses IPA (International Phonetic Alphabet) or similar phonetic representation

2. **Audio Recording**
   - User's voice is captured via the browser's Web Audio API

3. **Speech to Phonemes (Actual)**
   - An automatic speech recognition (ASR) model runs locally in the browser
   - The model outputs IPA symbols

4. **Phoneme Comparison**
   - The target phoneme sequence is aligned with the actual phoneme sequence
   - Distance metrics calculate pronunciation accuracy:
     - **Phoneme Error Rate (PER)**: percentage of incorrect phonemes
     - **Edit distance**: insertions, deletions, and substitutions needed
     - **Per-phoneme scoring**: identifies which specific sounds were mispronounced

5. **Visual Feedback**
   - Results displayed in a user-friendly format
   - Color-coded phonemes (green = correct, yellow = close, red = incorrect)
   - Suggestions for improvement on specific sounds

## Development

### Prerequisites

- Node.js (v20+)
- pnpm
- ffmpeg (for audio processing in tests)

### Install Dependencies

```bash
pnpm install
```

### Scripts

```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Run Playwright browser tests
pnpm test
```

See [SCRIPTS.md](SCRIPTS.md) for all available helper scripts.

## Phoneme Extraction Tests

Test IPA extraction on all FLAC files in `tests/data/`:

```bash
./run tsx scripts/test-all-flac.ts          # test all
./run tsx scripts/test-all-flac.ts --update # update YAML files with new IPA
./run tsx scripts/test-all-flac.ts Wasser   # test specific phrase
```

### Test Data Structure

Audio test files are stored in git under `tests/data/`:

```text
tests/data/
├── de-DE/
│   ├── Apfel/
│   │   ├── Apfel-edge-tts-conrad.flac
│   │   └── Apfel-edge-tts-conrad.flac.yaml
│   └── ...
└── en-GB/
    ├── Apple/
    │   ├── Apple-edge-tts-guy.flac
    │   └── Apple-edge-tts-guy.flac.yaml
    └── ...
```

Each phrase can have multiple audio files from different sources. The YAML metadata records the
audio provenance (TTS voice, creation date, format).

## Data size

For a good **offline** experience small data size is important.

Example: [👗](https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/1f457.svg) has size of
~500 Bytes. A jpeg image has usualy a much bigger size.

## Links

### German

IPA API: <https://www.dwds.de/api/ipa/?q=Haus>

List of Words (A1, A2, B1): <https://www.dwds.de/d/api#wb-list-goethe>

## License

MIT License - See [LICENSE](LICENSE) file for details.
