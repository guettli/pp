const STORAGE_KEY = 'phoneme-party-language';
const SUPPORTED_LANGUAGES = ['de', 'en'];
const GERMAN_REGIONS = new Set(['de', 'at', 'ch']);

const translations = {
  de: {
    'app.title': 'Phoneme Party - Aussprachetraining',
    'header.title': 'Phoneme Party',
    'header.subtitle': 'Übe deutsche Aussprache mit KI',
    'language.label': 'Sprache:',
    'language.de': 'Deutsch',
    'language.en': 'Englisch',
    'console.title': 'Konsolen-Ausgabe',
    'console.copy': 'Kopieren',
    'console.clear': 'Leeren',
    'console.copy_title': 'In die Zwischenablage kopieren',
    'console.clear_title': 'Konsole leeren',
    'console.copy_success': 'Kopiert!',
    'console.copy_failed': 'Fehlgeschlagen',
    'loading.hidden_label': 'Laden...',
    'loading.initializing': 'Initialisiere...',
    'loading.description': 'Mehrsprachiges KI-Modell wird geladen (~150MB). Beim ersten Start kann das etwas dauern.',
    'loading.status.initiate': 'Download wird gestartet: {file}',
    'loading.status.download': '{file} wird heruntergeladen... {percent}%',
    'loading.status.done': '{file} heruntergeladen',
    'loading.status.progress': '{file} wird geladen... {percent}%',
    'loading.status.downloading_model': 'Modell wird heruntergeladen... {percent}%',
    'loading.status.loading_model': 'Modell wird in den Speicher geladen...',
    'loading.status.ready': 'Bereit!',
    'loading.status.fallback': '{status}',
    'record.hold': 'Zum Aufnehmen halten',
    'record.recording': 'Aufnahme... {seconds}s',
    'record.processing': 'Verarbeite... {percent}%',
    'record.processing_plain': 'Verarbeite...',
    'processing.debug_title': 'Verarbeitungsdetails',
    'processing.meta_model_load': 'Modell-Startzeit',
    'processing.meta_audio_duration': 'Audio-Dauer',
    'processing.meta_asr_chunks': 'ASR-Chunks (geschätzt)',
    'processing.step_prepare': 'Audio-Vorbereitung',
    'processing.step_transcribe': 'Spracherkennung',
    'processing.step_ipa': 'IPA-Konvertierung',
    'processing.step_score': 'Aussprache-Bewertung',
    'processing.step_total': 'Gesamt',
    'record.permission_title': 'Mikrofon-Zugriff erforderlich',
    'record.permission_body': 'Bitte erlaube den Mikrofonzugriff im Browser. Danach den Button erneut drücken.',
    'record.too_short_title': 'Aufnahme zu kurz!',
    'record.too_short_body': 'Bitte halte den Button gedrückt, während du sprichst, um deine Aussprache aufzunehmen.',
    'buttons.next_word': 'Nächstes Wort ->',
    'buttons.close': 'Schließen',
    'feedback.title': 'Deine Aussprache',
    'feedback.target_word_label': 'Zielwort:',
    'feedback.target_ipa_label': 'Ziel-IPA:',
    'feedback.your_ipa_label': 'Dein IPA:',
    'feedback.word_not_in_vocab': '(Wort nicht im Wortschatz)',
    'feedback.phoneme_analysis': 'Phonem-Analyse:',
    'feedback.phoneme_similarity': 'Phonem-Ähnlichkeit:',
    'feedback.distance': 'Abstand',
    'feedback.play_target': 'Gewünschte Aussprache abspielen',
    'feedback.speech_not_supported': '(Sprachausgabe nicht verfügbar)',
    'feedback.word_not_recognized': 'Wort nicht erkannt',
    'feedback.word_not_recognized_message': 'Das System hat "{heard}" verstanden, aber dieses Wort ist nicht im aktuellen Wortschatz. Versuche, das Zielwort "{target}" klarer zu sagen.',
    'score.excellent': 'Ausgezeichnet!',
    'score.good': 'Gut!',
    'score.fair': 'Mittel',
    'score.try_again': 'Nochmal',
    'score.message.excellent': 'Perfekte Aussprache! Super gemacht!',
    'score.message.good': 'Sehr nah dran! Weiter üben!',
    'score.message.fair': 'Wird besser! Versuch es nochmal!',
    'score.message.try_again': 'Lass uns dieses Wort noch mal üben.',
    'processing.label': 'Verarbeitung...',
    'tips.label': 'Tipps:',
    'tips.body': 'Halte den Button gedrückt, während du sprichst (max. 4 Sekunden). Loslassen beendet die Aufnahme und startet die Auswertung.',
    'footer.powered_by': 'Powered by',
    'footer.local_processing': 'Alle Verarbeitung findet lokal in deinem Browser statt',
    'footer.webgpu_status_checking': 'WebGPU: wird geprüft...',
    'footer.webgpu_status_active': 'WebGPU: aktiv',
    'footer.webgpu_status_unavailable': 'WebGPU: nicht verfügbar',
    'footer.webgpu_status_fallback': 'WebGPU: aus ({backend})',
    'footer.webgpu_status_available': 'WebGPU: verfügbar',
    'errors.title': 'Fehler',
    'errors.message_label': 'Nachricht:',
    'errors.unknown': 'Unbekannter Fehler',
    'errors.no_stack': 'Kein Stacktrace verfügbar',
    'errors.show_details': 'Fehlerdetails anzeigen',
    'errors.reload': 'Seite neu laden'
  },
  en: {
    'app.title': 'Phoneme Party - Pronunciation Practice',
    'header.title': 'Phoneme Party',
    'header.subtitle': 'Practice English pronunciation with AI',
    'language.label': 'Language:',
    'language.de': 'German',
    'language.en': 'English',
    'console.title': 'Console Output',
    'console.copy': 'Copy',
    'console.clear': 'Clear',
    'console.copy_title': 'Copy to clipboard',
    'console.clear_title': 'Clear console',
    'console.copy_success': 'Copied!',
    'console.copy_failed': 'Failed',
    'loading.hidden_label': 'Loading...',
    'loading.initializing': 'Initializing...',
    'loading.description': 'Downloading multilingual AI model (~150MB). This may take a moment on first load.',
    'loading.status.initiate': 'Initiating download: {file}',
    'loading.status.download': 'Downloading {file}... {percent}%',
    'loading.status.done': 'Downloaded {file}',
    'loading.status.progress': 'Loading {file}... {percent}%',
    'loading.status.downloading_model': 'Downloading model... {percent}%',
    'loading.status.loading_model': 'Loading model into memory...',
    'loading.status.ready': 'Ready!',
    'loading.status.fallback': '{status}',
    'record.hold': 'Hold to Record',
    'record.recording': 'Recording... {seconds}s',
    'record.processing': 'Processing... {percent}%',
    'record.processing_plain': 'Processing...',
    'processing.debug_title': 'Processing breakdown',
    'processing.meta_model_load': 'Model load time',
    'processing.meta_audio_duration': 'Audio duration',
    'processing.meta_asr_chunks': 'ASR chunks (estimated)',
    'processing.step_prepare': 'Audio preprocessing',
    'processing.step_transcribe': 'Speech recognition',
    'processing.step_ipa': 'IPA conversion',
    'processing.step_score': 'Pronunciation scoring',
    'processing.step_total': 'Total',
    'record.permission_title': 'Microphone access required',
    'record.permission_body': 'Please allow microphone access in the browser, then press the button again.',
    'record.too_short_title': 'Recording too short!',
    'record.too_short_body': 'Please hold down the button while speaking to record your pronunciation.',
    'buttons.next_word': 'Next Word ->',
    'buttons.close': 'Close',
    'feedback.title': 'Your Pronunciation',
    'feedback.target_word_label': 'Target Word:',
    'feedback.target_ipa_label': 'Target IPA:',
    'feedback.your_ipa_label': 'Your IPA:',
    'feedback.word_not_in_vocab': '(Word not in vocabulary)',
    'feedback.phoneme_analysis': 'Phoneme Analysis:',
    'feedback.phoneme_similarity': 'Phoneme Similarity:',
    'feedback.distance': 'Distance',
    'feedback.play_target': 'Play desired pronunciation',
    'feedback.speech_not_supported': '(Speech synthesis not available)',
    'feedback.word_not_recognized': 'Word Not Recognized',
    'feedback.word_not_recognized_message': 'The system heard "{heard}" but this word is not in the current vocabulary. Try saying the target word "{target}" more clearly.',
    'score.excellent': 'Excellent!',
    'score.good': 'Good!',
    'score.fair': 'Fair',
    'score.try_again': 'Try Again',
    'score.message.excellent': 'Perfect pronunciation! You nailed it!',
    'score.message.good': 'Very close! Keep practicing!',
    'score.message.fair': 'Getting there! Try again!',
    'score.message.try_again': 'Lets practice this word more.',
    'processing.label': 'Processing...',
    'tips.label': 'Tips:',
    'tips.body': 'Hold down the button while speaking (max 4 seconds). Release to stop and process your pronunciation.',
    'footer.powered_by': 'Powered by',
    'footer.local_processing': 'All processing happens locally in your browser',
    'footer.webgpu_status_checking': 'WebGPU: checking...',
    'footer.webgpu_status_active': 'WebGPU: active',
    'footer.webgpu_status_unavailable': 'WebGPU: unavailable',
    'footer.webgpu_status_fallback': 'WebGPU: off ({backend})',
    'footer.webgpu_status_available': 'WebGPU: available',
    'errors.title': 'Error',
    'errors.message_label': 'Message:',
    'errors.unknown': 'Unknown error',
    'errors.no_stack': 'No stack trace available',
    'errors.show_details': 'Show Full Error Details',
    'errors.reload': 'Reload Page'
  }
};

