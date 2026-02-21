import type { SupportedLanguage } from "./types.js";

const STORAGE_KEY = "phoneme-party-language";
const SUPPORTED_LANGUAGES: SupportedLanguage[] = ["de", "en"];
const GERMAN_REGIONS = new Set(["de", "at", "ch"]);

type TranslationTable = Record<string, string>;
type Translations = Record<SupportedLanguage, TranslationTable>;

const translations: Translations = {
  de: {
    "app.title": "Phoneme Party - Aussprachetraining",
    "header.title": "Phoneme Party",
    "header.subtitle": "Übe deutsche Aussprache mit KI",
    "language.label": "Sprache:",
    "language.de": "Deutsch",
    "language.en": "Englisch",
    "console.title": "Konsolen-Ausgabe",
    "console.copy": "Kopieren",
    "console.clear": "Leeren",
    "console.copy_title": "In die Zwischenablage kopieren",
    "console.clear_title": "Konsole leeren",
    "console.copy_success": "Kopiert!",
    "console.copy_failed": "Fehlgeschlagen",
    "loading.hidden_label": "Laden...",
    "loading.initializing": "Initialisiere...",
    "loading.description":
      "Mehrsprachiges KI-Modell wird geladen. Beim ersten Start kann das etwas dauern.",
    "loading.status.initiate": "Download wird gestartet: {file}",
    "loading.status.download": "{file} wird heruntergeladen... {percent}%",
    "loading.status.done": "{file} heruntergeladen",
    "loading.status.progress": "{file} wird geladen... {percent}%",
    "loading.status.downloading_model": "{name} wird heruntergeladen... {size}",
    "loading.status.loading_model": "Modell wird in den Speicher geladen...",
    "loading.status.retrying": "Download fehlgeschlagen, neuer Versuch {attempt}/{max}...",
    "loading.status.ready": "Bereit!",
    "loading.status.fallback": "{status}",
    "record.hold": "Zum Aufnehmen klicken",
    "record.recording": "Aufnahme...",
    "record.processing": "Verarbeite... {percent}%",
    "record.processing_plain": "Verarbeite...",
    "processing.debug_title": "Verarbeitungsdetails",
    "processing.meta_model_load": "Modell-Startzeit",
    "processing.meta_audio_duration": "Audio-Dauer",
    "processing.meta_asr_chunks": "ASR-Chunks (geschätzt)",
    "processing.meta_backend": "Backend",
    "processing.meta_level": "Level",
    "processing.meta_realtime": "Echtzeit-Erkennung",
    "processing.step_prepare": "Audio-Vorbereitung",
    "processing.step_transcribe": "Spracherkennung",
    "processing.step_ipa": "IPA-Konvertierung",
    "processing.step_phonemes": "Phonem-Extraktion",
    "processing.step_score": "Aussprache-Bewertung",
    "processing.step_total": "Gesamt",
    "record.permission_title": "Mikrofon-Zugriff erforderlich",
    "record.permission_body":
      "Bitte erlaube den Mikrofonzugriff im Browser. Danach den Button erneut drücken.",
    "record.too_short_title": "Aufnahme zu kurz!",
    "record.too_short_body":
      "Bitte klicke auf den Button und sprich, um deine Aussprache aufzunehmen. Klicke erneut zum Beenden.",
    "buttons.next_phrase": "Weiter ->",
    "buttons.close": "Schließen",
    "buttons.press_to_play": "Drücken zum Spielen",
    "feedback.title": "Deine Aussprache",
    "feedback.target_phrase_label": "Ziel:",
    "feedback.target_ipa_label": "Ziel:",
    "feedback.your_ipa_label": "Deins:",
    "feedback.phrase_not_in_vocab": "(Nicht im Wortschatz)",
    "feedback.phoneme_analysis": "Phonem-Analyse:",
    "feedback.phoneme_similarity": "Phonem-Ähnlichkeit:",
    "feedback.distance": "Abstand",
    "feedback.phoneme_match": "Übereinstimmung",
    "feedback.play_target": "Gewünschte Aussprache abspielen",
    "feedback.speech_not_supported": "(Sprachausgabe nicht verfügbar)",
    "feedback.ipa_help": "Was bedeuten diese Zeichen?",
    "feedback.no_ipa_help": "Keine Worte erkannt.",
    "score.excellent": "Ausgezeichnet!",
    "score.good": "Gut!",
    "score.fair": "Mittel",
    "score.try_again": "Nochmal",
    "score.message.excellent": "Perfekte Aussprache! Super gemacht!",
    "score.message.good": "Sehr nah dran! Weiter üben!",
    "score.message.fair": "Wird besser! Versuch es nochmal!",
    "score.message.try_again": "Lass uns das noch mal üben.",
    "processing.label": "Verarbeitung...",
    "footer.powered_by": "Powered by",
    "footer.local_processing": "Alle Verarbeitung findet lokal in deinem Browser statt",
    "footer.webgpu_status_checking": "WebGPU: wird geprüft...",
    "footer.webgpu_status_active": "WebGPU: aktiv",
    "footer.webgpu_status_unavailable": "WebGPU: nicht verfügbar",
    "footer.webgpu_status_fallback": "WebGPU: aus ({backend})",
    "footer.webgpu_status_available": "WebGPU: verfügbar",
    "footer.attribution": "Danksagungen",
    "errors.title": "Fehler",
    "errors.message_label": "Nachricht:",
    "errors.unknown": "Unbekannter Fehler",
    "errors.no_stack": "Kein Stacktrace verfügbar",
    "errors.show_details": "Fehlerdetails anzeigen",
    "errors.reload": "Seite neu laden",
    "history.title": "Trainings-Historie",
    "history.loading": "Lädt mehr...",
    "history.empty": "Noch keine Trainings-Historie. Fang an zu üben!",
    "history.score": "Punkte",
    "history.time": "vor {time}",
    "level.title": "Dein Level",
    "level.label": "Schwierigkeit: {level}/1000",
    "level.description": "Dein Level wird automatisch angepasst basierend auf deiner Leistung",
    "level.actual": "Tatsächliches Level: {level}",
    "level.change_confirm":
      "Möchtest du wirklich von Level {oldLevel} zu {newLevel} wechseln? Eine neue Phrase wird geladen.",
  },
  en: {
    "app.title": "Phoneme Party - Pronunciation Practice",
    "header.title": "Phoneme Party",
    "header.subtitle": "Practice English pronunciation with AI",
    "language.label": "Language:",
    "language.de": "German",
    "language.en": "English",
    "console.title": "Console Output",
    "console.copy": "Copy",
    "console.clear": "Clear",
    "console.copy_title": "Copy to clipboard",
    "console.clear_title": "Clear console",
    "console.copy_success": "Copied!",
    "console.copy_failed": "Failed",
    "loading.hidden_label": "Loading...",
    "loading.initializing": "Initializing...",
    "loading.description":
      "Downloading multilingual AI model. This may take a moment on first load.",
    "loading.status.initiate": "Initiating download: {file}",
    "loading.status.download": "Downloading {file}... {percent}%",
    "loading.status.done": "Downloaded {file}",
    "loading.status.progress": "Loading {file}... {percent}%",
    "loading.status.downloading_model": "Downloading {name}... {size}",
    "loading.status.loading_model": "Loading model into memory...",
    "loading.status.retrying": "Download failed, retrying {attempt}/{max}...",
    "loading.status.ready": "Ready!",
    "loading.status.fallback": "{status}",
    "record.hold": "Click to Record",
    "record.recording": "Recording...",
    "record.processing": "Processing... {percent}%",
    "record.processing_plain": "Processing...",
    "processing.debug_title": "Processing breakdown",
    "processing.meta_model_load": "Model load time",
    "processing.meta_audio_duration": "Audio duration",
    "processing.meta_asr_chunks": "ASR chunks (estimated)",
    "processing.meta_backend": "Backend",
    "processing.meta_level": "Level",
    "processing.meta_realtime": "Real-time detection",
    "processing.step_prepare": "Audio preprocessing",
    "processing.step_transcribe": "Speech recognition",
    "processing.step_ipa": "IPA conversion",
    "processing.step_phonemes": "Phoneme extraction",
    "processing.step_score": "Pronunciation scoring",
    "processing.step_total": "Total",
    "record.permission_title": "Microphone access required",
    "record.permission_body":
      "Please allow microphone access in the browser, then press the button again.",
    "record.too_short_title": "Recording too short!",
    "record.too_short_body":
      "Please click the button and speak to record your pronunciation. Click again to stop.",
    "buttons.next_phrase": "Next ->",
    "buttons.close": "Close",
    "buttons.press_to_play": "Press to Play",
    "feedback.title": "Your Pronunciation",
    "feedback.target_phrase_label": "Target:",
    "feedback.target_ipa_label": "Target:",
    "feedback.your_ipa_label": "Your IPA:",
    "feedback.phrase_not_in_vocab": "(Not in vocabulary)",
    "feedback.phoneme_analysis": "Phoneme Analysis:",
    "feedback.phoneme_similarity": "Phoneme Similarity:",
    "feedback.distance": "Distance",
    "feedback.phoneme_match": "Match",
    "feedback.play_target": "Play desired pronunciation",
    "feedback.speech_not_supported": "(Speech synthesis not available)",
    "feedback.ipa_help": "What do these symbols mean?",
    "feedback.no_ipa_help": "No words found.",
    "score.excellent": "Excellent!",
    "score.good": "Good!",
    "score.fair": "Fair",
    "score.try_again": "Try Again",
    "score.message.excellent": "Perfect pronunciation! You nailed it!",
    "score.message.good": "Very close! Keep practicing!",
    "score.message.fair": "Getting there! Try again!",
    "score.message.try_again": "Lets practice this phrase more.",
    "processing.label": "Processing...",
    "footer.powered_by": "Powered by",
    "footer.local_processing": "All processing happens locally in your browser",
    "footer.webgpu_status_checking": "WebGPU: checking...",
    "footer.webgpu_status_active": "WebGPU: active",
    "footer.webgpu_status_unavailable": "WebGPU: unavailable",
    "footer.webgpu_status_fallback": "WebGPU: off ({backend})",
    "footer.webgpu_status_available": "WebGPU: available",
    "footer.attribution": "Attribution",
    "errors.title": "Error",
    "errors.message_label": "Message:",
    "errors.unknown": "Unknown error",
    "errors.no_stack": "No stack trace available",
    "errors.show_details": "Show Full Error Details",
    "errors.reload": "Reload Page",
    "history.title": "Training History",
    "history.loading": "Loading more...",
    "history.empty": "No training history yet. Start practicing!",
    "history.score": "Score",
    "history.time": "{time} ago",
    "level.title": "Your Level",
    "level.label": "Difficulty: {level}/1000",
    "level.description": "Your level will be automatically adjusted based on your performance",
    "level.actual": "Actual level: {level}",
    "level.change_confirm":
      "Do you really want to change from level {oldLevel} to {newLevel}? A new phrase will be loaded.",
  },
};

