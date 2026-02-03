import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get expected IPA for a word from the ipa-converter.ts lookup tables
 */
export function getExpectedIPA(word: string, lang: string): string {
    // Always read from source, not compiled output
    const projectRoot = path.resolve(__dirname, '../..');
    const ipaConverterPath = path.join(projectRoot, 'src/speech/ipa-converter.ts');

    if (!fs.existsSync(ipaConverterPath)) {
        throw new Error(`IPA converter file not found: ${ipaConverterPath}`);
    }

    const content = fs.readFileSync(ipaConverterPath, 'utf8');

    // Parse the TypeScript file to extract the word data
    const langKey = lang === 'de' ? 'germanTextToIPA' : 'englishTextToIPA';
    const regex = new RegExp(`const ${langKey}[^=]*=\\s*{([^}]+)}`, 's');
    const match = content.match(regex);

    if (!match) {
        throw new Error(`Could not parse ${langKey} from ipa-converter.ts`);
    }

    // Parse the object entries
    const entries = match[1];
    const wordLower = word.toLowerCase();

    // Match: 'word': 'ipa' or "word": "ipa"
    const wordRegex = new RegExp(`['"]${wordLower}['"]\\s*:\\s*['"]([^'"]+)['"]`);
    const wordMatch = entries.match(wordRegex);

    if (!wordMatch) {
        throw new Error(`Word "${word}" not found in ${lang} word data`);
    }

    // Remove slashes from IPA if present
    return wordMatch[1].replace(/^\/|\/$/g, '');
}
