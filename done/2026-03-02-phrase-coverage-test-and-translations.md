# Phrase coverage test and full translations

## Task

For each en-GB phrase and each study language there should be a corresponding phrase. No non-en-GB
phrase should exist without a valid en-GB link. Create a test for this, run it before deploy, then
add missing phrases.

## Summary

### New test: `tests/phrase-coverage.test.js`

- Checks that every non-en-GB phrase has a non-empty `en-GB` field linking to a real en-GB phrase
- Checks that every en-GB phrase has a translation in de-DE, fr-FR, and it-IT
- Added to `unit-test` task in `Taskfile.yml` (runs before deploy)

### New script: `scripts/generate-missing-phrases.py`

- Translates missing phrases using Google Translate (`deep_translator`)
- Generates IPA using `espeak-ng`, stripping embedded language markers (e.g. `(en)`, `(de)`)
- Appends new entries to the corresponding `phrases-*.yaml` file

### Phrases added

- `phrases-de-DE.yaml`: 694 new phrases (648 → 1342)
- `phrases-fr-FR.yaml`: 750 new phrases (591 → 1341)
- `phrases-it-IT.yaml`: 1192 new phrases + 1 manual fix (146 → 1338)

All 1338 en-GB phrases are now translated in all three languages. All IPA strings pass the validity
check (no embedded language markers).
