/**
 * Checks that all translation keys are present in every uiLang section of src/i18n.ts.
 * Exits with code 1 if any keys are missing so that deploy fails.
 *
 * Run with: node tests/i18n-completeness.test.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const I18N_PATH = path.join(__dirname, "../src/i18n.ts");

/**
 * Extract all top-level string keys from a single language block.
 * The block starts after `"de-DE": {`, `"en-GB": {`, or `"fr-FR": {` and ends at the matching `},`.
 * Keys look like:  "some.key": ...
 */
function extractKeysFromBlock(block) {
  const keys = [];
  const re = /^\s+"([^"]+)":/gm;
  let m;
  while ((m = re.exec(block)) !== null) {
    keys.push(m[1]);
  }
  return keys;
}

/**
 * Split the translations object in i18n.ts into one text block per language.
 * We look for the pattern `  "de-DE": {` (a quoted lang code) followed by
 * its content up to the matching closing `  },`.
 */
function extractLanguageBlocks(src) {
  const blocks = {};
  // Match each top-level language key inside `const translations: Translations = { ... };`
  const langRe = /^\s{2}"([^"]+)":\s*\{/gm;
  let match;
  const positions = [];
  while ((match = langRe.exec(src)) !== null) {
    positions.push({
      lang: match[1],
      contentStart: match.index + match[0].length,
      matchStart: match.index,
    });
  }

  for (let i = 0; i < positions.length; i++) {
    const { lang, contentStart } = positions[i];
    // Use matchStart of the next block as end so we don't include its opening `"lang": {` line
    const end = i + 1 < positions.length ? positions[i + 1].matchStart : src.length;
    blocks[lang] = src.slice(contentStart, end);
  }
  return blocks;
}

function main() {
  const src = fs.readFileSync(I18N_PATH, "utf8");

  // Only look inside the `const translations: Translations = { ... };` block
  const transStart = src.indexOf("const translations: Translations = {");
  const transEnd = src.indexOf("\n};", transStart);
  if (transStart === -1 || transEnd === -1) {
    console.error("Could not locate translations object in i18n.ts");
    process.exit(1);
  }
  const transBlock = src.slice(transStart, transEnd);

  const blocks = extractLanguageBlocks(transBlock);
  const langs = Object.keys(blocks);

  if (langs.length === 0) {
    console.error("No language sections found in i18n.ts");
    process.exit(1);
  }

  // Build key sets per language
  const keysByLang = {};
  for (const lang of langs) {
    keysByLang[lang] = new Set(extractKeysFromBlock(blocks[lang]));
  }

  console.log("i18n completeness check");
  console.log("=======================");
  for (const lang of langs) {
    console.log(`  ${lang}: ${keysByLang[lang].size} keys`);
  }

  // Use the union of all keys as the reference set
  const allKeys = new Set([...Object.values(keysByLang)].flatMap((s) => [...s]));

  let missing = 0;
  for (const lang of langs) {
    const langKeys = keysByLang[lang];
    for (const key of allKeys) {
      if (!langKeys.has(key)) {
        console.error(`  MISSING in "${lang}": "${key}"`);
        missing++;
      }
    }
  }

  if (missing > 0) {
    console.error(`\n${missing} missing translation key(s) found!`);
    process.exit(1);
  }

  console.log(`\n  ✓ All ${allKeys.size} keys present in all ${langs.length} languages`);
}

main();
