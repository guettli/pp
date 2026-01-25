/**
 * Text to IPA conversion for German words
 * Uses lookup table for the 30 words in our vocabulary
 */

// Map transcribed German text to IPA pronunciation
const germanTextToIPA = {
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

/**
 * Convert German text to IPA pronunciation
 * @param {string} text - German word or text
 * @returns {Object} Object with ipa and found status
 */
export function convertTextToIPA(text) {
  // Normalize: lowercase and trim
  const normalized = text.toLowerCase().trim();

  // Remove punctuation
  const cleaned = normalized.replace(/[.,!?;:"'-]/g, '');

  // Look up in dictionary
  const ipa = germanTextToIPA[cleaned];

  if (ipa) {
    return { ipa, found: true, matchedWord: cleaned };
  }

  // Try to find the word within the text if it contains multiple words
  const words = cleaned.split(/\s+/);
  for (const word of words) {
    if (germanTextToIPA[word]) {
      console.log(`Found "${word}" within transcription "${text}"`);
      return { ipa: germanTextToIPA[word], found: true, matchedWord: word };
    }
  }

  // Word not found in vocabulary
  console.warn(`No IPA found for: "${text}". Word not in vocabulary.`);
  return { ipa: null, found: false, matchedWord: null };
}

/**
 * Check if a word is in our vocabulary
 * @param {string} text - German word
 * @returns {boolean}
 */
export function isKnownWord(text) {
  const normalized = text.toLowerCase().trim().replace(/[.,!?;:"'-]/g, '');

  // Check exact match
  if (normalized in germanTextToIPA) {
    return true;
  }

  // Check if any word in the text is in vocabulary
  const words = normalized.split(/\s+/);
  for (const word of words) {
    if (germanTextToIPA[word]) {
      return true;
    }
  }

  return false;
}
