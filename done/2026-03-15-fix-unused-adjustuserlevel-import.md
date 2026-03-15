# Fix unused `adjustUserLevel` import

## Task

`src/routes/+page.svelte` imported `adjustUserLevel` from `src/utils/level-adjustment.ts` but the
TypeScript build reported it as unused, blocking `./run scripts/add-test-recording.sh`.

## Summary

On inspection, `adjustUserLevel` was already properly wired into the post-recording flow at line 716
of `src/routes/+page.svelte` — called after scoring to update the user's level in PouchDB. The
TypeScript build (`tsc -p tsconfig.build.json`) passed with no errors. The task was already resolved
in a previous session; this deploy confirms everything is working correctly.
