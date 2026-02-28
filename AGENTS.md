# Project Guidelines for AI Agents

## Language Terminology

- **ui-lang**: language of the UI (`"de-DE"` | `"en-GB"` | `"fr-FR"`). Auto-detected from browser;
  user can override.
- **study-lang**: language being practised (`"de-DE"` | `"en-GB"` | `"fr-FR"`). Must be set
  explicitly; no default.

Never name a variable or function "lang" or "language". Use uiLang/studyLang or ui_lang/study_lang.

## English: en-GB, not en-US

Use en-GB only. en-US is not supported.

## No fall-backs

I prefer explicit code. Avoid things like `getStudyLang() ?? "de-DE"`.

## Running Scripts

Execute all scripts via `./run cmd arg1 arg2 ...`. Example:

```console
./run tsx scripts/update-ipa.ts phrases-de-DE.yaml
```

See directory `scripts` for existing CLI scripts. Use `./run scripts/...` to ensure the environment
is set up.

## Deploy

Deploy via:

```sh
./run task deploy
```

## Deploy instead of `pnpm check`

When the agent has done his work, run:

```sh
./run task deploy
```

This runs check and deploys to a demo page.

## Branches

Use git branch `testing`.

Never use the `main` branch.

## Taskfile

To see availale tasks:

```sh
❯ ./run task --list
```

## Performance Guidelines

When running scripts:

1. Run ONCE and save output to `/tmp/script-output-$$.txt`
2. Then analyze the tempfile with grep/tail/head as needed
3. Don't re-run the same command multiple times with different pipes

## Dependencies

- pnpm for JS/TS
- pyproject.toml for Python
- flake.nix for system stuff.

## Code Quality

Before considering any task complete, run `./run pnpm check` to autoformat, lint and run tests. Fix
any errors found by the script.

## Code Duplication

Before writing new functions, search for existing implementations that could be reused or extended.
If similar logic exists in multiple places (e.g., browser vs Node.js versions), extract shared code
into a common module.

## Testing

Node.js test files in `tests/` may need separate loaders for browser-only APIs (like JSON imports
via Vite). Use dependency injection or factory patterns to share logic while allowing different data
loading strategies.

## Local Caching

For local caches (like downloaded model, wiktionary, ...) use ~/.cache/phoneme-party.

Example for Node.js:

```ts
const XDG_CACHE_HOME = process.env.XDG_CACHE_HOME || path.join(process.env.HOME, ".cache");
const CACHE_DIR = path.join(XDG_CACHE_HOME, "phoneme-party");
```
