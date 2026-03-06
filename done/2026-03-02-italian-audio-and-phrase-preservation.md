# Italian audio files and phrase preservation on language switch

## Tasks

1. Create Italian audio files in `static/audio/` using edge-tts
2. Check that all Italian phrases link to an existing English phrase
3. When changing UILang or studyLang, keep the current phrase (translated)

## Summary

### Italian audio generation

- Added `it-IT` to `scripts/generate_edge_tts_audio.py` with voices `it-IT-DiegoNeural` (male) and
  `it-IT-ElsaNeural` (female)
- Generated 146 audio files per voice (292 total) for all Italian phrases
- Updated `src/speech/phrase-audio.ts` comment to document it-IT voices
- Manifest now has `it-IT/edge-tts-male` and `it-IT/edge-tts-female` entries

### Italian → English phrase linking

- Validated all 146 Italian phrases: all `en-GB` keys link to valid English phrases
- Added 124 missing English phrases to `phrases-en-GB.yaml` with IPA and emoji:
  - Colors (Red, Blue, Green, Yellow, White, Black)
  - Numbers (One through Ten)
  - Days of the week (Monday through Sunday)
  - Months (January through December)
  - Seasons (Spring, Summer, Autumn, Winter)
  - Food vocabulary (Wine, Cheese, Egg, Meat, Orange, Strawberry, Tomato)
  - Places (Mountain, Sea, River, City, Village, Italy, Rome, Milan, Venice, Florence, Naples)
  - Common phrases (Good morning, Thank you, Please, How are you?, etc.)
  - Adjectives (Big, Small, Beautiful, Ugly, New, Old, Hot, Cold)
  - Transport (Bus, Aeroplane), Buildings (University, Hospital, Pharmacy, Bank, Restaurant, Hotel)

### Phrase preservation on language switch

- Added `findPhraseByEnGBKey(enKey, phraseLang)` function to `src/utils/random.ts`
- Updated `onStudyLangChange` handler in `src/routes/+page.svelte`:
  - When studyLang changes, looks up the current phrase's en-GB key
  - Finds the equivalent phrase in the new study language
  - If found: switches to the translated phrase without resetting to random
  - If not found: falls back to loading a random phrase
- Example: studying "Apple" in English, switching to German → shows "Apfel"
