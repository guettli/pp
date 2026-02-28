# i18n Completeness Test

## Task

Add test which checks that all translations to all uiLangs was done.

Deploy should fail if missing.

## Summary

Created `tests/i18n-completeness.test.js` — a Node.js script that parses `src/i18n.ts`, extracts all
translation keys from each language section (`de`, `en`, `fr`), and verifies every key is present in
every section. Exits with code 1 if any key is missing.

Added `node tests/i18n-completeness.test.js` to the `unit-test` task in `Taskfile.yml`. Since
`unit-test` is a dependency of `check`, which is a dependency of `deploy`, a missing translation key
will now cause `task deploy` to fail.
