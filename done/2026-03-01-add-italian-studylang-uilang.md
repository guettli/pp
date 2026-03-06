# Add Italian as studyLang and uiLang

## Task

Add Italian (`it-IT`) as both a study language and UI language.

## Summary

- Added `"it-IT"` to `SupportedLanguage` and `StudyLanguage` types in `src/types.ts`
- Created `phrases-it-IT.yaml` with 130+ Italian phrases, words, and sentences with accurate IPA
  transcriptions
- Added Italian translations block to `src/i18n.ts` (all ~110 UI keys translated to Italian)
- Added `"it-IT"` to `SUPPORTED_UI_LANGS` and Italian region auto-detection (`it`, `sm`, `va`)
- Added `"it-IT"` to `SUPPORTED_STUDY_LANGS` in `src/study-lang.ts`
- Updated `src/utils/random.ts` and `src/utils/phrase-xlang.ts` to load and serve Italian phrases
- Added Italian options to both study language and UI language selectors in
  `src/routes/+page.svelte`
- Added `"language.it"` and `"study-lang.it-IT"` translation keys to all existing language tables
  (de-DE, en-GB, fr-FR, it-IT)
- Updated `src/ui/ipa-helper.ts` `LanguageExamples` interface to include `"it-IT"`
- Added `phrases-it-IT.yaml` to `tests/ipa-validity.test.js`
