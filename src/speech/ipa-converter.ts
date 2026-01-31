/**
 * Text to IPA conversion for known words
 * Uses lookup tables for the vocabulary lists
 */

import type { SupportedLanguage } from '../types.js';

const germanTextToIPA: Record<string, string> = {
  'katze': 'ˈkat͡sə',
  'hund': 'hʊnt',
  'haus': 'haʊ̯s',
  'baum': 'baʊ̯m',
  'blume': 'ˈbluːmə',
  'sonne': 'ˈzɔnə',
  'mond': 'moːnt',
  'stern': 'ʃtɛʁn',
  'auto': 'ˈaʊ̯to',
  'ball': 'bal',
  'buch': 'buːx',
  'apfel': 'ˈap͡fl̩',
  'banane': 'baˈnaːnə',
  'brot': 'bʁoːt',
  'fisch': 'fɪʃ',
  'vogel': 'ˈfoːɡl̩',
  'schmetterling': 'ˈʃmɛtɐlɪŋ',
  'schiff': 'ʃɪf',
  'flugzeug': 'ˈfluːkˌt͡sɔɪ̯k',
  'zug': 't͡suːk',
  'fahrrad': 'ˈfaːɐ̯ˌʁaːt',
  'tür': 'tyːɐ̯',
  'fenster': 'ˈfɛnstɐ',
  'tisch': 'tɪʃ',
  'bett': 'bɛt',
  'uhr': 'uːɐ̯',
  'schlüssel': 'ˈʃlʏsl̩',
  'herz': 'hɛʁt͡s',
  'hand': 'hant',
  'fuß': 'fuːs',
  'fuss': 'fuːs'  // Alternative spelling
};

const englishTextToIPA: Record<string, string> = {
  'cat': 'kæt',
  'dog': 'dɔɡ',
  'house': 'haʊs',
  'tree': 'triː',
  'flower': 'ˈflaʊər',
  'sun': 'sʌn',
  'moon': 'muːn',
  'star': 'stɑr',
  'car': 'kɑr',
  'ball': 'bɔl',
  'book': 'bʊk',
  'apple': 'ˈæpəl',
  'banana': 'bəˈnænə',
  'bread': 'brɛd',
  'fish': 'fɪʃ',
  'bird': 'bɝd',
  'butterfly': 'ˈbʌtərflaɪ',
  'ship': 'ʃɪp',
  'airplane': 'ˈɛrpleɪn',
  'aeroplane': 'ˈɛrpleɪn',
  'train': 'treɪn',
  'bicycle': 'ˈbaɪsɪkəl',
  'bike': 'baɪk',
  'door': 'dɔr',
  'window': 'ˈwɪndoʊ',
  'table': 'ˈteɪbəl',
  'bed': 'bɛd',
  'clock': 'klɑk',
  'key': 'kiː',
  'heart': 'hɑrt',
  'hand': 'hænd',
  'foot': 'fʊt'
};

function getMapForLanguage(language: SupportedLanguage): Record<string, string> {
  return language === 'de' ? germanTextToIPA : englishTextToIPA;
}

interface IPAConversionResult {
  ipa: string | null;
  found: boolean;
  matchedWord: string | null;
}

/**
 * Convert transcribed text to IPA pronunciation
 */
export function convertTextToIPA(text: string, language: SupportedLanguage = 'de'): IPAConversionResult {
  // Normalize: lowercase and trim
  const normalized = text.toLowerCase().trim();

  // Remove punctuation
  const cleaned = normalized.replace(/[.,!?;:"'-]/g, '');

  const map = getMapForLanguage(language);

  // Look up in dictionary
  const ipa = map[cleaned];

  if (ipa) {
    return { ipa, found: true, matchedWord: cleaned };
  }

  // Try compact form for multi-word transcripts (e.g., "air plane")
  const compact = cleaned.replace(/\s+/g, '');
  if (compact && map[compact]) {
    return { ipa: map[compact], found: true, matchedWord: compact };
  }

  // Try to find the word within the text if it contains multiple words
  const words = cleaned.split(/\s+/);
  for (const word of words) {
    if (map[word]) {
      console.log(`Found "${word}" within transcription "${text}"`);
      return { ipa: map[word], found: true, matchedWord: word };
    }
  }

  // Word not found in vocabulary
  console.warn(`No IPA found for: "${text}". Word not in vocabulary.`);
  return { ipa: null, found: false, matchedWord: null };
}

/**
 * Check if a word is in our vocabulary
 */
export function isKnownWord(text: string, language: SupportedLanguage = 'de'): boolean {
  const normalized = text.toLowerCase().trim().replace(/[.,!?;:"'-]/g, '');
  const map = getMapForLanguage(language);

  // Check exact match
  if (normalized in map) {
    return true;
  }

  const compact = normalized.replace(/\s+/g, '');
  if (compact in map) {
    return true;
  }

  // Check if any word in the text is in vocabulary
  const words = normalized.split(/\s+/);
  for (const word of words) {
    if (map[word]) {
      return true;
    }
  }

  return false;
}
