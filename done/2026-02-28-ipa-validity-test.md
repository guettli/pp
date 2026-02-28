# IPA Validity Test

## Task

The IPA of "Le ballon de foot" (and several other phrases) contained embedded language
markers such as `(en)` and `(fr)` — artefacts produced by some g2p/TTS tools that tag
foreign-word segments, e.g. `/(en)fˈʊt(fr)/`.

Create an automated test that checks all IPA strings in all phrase YAML files before
deploy, so this cannot happen again.

## What was done

- **`tests/ipa-validity.test.js`** — new unit test that reads `phrases-de-DE.yaml`,
  `phrases-en-GB.yaml`, and `phrases-fr-FR.yaml` and rejects any IPA string containing
  parenthesised language markers (regex `\([a-z]{2}(?:-[A-Z]{2})?\)`).  Exits with
  code 1 on failure so it blocks deploy.

- **`Taskfile.yml`** — added `node tests/ipa-validity.test.js` to the `unit-test` task,
  which is a dependency of `check`, which is a dependency of `deploy`.

- **Fixed 15 invalid IPA entries** across `phrases-de-DE.yaml` (4) and
  `phrases-fr-FR.yaml` (11) by stripping the language markers while preserving the
  phonetic content.
