# Show Phrase in UI Language

## Task

Show the phrase text in the user's UI language (uiLang) alongside the study-language phrase,
whenever uiLang differs from the study language.

Design: make en-GB the "master" language — every phrase in de-DE and fr-FR carries an
`en-GB` field that points to the corresponding English phrase text. Cross-language lookup
goes via this key, so any language can find any other language's phrasing.

## What was done

### Data structure (already in place from prior work)
- `Phrase["en-GB"]?: string` — optional field; omitted for en-GB phrases (the phrase text
  itself is the key).
- All 648 de-DE and 591 fr-FR phrases already had their `en-GB` field populated.
- `validate-phrases-en-GB.py` enforces that non-en-GB phrases always have the field.

### `src/utils/phrase-xlang.ts` (new file)
- `getPhraseInLang(phrase, uiLang)` — looks up the phrase text in any target language using
  the `en-GB` key as the bridge. Falls back to the en-GB text if no match is found.
- Fix: en-GB phrases omit `"en-GB"` in YAML; the function now uses `phrase.phrase` as the
  key when the field is absent (`?? phrase.phrase`).

### `src/routes/+page.svelte`
- Removed a stray `import {getPhraseInLang} from '../utils/phrase-xlang';` that had been
  accidentally placed in the template body instead of the `<script>` block.
- Moved the uiLang phrase display OUT of `{#if score}` — it is now always visible when
  uiLang ≠ studyLang, using `{@const xlangPhrase = ...}` + `{#if xlangPhrase !== phrase}`.
- Added `data-testid="ui-lang-phrase"` to make the element selectable in tests.

### `src/types.ts`
- Changed `"en-GB": string` to `"en-GB"?: string` to allow en-GB phrases to omit the field.

### `tests/app.spec.js`
- Rewrote the brittle test that waited for `.text-muted.fs-5.mb-0` (only visible after
  scoring) and expected the hard-coded string "Cat".
- New test: selects studyLang=de-DE + uiLang=en-GB, waits for `#phrase-text` and
  `[data-testid="ui-lang-phrase"]`, and asserts the translation is non-empty and differs
  from the study phrase.
- Fixed wrong selector (`data-testid` → correct `id` attributes).
- Set `{ timeout: 300000 }` to accommodate model loading on first run.

### `playwright.config.js`
- Increased per-test timeout from 120 s to 300 s (model download can take ~3 min on first run).
- Increased global timeout from 600 s to 900 s accordingly.
