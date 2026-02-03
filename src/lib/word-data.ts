import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface WordEntry {
    word: string;
    emoji: string;
    ipas: Array<{
        ipa: string;
        category: string;
    }>;
}

/**
 * Get expected IPA for a word from the words-{lang}.yaml files
 */
export function getExpectedIPA(word: string, lang: string): string {
    const projectRoot = path.resolve(__dirname, '../..');
    const wordsFilePath = path.join(projectRoot, `words-${lang}.yaml`);

    if (!fs.existsSync(wordsFilePath)) {
        throw new Error(`Words file not found: ${wordsFilePath}`);
    }

    const content = fs.readFileSync(wordsFilePath, 'utf8');
    const words = yaml.load(content) as WordEntry[];

    if (!Array.isArray(words)) {
        throw new Error(`Invalid YAML format in ${wordsFilePath}`);
    }

    // Normalize word for comparison (lowercase)
    const wordLower = word.toLowerCase();

    // Find the word entry
    const entry = words.find(w => w.word.toLowerCase() === wordLower);

    if (!entry || !entry.ipas || entry.ipas.length === 0) {
        throw new Error(`Word "${word}" not found in ${lang} word data`);
    }

    // Return the first IPA (usually the standard pronunciation)
    const ipa = entry.ipas[0].ipa;

    // Remove slashes from IPA if present
    return ipa.replace(/^\/|\/$/g, '');
}
