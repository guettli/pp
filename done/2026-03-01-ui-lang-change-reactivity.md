# uiLang Change Reactivity Fix

## Task

Changing the uiLang dropdown appeared broken: template text (labels, buttons, etc.) did not update
after switching the interface language.

## Root Cause

In Svelte 5, template expressions like `{t("study-lang.label")}` are only re-evaluated when a
reactive `$state` dependency changes. The `t()` function reads from `currentUiLang`, a plain
module-level variable in `i18n.ts`. Svelte has no way to track plain module variables, so
`{t("key")}` expressions were never re-evaluated after a language switch.

The `applyTranslations()` function (which updates `data-i18n` DOM nodes) was called on language
change, but the Svelte-rendered template expressions remained stale.

## Fix

Added a local reactive wrapper in `+page.svelte` that shadows the imported `t`:

```ts
function t(key: string, vars: Record<string, string | number> = {}): string {
  void uiLang; // reading the $state uiLang creates a reactive dependency
  return _t(key, vars);
}
```

When `uiLang` changes (via `onUiLangChange`), all `{t("key")}` expressions in the template
automatically re-evaluate because Svelte 5 now tracks `uiLang` as a dependency.

## Test

Added `tests/ui-lang-change.spec.js` which:

- Switches UI language to English, German, and French
- Asserts the `study-lang-select` label text updates each time
- Was confirmed to fail before the fix and pass after
