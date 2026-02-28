import eslint from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import sveltePlugin from "eslint-plugin-svelte";
import * as svelteParser from "svelte-eslint-parser";

const browserGlobals = {
  __BUILD_DATE__: "readonly",
  console: "readonly",
  document: "readonly",
  window: "readonly",
  location: "readonly",
  navigator: "readonly",
  localStorage: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  Blob: "readonly",
  Audio: "readonly",
  AudioContext: "readonly",
  MediaRecorder: "readonly",
  SpeechSynthesisUtterance: "readonly",
  speechSynthesis: "readonly",
  performance: "readonly",
  atob: "readonly",
  Float32Array: "readonly",
  Int8Array: "readonly",
  Uint8Array: "readonly",
  BigInt64Array: "readonly",
  fetch: "readonly",
  indexedDB: "readonly",
  caches: "readonly",
  OfflineAudioContext: "readonly",
  Promise: "readonly",
  IDBDatabase: "readonly",
  Buffer: "readonly",
  crossOriginIsolated: "readonly",
  self: "readonly",
};

const tsRules = {
  ...tseslint.configs.recommended.rules,
  ...tseslint.configs["strict-type-checked"]?.rules,
  "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  "@typescript-eslint/explicit-function-return-type": "off",
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/no-unnecessary-condition": "off",
  "@typescript-eslint/no-confusing-void-expression": "off",
  "@typescript-eslint/restrict-template-expressions": "off",
  "@typescript-eslint/no-floating-promises": "warn",
  "@typescript-eslint/no-misused-promises": "off",
  "@typescript-eslint/require-await": "off",
  "@typescript-eslint/prefer-promise-reject-errors": "off",
  "@typescript-eslint/no-unsafe-assignment": "off",
  "@typescript-eslint/no-unsafe-call": "off",
  "@typescript-eslint/no-unsafe-member-access": "off",
  "@typescript-eslint/no-unsafe-argument": "off",
  "no-unused-vars": "off",
};

export default [
  eslint.configs.recommended,
  // TypeScript source files
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tsconfig.json",
      },
      globals: browserGlobals,
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: tsRules,
  },
  // Svelte files
  ...sveltePlugin.configs["flat/recommended"],
  {
    files: ["src/**/*.svelte"],
    plugins: {
      "@typescript-eslint": tseslint,
      svelte: sveltePlugin,
    },
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsparser,
        project: "./tsconfig.json",
        extraFileExtensions: [".svelte"],
      },
      globals: browserGlobals,
    },
    rules: {
      "svelte/no-at-html-tags": "warn",
      "svelte/no-useless-mustaches": "warn",
      "svelte/prefer-writable-derived": "warn",
      // svelte/prefer-svelte-reactivity triggers false positives for non-reactive
      // local variables (e.g. URLSearchParams/Set used for URL manipulation, not $state)
      "svelte/prefer-svelte-reactivity": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-unused-vars": "off",
    },
  },
  {
    ignores: ["node_modules/**", "dist/**", "tests/**", "*.config.js", ".svelte-kit/**"],
  },
];
