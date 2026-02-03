/**
 * IPA symbol explanation helper
 */

import { getLanguage } from '../i18n.js';
import ipaExamples from '../data/ipa-examples.json';

interface LanguageExamples {
  de?: string;
  en?: string;
}

type IPACategory = 'consonants' | 'vowels' | 'diphthongs' | 'modifiers';

// Build a flat lookup map from all categories
const symbolLookup = new Map<string, LanguageExamples>();

function buildLookup(): void {
  if (symbolLookup.size > 0) return;

  const categories: IPACategory[] = ['consonants', 'vowels', 'diphthongs', 'modifiers'];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const examples = ipaExamples as any;
  for (const category of categories) {
    const symbols = examples[category] as Record<string, LanguageExamples> | undefined;
    if (symbols) {
      for (const [symbol, exampleEntry] of Object.entries(symbols)) {
        symbolLookup.set(symbol, exampleEntry);
      }
    }
  }
}

/**
 * Get explanation for an IPA symbol in the current language
 */
export function getSymbolExplanation(symbol: string): string | null {
  buildLookup();
  const examples = symbolLookup.get(symbol);
  if (!examples) return null;

  const lang = getLanguage();
  return examples[lang] || examples.en || null;
}

/**
 * Extract unique IPA symbols from an IPA string
 * Handles multi-character symbols like t͡s, diphthongs, and modifiers
 */
export function extractSymbols(ipaString: string): string[] {
  if (!ipaString) return [];

  buildLookup();

  // Remove slashes and whitespace
  const cleaned = ipaString.replace(/[/[\]]/g, '').trim();
  if (!cleaned) return [];

  const symbols = new Set();
  let i = 0;

  while (i < cleaned.length) {
    // Try to match multi-character symbols first (longest match)
    let matched = false;

    // Try 3-char, then 2-char, then 1-char
    for (const len of [3, 2, 1]) {
      if (i + len <= cleaned.length) {
        const candidate = cleaned.slice(i, i + len);
        if (symbolLookup.has(candidate)) {
          symbols.add(candidate);
          i += len;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      // Single character not in lookup - still add it for completeness
      const char = cleaned[i];
      // Skip combining characters and spaces when standalone
      if (!/[\u0300-\u036f\u0361\s]/.test(char)) {
        symbols.add(char);
      }
      i++;
    }
  }

  return Array.from(symbols) as string[];
}

/**
 * Format symbol explanation with bold markers converted to HTML
 */
function formatExample(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/**
 * Generate HTML for IPA symbol explanations
 */
export function generateExplanationsHTML(targetIPA: string, actualIPA: string): string {
  // Extract symbols from both strings
  const targetSymbols = extractSymbols(targetIPA);
  const actualSymbols = extractSymbols(actualIPA);

  // Combine and deduplicate
  const allSymbols = new Set([...targetSymbols, ...actualSymbols]);

  if (allSymbols.size === 0) return '';

  // Sort symbols for consistent display
  const sortedSymbols = Array.from(allSymbols).sort();

  // Generate HTML
  let html = '<div class="row">';

  for (const symbol of sortedSymbols) {
    const explanation = getSymbolExplanation(symbol);
    if (explanation) {
      html += `
        <div class="col-6 col-md-4 col-lg-3 mb-2">
          <span class="badge bg-light text-dark border me-1" style="font-size: 1.1em;">${symbol}</span>
          <small class="text-muted">${formatExample(explanation)}</small>
        </div>
      `;
    }
  }

  html += '</div>';
  return html;
}
