import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PhraseEntry {
    phrase: string;
    emoji: string;
    ipas: Array<{
        ipa: string;
        category: string;
    }>;
}

/**
 * Get expected IPA for a phrase from the phrases-{lang}.yaml files
 */
export function getExpectedIPA(phrase: string, lang: string): string {
    const projectRoot = path.resolve(__dirname, '../..');
    const phrasesFilePath = path.join(projectRoot, `phrases-${lang}.yaml`);

    if (!fs.existsSync(phrasesFilePath)) {
        throw new Error(`Phrases file not found: ${phrasesFilePath}`);
    }

    const content = fs.readFileSync(phrasesFilePath, 'utf8');
    const phrases = yaml.load(content) as PhraseEntry[];

    if (!Array.isArray(phrases)) {
        throw new Error(`Invalid YAML format in ${phrasesFilePath}`);
    }

    // Normalize phrase for comparison (lowercase)
    const phraseLower = phrase.toLowerCase();

    // Find the phrase entry
    const entry = phrases.find(p => p.phrase.toLowerCase() === phraseLower);

    if (!entry || !entry.ipas || entry.ipas.length === 0) {
        throw new Error(`Phrase "${phrase}" not found in ${lang} phrase data`);
    }

    // Return the first IPA (usually the standard pronunciation)
    const ipa = entry.ipas[0].ipa;

    // Remove slashes from IPA if present
    return ipa.replace(/^\/|\/$/g, '');
}
