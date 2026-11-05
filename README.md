# Phoneme Party: Speaking Clearly should be fun

Use AI models on your local device to analyze your pronunciation.

Focused on beginners and kids. Five study languages: German (de-DE), British English (en-GB), French
(fr-FR), Italian (it-IT) and Spanish (es-ES), with 816 phrases each.

Two language settings:

- **ui-lang**: language of the UI (auto-detected from browser, changeable; de-DE, en-GB, fr-FR,
  it-IT or es-ES)
- **study-lang**: language being practised (must be chosen explicitly; de-DE, en-GB, fr-FR, it-IT or
  es-ES)

Live: <https://relaxandplay.de/phoneme-party/>

Build on:

- [ONNX](https://onnx.ai/)
- [ZIPA: A family of efficient speech models for multilingual phone recognition](https://github.com/lingjzhu/zipa)

Github: <https://github.com/guettli/pp>

Speech recognition runs in the browser. The recording never leaves the device, unless the user sends
it with the feedback form.

How it works for the user:

- The application has a set of well known phrases and their desired pronunciation.
- The user sees a phrase and the corresponding picture (emoji), and can listen to it.
- The user records their voice.
- The distance between desired and actual phonemes gets shown.

## Goal: Help Children in Developing Countries

My goal is to help children in developing countries to learn reading and speaking.

Currently, learning English, German, French, Italian and Spanish is worked on.

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
   - Each phrase in `phrases-{lang}.yaml` carries its expected pronunciation in IPA (International
     Phonetic Alphabet), generated ahead of time (see [SCRIPTS.md](SCRIPTS.md))

2. **Audio Recording**
   - User's voice is captured via the browser's Web Audio API
   - Example audio for every phrase (two voices per language) is pre-generated with edge-tts

3. **Speech to Phonemes (Actual)**
   - The [ZIPA](https://github.com/lingjzhu/zipa) model (ONNX, int8) runs locally in the browser via
     onnxruntime-web, in a Web Worker
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

## Deployment

The app is a SvelteKit application built with adapter-node. The Node server serves the pages, the
static assets and the phrase audio, and stores the feedback sent via the feedback form
(`/api/feedback`).

It runs in the k3s cluster on the host `vps`, deployed via GitOps:

1. A push to `main` runs [.github/workflows/publish-image.yml](.github/workflows/publish-image.yml).
   It builds the WASM, the PanPhon data, the phrase JSON and the phrase audio, builds the server
   bundle, smoke-tests it and pushes `ghcr.io/guettli/pp:v<YYYY.MM.DD.HHMMSS>`.
2. Renovate in [guettli/gitops](https://github.com/guettli/gitops) opens and auto-merges the PR that
   bumps the image tag in `k8s/plain/vps/pp/`.
3. Flux applies the new Deployment.

The phrase audio is not in git. Each image build copies it from the previous image and generates
only the missing files with edge-tts.

Smoke-test the live site with:

```bash
pnpm playwright test --project=prod
```

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
