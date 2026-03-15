/** djb2 hash over UTF-8 bytes, returned as 8 lowercase hex chars. */
export function djb2hex(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let h = 5381;
  for (const b of bytes) {
    h = (Math.imul(h, 33) + b) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Derive the audio filename stem from an en-GB text.
 * Matches the algorithm in scripts/generate_edge_tts_audio.py.
 */
export function phraseToFilename(enGbText: string): string {
  const safe = enGbText.replace(/[^a-zA-Z0-9]/g, "_");
  if (safe.length <= 25) return safe;
  return safe.slice(0, 25) + "_" + djb2hex(enGbText);
}