type LanguageChangeListener = (language: SupportedLanguage) => void;

let currentLanguage: SupportedLanguage = resolveInitialLanguage();
const listeners = new Set<LanguageChangeListener>();

function resolveInitialLanguage(): SupportedLanguage {
  // First check query string
  if (typeof window !== "undefined" && window.location) {
    const params = new URLSearchParams(window.location.search);
    const langParam = params.get("lang");
    if (langParam && SUPPORTED_LANGUAGES.includes(langParam as SupportedLanguage)) {
      return langParam as SupportedLanguage;
    }
  }
  // Then check localStorage
  const stored = safeGetStorage(STORAGE_KEY);
  if (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {
    return stored as SupportedLanguage;
  }
  return detectLanguageFromLocale();
}

function detectLanguageFromLocale(): SupportedLanguage {
  const locales =
    Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];

  for (const locale of locales) {
    if (!locale) continue;
    const normalized = locale.toLowerCase().replace("_", "-");
    const [language, region] = normalized.split("-");
    if (language === "de" || (region && GERMAN_REGIONS.has(region))) {
      return "de";
    }
  }

  return "en";
}

function safeGetStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors (private mode or blocked storage).
  }
}

export function t(key: string, variables: Record<string, string | number> = {}): string {
  const langTable = translations[currentLanguage] || translations.en;
  const template = langTable[key] || translations.en[key] || key;
  return Object.keys(variables).reduce((result, varKey) => {
    const value = variables[varKey];
    return result.replaceAll(`{${varKey}}`, String(value));
  }, template);
}

