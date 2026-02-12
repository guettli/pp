# Project Guidelines for Claude

## Running Scripts

Execute all scripts via `./run cmd arg1 arg2 ...`. Example:

```console
./run tsx scripts/update-ipa.ts phrases-de.yaml
```

`./run` ensures the environment is set up.

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