let currentLanguage = resolveInitialLanguage();
const listeners = new Set();

function resolveInitialLanguage() {
  const stored = safeGetStorage(STORAGE_KEY);
  if (stored && SUPPORTED_LANGUAGES.includes(stored)) {
    return stored;
  }
  return detectLanguageFromLocale();
}

function detectLanguageFromLocale() {
  const locales = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];

  for (const locale of locales) {
    if (!locale) continue;
    const normalized = locale.toLowerCase().replace('_', '-');
    const [language, region] = normalized.split('-');
    if (language === 'de' || (region && GERMAN_REGIONS.has(region))) {
      return 'de';
    }
  }

  return 'en';
}

function safeGetStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function safeSetStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    // Ignore storage errors (private mode or blocked storage).
  }
}

export function t(key, variables = {}) {
  const langTable = translations[currentLanguage] || translations.en;
  const template = langTable[key] || translations.en[key] || key;
  return Object.keys(variables).reduce((result, varKey) => {
    const value = variables[varKey];
    return result.replaceAll(`{${varKey}}`, String(value));
  }, template);
}

export function getLanguage() {
  return currentLanguage;
}

export function setLanguage(language) {
  const normalized = SUPPORTED_LANGUAGES.includes(language) ? language : 'en';
  if (normalized === currentLanguage) return;
  currentLanguage = normalized;
  safeSetStorage(STORAGE_KEY, normalized);
  applyTranslations();
  listeners.forEach((listener) => listener(currentLanguage));
}

export function onLanguageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function applyTranslations(root = document) {
  if (!root) return;
  if (document?.documentElement) {
    document.documentElement.lang = currentLanguage;
  }
  if (document?.title) {
    document.title = t('app.title');
  }

  const elements = root.querySelectorAll('[data-i18n]');
  elements.forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    el.textContent = t(key);

    const attrList = el.getAttribute('data-i18n-attr');
    if (attrList) {
      attrList
        .split(',')
        .map((attr) => attr.trim())
        .filter(Boolean)
        .forEach((attr) => {
          const [attrName, attrKey] = attr.split(':').map((part) => part.trim());
          el.setAttribute(attrName, t(attrKey || key));
        });
    }
  });
}

export function initI18n() {
  applyTranslations();
  return currentLanguage;
}

export function getWhisperLanguage() {
  return currentLanguage === 'de' ? 'german' : 'english';
}
