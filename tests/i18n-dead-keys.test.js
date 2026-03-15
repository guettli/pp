/**
 * Checks that all i18n keys defined in src/i18n.ts are actually used somewhere in src/,
 * and that every t("key") call-site references a key that exists.
 *
 * Run with: node tests/i18n-dead-keys.test.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const I18N_PATH = path.join(ROOT, "src/i18n.ts");

/**
 * Extract all translation key names from one language block in i18n.ts.
 * Keys look like:  "some.key": ...
 */
function extractDefinedKeys(src) {
  const transStart = src.indexOf("const translations: Translations = {");
  const transEnd = src.indexOf("\n};", transStart);
  if (transStart === -1 || transEnd === -1) {
    console.error("Could not locate translations object in i18n.ts");
    process.exit(1);
  }
  // Grab keys from just the first language block (all langs share the same keys
  // — validated by i18n-completeness.test.js)
  const langRe = /^\s{2}"([^"]+)":\s*\{/m;
  const langMatch = langRe.exec(src.slice(transStart, transEnd));
  if (!langMatch) {
    console.error("No language section found in i18n.ts");
    process.exit(1);
  }
  const blockStart = transStart + langMatch.index + langMatch[0].length;
  const nextLangMatch = /^\s{2}"[^"]+":\s*\{/m.exec(src.slice(blockStart));
  const blockEnd = nextLangMatch ? blockStart + nextLangMatch.index : transEnd;
  const block = src.slice(blockStart, blockEnd);

  const keys = new Set();
  const re = /^\s+"([^"]+)":/gm;
  let m;
  while ((m = re.exec(block)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

/**
 * Recursively collect .ts and .svelte source files under dir.
 */
function collectSourceFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".svelte-kit", "dist", "build"].includes(entry.name)) continue;
      files.push(...collectSourceFiles(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".svelte")) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Strip single-line // comments from source (naive but good enough for our pattern matching).
 */
function stripLineComments(src) {
  return src.replace(/\/\/[^\n]*/g, "");
}

/**
 * Extract all t("key") call-sites from source text.
 * Handles both t("key") and _t("key") forms.
 * Only looks in non-comment code.
 */
function extractTCallKeys(src) {
  const keys = new Set();
  const stripped = stripLineComments(src);
  const re = /(?<![a-zA-Z_$])_?t\(\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

/**
 * Extract all string literals that look like i18n keys (contain a dot).
 * This catches keys passed as arguments to showRecorderAlert(), stored in
 * object properties (labelKey, consonants: "ipa.category.consonants"), etc.
 */
function extractStringLiteralKeys(src, definedKeys) {
  const keys = new Set();
  const re = /"([^"]+\.[^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (definedKeys.has(m[1])) keys.add(m[1]);
  }
  return keys;
}

function main() {
  const i18nSrc = fs.readFileSync(I18N_PATH, "utf8");
  const definedKeys = extractDefinedKeys(i18nSrc);

  const srcDir = path.join(ROOT, "src");
  const sourceFiles = collectSourceFiles(srcDir);

  // tCallKeys: keys found in t("...") — used to detect unknown keys
  // usedKeys: all string literals matching defined keys — used to detect dead keys
  const tCallKeys = new Set();
  const usedKeys = new Set();
  for (const file of sourceFiles) {
    const src = fs.readFileSync(file, "utf8");
    for (const key of extractTCallKeys(src)) {
      tCallKeys.add(key);
      usedKeys.add(key);
    }
    for (const key of extractStringLiteralKeys(src, definedKeys)) {
      usedKeys.add(key);
    }
  }

  console.log("i18n dead-key check");
  console.log("===================");
  console.log(`  ${definedKeys.size} keys defined, ${usedKeys.size} keys used in src/`);

  const deadKeys = [...definedKeys].filter((k) => !usedKeys.has(k));
  // Only report keys used in t("...") calls that aren't defined — string literals
  // stored in variables/props that get passed to t() indirectly are not checked here.
  const unknownKeys = [...tCallKeys].filter((k) => !definedKeys.has(k));

  let errors = 0;

  if (deadKeys.length > 0) {
    console.log(`\n  Dead keys (defined but never used):`);
    for (const k of deadKeys) console.log(`    - "${k}"`);
    errors += deadKeys.length;
  }

  if (unknownKeys.length > 0) {
    console.log(`\n  Unknown keys (used but not defined):`);
    for (const k of unknownKeys) console.log(`    - "${k}"`);
    errors += unknownKeys.length;
  }

  if (errors > 0) {
    console.error(`\n${errors} i18n issue(s) found!`);
    process.exit(1);
  }

  console.log(`\n  ✓ All defined keys are used; all call-sites reference known keys`);
}

main();
