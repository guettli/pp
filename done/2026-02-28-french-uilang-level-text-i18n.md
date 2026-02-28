# French UILang Complete — Level Text i18n

## Task

UILang french is not implemented. A lot of translations are missing.

Make french uiLang complete. Then deploy.

## Summary

The `fr` translation table in `src/i18n.ts` already had all 135 keys matching `de` and `en`. The one
gap was `getLevelText()` in `src/types.ts`, which returned hardcoded English strings ("Very Easy",
"Easy", "Medium", "Hard", "Very Hard") for the level difficulty display.

Changes made:

- Added `level.text.very_easy/easy/medium/hard/very_hard` keys to all three language sections (`de`,
  `en`, `fr`) in `src/i18n.ts`.
- Removed `getLevelText` from `src/types.ts`.
- Added a local `getLevelText(level, lang)` in `src/routes/+page.svelte` that calls `t()`, with
  `lang` parameter to trigger Svelte reactivity on uiLang changes.
- Updated both call sites to pass `uiLang` as the second argument.
