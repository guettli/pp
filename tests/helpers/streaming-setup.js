import fs from "fs";
import yaml from "js-yaml";
import path from "path";

/**
 * Load the Die Rose test audio and expected IPA from test fixtures.
 * Shared by streaming-timing-bug, streaming-chunk-decode-bug, and no-chunk-decode-error tests.
 */
export function loadDieRoseTestData() {
  const base = path.join(process.cwd(), "tests/data/de-DE/Die_Rose/Die_Rose-Thomas");
  const expectedData = yaml.load(fs.readFileSync(`${base}.flac.yaml`, "utf8"));
  const audioBuffer = fs.readFileSync(`${base}.flac`);
  return {
    expectedIPA: expectedData.recognized_ipa,
    phrase: expectedData.phrase,
    audioBuffer,
  };
}