export function getLanguage(): SupportedLanguage {
  return currentLanguage;
}

export function setLanguage(language: string): void {
  const normalized = SUPPORTED_LANGUAGES.includes(language as SupportedLanguage)
    ? (language as SupportedLanguage)
    : "en";
  if (normalized === currentLanguage) return;
  currentLanguage = normalized;
  safeSetStorage(STORAGE_KEY, normalized);
  applyTranslations();
  listeners.forEach((listener) => listener(currentLanguage));
}

export function onLanguageChange(listener: LanguageChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function applyTranslations(root: Document | Element = document): void {
  if (!root) return;
  if (document?.documentElement) {
    document.documentElement.lang = currentLanguage;
  }
  if (document?.title) {
    document.title = t("app.title");
  }

  const elements = root.querySelectorAll("[data-i18n]");
  elements.forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    el.textContent = t(key);

    const attrList = el.getAttribute("data-i18n-attr");
    if (attrList) {
      attrList
        .split(",")
        .map((attr) => attr.trim())
        .filter(Boolean)
        .forEach((attr) => {
          const [attrName, attrKey] = attr.split(":").map((part) => part.trim());
          el.setAttribute(attrName, t(attrKey || key));
        });
    }
  });
}

export function initI18n(): SupportedLanguage {
  applyTranslations();
  return currentLanguage;
}
