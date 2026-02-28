/**
 * Checks that all IPA strings in phrases-*.yaml files are free of invalid content.
 *
 * Invalid patterns detected:
 *   - Language markers embedded in IPA, e.g. (en), (fr), (de), (es)
 *     These are artifacts from automated IPA tools that tag foreign-word segments.
 *
 * Run with: node tests/ipa-validity.test.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PHRASE_FILES = ["phrases-de-DE.yaml", "phrases-en-GB.yaml", "phrases-fr-FR.yaml"];

// Regex matching a parenthesised ISO 639-1 or BCP-47 language tag embedded in IPA,
// e.g. (en), (fr), (de), (es), (it), (en-GB) – produced by some TTS/g2p tools.
const LANG_MARKER_RE = /\([a-z]{2}(?:-[A-Z]{2})?\)/;

function checkIpaString(ipa) {
  const errors = [];
  if (LANG_MARKER_RE.test(ipa)) {
    errors.push(`language marker in IPA: "${ipa}"`);
  }
  return errors;
}

function main() {
  console.log("IPA validity check");
  console.log("==================");

  let totalPhrases = 0;
  let totalErrors = 0;

  for (const filename of PHRASE_FILES) {
    const filePath = path.join(__dirname, "..", filename);
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }

    const content = fs.readFileSync(filePath, "utf8");
    const phrases = yaml.load(content);

    if (!Array.isArray(phrases)) {
      console.error(`Invalid YAML in ${filename}`);
      process.exit(1);
    }

    const fileErrors = [];

    for (const entry of phrases) {
      totalPhrases++;
      if (!entry.ipas) continue;
      for (const ipaEntry of entry.ipas) {
        const errs = checkIpaString(ipaEntry.ipa ?? "");
        for (const err of errs) {
          fileErrors.push(`  phrase "${entry.phrase}": ${err}`);
          totalErrors++;
        }
      }
    }

    if (fileErrors.length > 0) {
      console.error(`\n${filename}: ${fileErrors.length} error(s)`);
      for (const e of fileErrors) console.error(e);
    } else {
      console.log(`  ${filename}: OK (${phrases.length} phrases)`);
    }
  }

  if (totalErrors > 0) {
    console.error(`\n${totalErrors} IPA error(s) found across ${totalPhrases} phrases.`);
    process.exit(1);
  }

  console.log(`\n  ✓ All IPA strings are valid (${totalPhrases} phrases checked)`);
}

main();
