# Agent Ideas

Things an AI agent could usefully work on next, roughly ordered by impact vs effort.

---

## 2. Reduce deploy output — show only summary + timing

`./run task deploy` prints thousands of rsync lines. The user has noted this multiple times in
LATER.md. Two concrete improvements:

- Pipe rsync to a temp file; print only the final stats block (`sent … bytes … speedup …`).
- Add per-task timing already captured (lint: 9s, typecheck: 5s, …) to a short summary at the end.

The `START=$(date +%s) … echo "task: ${s}s"` pattern is already in Taskfile.yml — just suppress the
verbose output in between.

---

## 3. Deduplicate shared test helpers

`jscpd` found 51 clone pairs. The highest-value ones to extract:

- **Streaming test setup** (`streaming-timing-bug`, `streaming-chunk-decode-bug`,
  `no-chunk-decode-error` all duplicate a ~21-line block): extract to
  `tests/helpers/streaming-setup.js`.
- **`pouchdb-error` vs `prod-pouchdb-error`**: 10-line duplicated wait/assert block — extract to
  `tests/helpers/pouchdb-wait.js`.
- **`src/lib/phoneme-model.ts` vs `src/speech/phoneme-extractor.ts`**: 15 lines of post-processing
  logic duplicated — extract to `src/speech/phoneme-postprocess.ts`.
- **`scripts/lib/phrase-audio-utils.ts` vs `src/speech/phrase-audio.ts`**: MD5 + path construction
  duplicated — share via a common module.

---

## 4. Integrate code-duplication check into lint

`scripts/test-code-duplication.sh` exists but is not called from `scripts/lint.sh`. One line to add.
The threshold is already set (3%) and currently passing (2.92%).

---

## 5. Suppress excessive audio-rate log lines

`src/speech/` logs `[audio-diag] ctx rate: 16000 buf rate: 16000 …` on every normal frame. LATER.md:
"Don't log when rate is as expected." Guard it:

```ts
if (ctxRate !== expectedRate || bufRate !== expectedRate) {
  console.log("[audio-diag] ...");
}
```

---

## 7. Flags in language dropdowns

LATER.md: "Show corresponding flag before Language in dropdown." Add a `FLAG` map (`de-DE → 🇩🇪`,
`en-GB → 🇬🇧`, `fr-FR → 🇫🇷`, `it-IT → 🇮🇹`, `es-ES → 🇪🇸`) and prepend the emoji in the `<option>` text
for both uiLang and studyLang selectors.

---

## 8. Warn when recording audio is too quiet

LATER.md: "When audio was not loud enough, show a warning. Show a scale 0..100%." The RMS is already
computed in the audio pipeline. After recording ends, if peak RMS is below a threshold, show a
Bootstrap alert with a percentage bar. No model changes needed.

---

## 9. Stale software banner

LATER.md: "When user runs old software, a red banner should be visible to reload." Expose a build
timestamp (already in the Vite build) via a small API endpoint or a static `version.json`. On page
load, fetch it and compare with `import.meta.env.BUILD_TIME`. If stale (> N hours), show a
dismissable banner: "A new version is available — click to reload."

---

## 11. Partition tests: model-dependent vs. model-independent

LATER.md: "Run model-tests (playwright) only if related code has changed."

- Move model-free tests (navigation, catch-it-slider, pouchdb-error, feedback-form, history,
  phoneme-word-boundaries) into `tests/fast/`.
- Keep model-required tests (phoneme-extraction, streaming-\*, regenbogen, der-hund, …) in
  `tests/model/`.
- Add two Playwright projects in `playwright.config.js`: `fast` (no `@slow` filter needed) and
  `model` (only run when `src/speech/**` or `wasm/**` changed).

---

## 12. Remove or fix `adjustUserLevel` / `phraseLevel`

Related to idea #1 but broader: `src/utils/level-adjustment.ts` has `phraseLevel` as a parameter
that is declared but never used (TS error). Either:

- Complete the spaced-repetition difficulty integration (use `phraseLevel` in the priority formula),
  or
- Remove the parameter and the unused import.

---

## 13. `i18n.ts` dead-key checker

LATER.md: "Check for dead entries. Check if there are missing entries." A small script that:

1. Greps all `_t("some.key")` calls in source files.
2. Compares against keys in `src/i18n.ts`.
3. Reports keys defined but never used, and call-sites referencing unknown keys.

The i18n completeness test already checks all languages have the same keys — this would add the "are
any keys actually used?" dimension.
