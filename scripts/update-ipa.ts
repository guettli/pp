#!/usr/bin/env tsx
/**
 * Update IPA entries in phrases-*.yaml files using Wiktionary API
 * Usage:
 *   tsx scripts/update-ipa.ts phrases-de.yaml              # Update missing IPAs only
 *   tsx scripts/update-ipa.ts phrases-de.yaml --update-all # Re-fetch all IPAs
 */

import fs from "fs";
import path from "path";
import os from "os";
import yaml from "js-yaml";
import { spawn } from "child_process";

interface PhraseEntry {
  phrase: string;
  emoji: string;
  ipas?: Array<{
    ipa: string;
    category: string;
  }>;
}

interface WiktionaryCache {
  [word: string]: string | null;
}

// Cache directory following XDG Base Directory spec
const XDG_CACHE_HOME = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
const CACHE_DIR = path.join(XDG_CACHE_HOME, "phoneme-party");
const CACHE_FILE = path.join(CACHE_DIR, "wiktionary-ipa-cache.json");

const USER_AGENT = "PhonemeParty/0.1 (Educational pronunciation tool)";

// Language code mapping
const LANG_MAP: Record<string, string> = {
  de: "German",
  en: "English",
};

/**
 * Load cache from disk
 */
function loadCache(): WiktionaryCache {
  // Ensure cache directory exists
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  if (fs.existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Save cache to disk
 */
function saveCache(cache: WiktionaryCache): void {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * Query Wiktionary API for a word's IPA pronunciation
 * Tries the word as-is first, then lowercase if not found
 */
async function getIPAFromWiktionary(
  word: string,
  lang: string,
  cache: WiktionaryCache,
): Promise<string | null> {
  const cacheKey = `${lang}:${word.toLowerCase()}`;

  // Check cache first
  if (cacheKey in cache) {
    return cache[cacheKey];
  }

  // Try the word as-is first (important for nouns which are capitalized in German)
  let ipa = await queryWiktionaryAPI(word, lang);

  // If not found and word is capitalized, try lowercase
  if (ipa === null && word !== word.toLowerCase()) {
    ipa = await queryWiktionaryAPI(word.toLowerCase(), lang);
  }

  // Cache the result
  cache[cacheKey] = ipa;
  return ipa;
}

/**
 * Internal function to query Wiktionary API
 */
async function queryWiktionaryAPI(word: string, lang: string): Promise<string | null> {
  // Rate limiting - wait 1 second between requests
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const languageName = LANG_MAP[lang] || lang;
  const url = `https://en.wiktionary.org/w/api.php?action=parse&format=json&page=${encodeURIComponent(word)}&prop=wikitext`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data.error || !data.parse?.wikitext?.["*"]) {
      return null;
    }

    const wikitext = data.parse.wikitext["*"];

    // Search line by line for the IPA template for the specific language
    // More reliable than regex matching on the whole text
    const lines = wikitext.split("\n");
    let inLanguageSection = false;
    const ipaPattern = new RegExp(`\\{\\{IPA\\|${lang}\\|([^}]+)\\}\\}`);

    for (const line of lines) {
      // Check if we're entering the correct language section
      if (line.includes(`==${languageName}==`)) {
        inLanguageSection = true;
        continue;
      }

      // Check if we're leaving the language section
      if (inLanguageSection && /^==[^=]/.test(line)) {
        break;
      }

      // Look for IPA template in the language section
      if (inLanguageSection && line.includes("{{IPA")) {
        const match = line.match(ipaPattern);
        if (match) {
          // Extract all IPA pronunciations (separated by pipes)
          const parts = match[1].split("|").map((s: string) => s.trim());

          // Find the first IPA in slashes /.../ (phonemic transcription)
          for (const part of parts) {
            if (part.startsWith("/")) {
              return part.replace(/^\/|\/$/g, "");
            }
          }

          // Fallback: use first bracket notation [...] (phonetic transcription)
          for (const part of parts) {
            if (part.startsWith("[")) {
              return part.replace(/^\[|\]$/g, "");
            }
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error(`Error querying Wiktionary for "${word}":`, error);
    return null;
  }
}

/**
 * Get IPA from espeak-ng as fallback when Wiktionary doesn't have data
 */
async function getIPAFromEspeak(text: string): Promise<string | null> {
  return new Promise((resolve) => {
    const python = spawn("python3", ["scripts/espeak-ipa.py", text]);
    let output = "";

    python.stdout.on("data", (data) => {
      output += data.toString();
    });

    python.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }

      try {
        const result = JSON.parse(output);
        if (result.ipa && !result.ipa.startsWith("ERROR")) {
          resolve(result.ipa);
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Get IPA for a phrase (may be multiple words)
 */
async function getPhraseIPA(
  phrase: string,
  lang: string,
  cache: WiktionaryCache,
): Promise<string | null> {
  // First try Wiktionary for the entire phrase
  const words = phrase.split(/\s+/);

  if (words.length === 1) {
    // Single word - try Wiktionary first
    const wiktIPA = await getIPAFromWiktionary(words[0], lang, cache);
    if (wiktIPA !== null) {
      return wiktIPA;
    }
    // Fall back to espeak-ng
    console.log(`  → Falling back to espeak-ng for: ${words[0]}`);
    return await getIPAFromEspeak(phrase);
  }

  // Multi-word phrase - try word-by-word with Wiktionary, fall back per-word
  const ipaResults: string[] = [];

  // Common German function words and their IPAs
  const commonWords: Record<string, string> = {
    der: "deːɐ̯",
    die: "diː",
    das: "das",
    den: "deːn",
    dem: "deːm",
    des: "dɛs",
    ein: "aɪ̯n",
    eine: "ˈaɪ̯nə",
    ist: "ɪst",
    sind: "zɪnt",
    und: "ʊnt",
  };

  for (const word of words) {
    const lowerWord = word.toLowerCase();

    // Check if it's a common function word
    if (lowerWord in commonWords) {
      ipaResults.push(commonWords[lowerWord]);
      continue;
    }

    // Try Wiktionary first
    let ipa = await getIPAFromWiktionary(word, lang, cache);

    // Fall back to espeak-ng for this word if not found
    if (ipa === null) {
      console.log(`  → Falling back to espeak-ng for: ${word}`);
      ipa = await getIPAFromEspeak(word);

      if (ipa === null) {
        console.error(`  ⚠️  Could not find IPA for word: ${word}`);
        return null;
      }
    }

    ipaResults.push(ipa);
  }

  // Combine IPAs with spaces
  return ipaResults.join(" ");
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  // Show usage if no args or first arg starts with -
  if (args.length === 0 || args[0].startsWith("-")) {
    console.error("Usage: tsx scripts/update-ipa.ts <phrases-file> [--update-all]");
    console.error("Example: tsx scripts/update-ipa.ts phrases-de.yaml");
    process.exit(1);
  }

  // Show usage if too many args or invalid flag
  if (args.length > 2) {
    console.error("Error: Too many arguments");
    console.error("Usage: tsx scripts/update-ipa.ts <phrases-file> [--update-all]");
    console.error("Example: tsx scripts/update-ipa.ts phrases-de.yaml");
    process.exit(1);
  }

  if (args.length === 2 && args[1] !== "--update-all") {
    console.error(`Error: Invalid argument: ${args[1]}`);
    console.error("Usage: tsx scripts/update-ipa.ts <phrases-file> [--update-all]");
    console.error("Example: tsx scripts/update-ipa.ts phrases-de.yaml");
    process.exit(1);
  }

  const filePath = args[0];
  const updateAll = args.includes("--update-all");

  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  // Extract language from filename (e.g., phrases-de.yaml -> de)
  const langMatch = path.basename(filePath).match(/phrases-([a-z]+)\.yaml/);
  if (!langMatch) {
    console.error("Error: Could not determine language from filename");
    console.error("Expected format: phrases-{lang}.yaml");
    process.exit(1);
  }

  const lang = langMatch[1];

  console.log(`📖 Reading ${filePath}...`);
  const content = fs.readFileSync(filePath, "utf8");
  const phrases = yaml.load(content) as PhraseEntry[];

  if (!Array.isArray(phrases)) {
    console.error("Error: Invalid YAML format");
    process.exit(1);
  }

  // Determine which entries to update
  let entriesToUpdate: PhraseEntry[];

  if (updateAll) {
    console.log(`\n🔄 Updating ALL ${phrases.length} entries...\n`);
    entriesToUpdate = phrases;
  } else {
    // Find entries with missing IPA
    entriesToUpdate = phrases.filter((p) => !p.ipas || p.ipas.length === 0);

    if (entriesToUpdate.length === 0) {
      console.log("✅ All entries have IPA data!");
      console.log("💡 Use --update-all to re-fetch all IPAs from Wiktionary");
      process.exit(0);
    }

    console.log(`\n🔍 Found ${entriesToUpdate.length} entries with missing IPA:\n`);
  }

  const cache = loadCache();
  const updates: Array<{ phrase: string; ipa: string }> = [];

  for (const entry of entriesToUpdate) {
    console.log(`Fetching IPA for: "${entry.phrase}"...`);
    const ipa = await getPhraseIPA(entry.phrase, lang, cache);

    if (ipa) {
      console.log(`  ✓ /${ipa}/\n`);
      updates.push({ phrase: entry.phrase, ipa });
    } else {
      console.log(`  ✗ Not found\n`);
    }
  }

  // Save cache
  saveCache(cache);

  if (updates.length === 0) {
    console.log("❌ Could not find IPA for any entries");
    process.exit(1);
  }

  // Display results summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Found IPA for ${updates.length}/${entriesToUpdate.length} entries\n`);

  // Update the phrases array
  console.log("✍️  Updating file...");

  for (const update of updates) {
    const entry = phrases.find((p) => p.phrase === update.phrase);
    if (entry) {
      entry.ipas = [
        {
          ipa: `/${update.ipa}/`,
          category: "standard",
        },
      ];
    }
  }

  // Write back to file
  const newContent = yaml.dump(phrases, {
    lineWidth: 100,
    noRefs: true,
  });

  fs.writeFileSync(filePath, newContent);
  console.log(`✅ Updated ${filePath} with ${updates.length} IPA entries`);
}

main();
