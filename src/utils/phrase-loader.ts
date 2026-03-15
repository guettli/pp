import type { Phrase, SupportedLanguage } from "../types.js";
import { base } from "$app/paths";

const cache = new Map<string, Phrase[]>();

export async function preloadPhrases(lang: SupportedLanguage): Promise<void> {
  if (cache.has(lang)) return;
  const resp = await fetch(`${base}/phrases/${lang}.json`); // eslint-disable-line @typescript-eslint/no-deprecated
  if (!resp.ok) throw new Error(`Failed to load phrases for ${lang}: ${resp.status}`);
  const data: Phrase[] = await resp.json();
  cache.set(lang, data);
}

export function getCachedPhrases(lang: string): Phrase[] | undefined {
  return cache.get(lang);
}
