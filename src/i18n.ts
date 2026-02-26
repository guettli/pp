import type { SupportedLanguage } from "./types.js";

const STORAGE_KEY = "phoneme-party-language";
const SUPPORTED_UI_LANGS: SupportedLanguage[] = ["de", "en", "fr"];
const GERMAN_REGIONS = new Set(["de", "at", "ch"]);
const FRENCH_REGIONS = new Set(["fr", "be", "lu"]);

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
    "language.fr": "Französisch",
    "ui-lang.label": "Oberfläche:",
    "ui-lang.auto": "Auto",
    "study-lang.label": "Lernsprache:",
    "study-lang.choose": "— Auswählen —",
    "study-lang.en-GB": "Englisch (Britisch)",
    "study-lang.de": "Deutsch",
    "study-lang.fr-FR": "Französisch",
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
    "loading.status.loading_from_cache": "Modell wird aus lokalem Cache geladen...",
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
    "buttons.download_recording": "Aufnahme herunterladen",
    "buttons.see_all_ipa": "Alle IPA-Symbole ansehen",
    "ipa.title": "IPA-Symbole",
    "ipa.subtitle": "Alle vom Modell erkannten Lautzeichen",
    "ipa.loading": "Lade Symbole...",
    "ipa.error": "Symbole konnten nicht geladen werden.",
    "ipa.category.consonants": "Konsonanten",
    "ipa.category.vowels": "Vokale",
    "ipa.category.diphthongs": "Diphthonge",
    "ipa.category.modifiers": "Modifikatoren",
    "ipa.category.other": "Weitere Zeichen",
    "ipa.back": "← Zurück",
    "ipa.no_explanation": "(keine Erklärung)",
    "ipa.symbols_count": "{count} Symbole",
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
    "footer.webgpu_status_active": "WebGPU: aktiv (shader-f16)",
    "footer.webgpu_status_unavailable": "WebGPU: nicht verfügbar → WASM",
    "footer.webgpu_status_fallback": "WebGPU: aus ({backend})",
    "footer.webgpu_status_available": "WebGPU: verfügbar",
    "footer.webgpu_status_no_shader_f16": "WebGPU: kein shader-f16 → WASM",
    "footer.webgpu_status_disabled_manual": "WebGPU: deaktiviert → WASM",
    "footer.webgpu_status_validation_failed": "WebGPU: Validierung fehlgeschlagen → WASM",
    "footer.disable_webgpu": "WebGPU deaktivieren",
    "footer.enable_webgpu": "WebGPU aktivieren",
    "footer.device_details": "Gerätedetails",
    "footer.device_details_title": "Gerätedetails für Fehlerbericht",
    "footer.device_details_help":
      "Diese Informationen beim Einreichen eines Fehlerberichts kopieren.",
    "footer.copy": "Kopieren",
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
    "level.stats_subtitle": "Basierend auf letzter Leistung",
    "level.mastered": "{mastered}/{total} gemeistert (≥95%)",
    "processing.analyzing": "Analysiere...",
    "voice.offline": "Offline",
    "voice.online": "Online",
  },
  en: {
    "app.title": "Phoneme Party - Pronunciation Practice",
    "header.title": "Phoneme Party",
    "header.subtitle": "Practice English pronunciation with AI",
    "language.label": "Language:",
    "language.de": "German",
    "language.en": "English",
    "language.fr": "French",
    "ui-lang.label": "Interface:",
    "ui-lang.auto": "Auto",
    "study-lang.label": "Study language:",
    "study-lang.choose": "— Choose —",
    "study-lang.en-GB": "English (British)",
    "study-lang.de": "German",
    "study-lang.fr-FR": "French",
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
    "loading.status.loading_from_cache": "Loading model from local cache...",
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
    "buttons.download_recording": "Download recording",
    "buttons.see_all_ipa": "See all IPA symbols",
    "ipa.title": "IPA Symbols",
    "ipa.subtitle": "All phonemes recognized by the model",
    "ipa.loading": "Loading symbols...",
    "ipa.error": "Could not load symbols.",
    "ipa.category.consonants": "Consonants",
    "ipa.category.vowels": "Vowels",
    "ipa.category.diphthongs": "Diphthongs",
    "ipa.category.modifiers": "Modifiers",
    "ipa.category.other": "Other symbols",
    "ipa.back": "← Back",
    "ipa.no_explanation": "(no explanation)",
    "ipa.symbols_count": "{count} symbols",
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
    "footer.webgpu_status_active": "WebGPU: active (shader-f16)",
    "footer.webgpu_status_unavailable": "WebGPU: unavailable → WASM",
    "footer.webgpu_status_fallback": "WebGPU: off ({backend})",
    "footer.webgpu_status_available": "WebGPU: available",
    "footer.webgpu_status_no_shader_f16": "WebGPU: no shader-f16 → WASM",
    "footer.webgpu_status_disabled_manual": "WebGPU: disabled → WASM",
    "footer.webgpu_status_validation_failed": "WebGPU: validation failed → WASM",
    "footer.disable_webgpu": "Disable WebGPU",
    "footer.enable_webgpu": "Enable WebGPU",
    "footer.device_details": "Device details",
    "footer.device_details_title": "Device Details for Bug Report",
    "footer.device_details_help": "Copy this information when filing a bug report.",
    "footer.copy": "Copy",
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
    "level.stats_subtitle": "Based on recent performance",
    "level.mastered": "{mastered}/{total} mastered (≥95%)",
    "processing.analyzing": "Analyzing...",
    "voice.offline": "Offline",
    "voice.online": "Online",
  },
  fr: {
    "app.title": "Phonème Party - Entraînement à la prononciation",
    "header.title": "Phonème Party",
    "header.subtitle": "Entraîne ta prononciation avec l'IA",
    "language.label": "Langue :",
    "language.de": "Allemand",
    "language.en": "Anglais",
    "language.fr": "Français",
    "ui-lang.label": "Interface :",
    "ui-lang.auto": "Auto",
    "study-lang.label": "Langue étudiée :",
    "study-lang.choose": "— Choisir —",
    "study-lang.en-GB": "Anglais (britannique)",
    "study-lang.de": "Allemand",
    "study-lang.fr-FR": "Français",
    "console.title": "Console",
    "console.copy": "Copier",
    "console.clear": "Effacer",
    "console.copy_title": "Copier dans le presse-papiers",
    "console.clear_title": "Effacer la console",
    "console.copy_success": "Copié !",
    "console.copy_failed": "Échec",
    "loading.hidden_label": "Chargement...",
    "loading.initializing": "Initialisation...",
    "loading.description":
      "Téléchargement du modèle IA multilingue. Cela peut prendre un moment au premier démarrage.",
    "loading.status.initiate": "Démarrage du téléchargement : {file}",
    "loading.status.download": "Téléchargement de {file}... {percent}%",
    "loading.status.done": "{file} téléchargé",
    "loading.status.progress": "Chargement de {file}... {percent}%",
    "loading.status.downloading_model": "Téléchargement de {name}... {size}",
    "loading.status.loading_from_cache": "Chargement du modèle depuis le cache local...",
    "loading.status.loading_model": "Chargement du modèle en mémoire...",
    "loading.status.retrying": "Échec du téléchargement, nouvelle tentative {attempt}/{max}...",
    "loading.status.ready": "Prêt !",
    "loading.status.fallback": "{status}",
    "record.hold": "Cliquer pour enregistrer",
    "record.recording": "Enregistrement...",
    "record.processing": "Traitement... {percent}%",
    "record.processing_plain": "Traitement...",
    "processing.debug_title": "Détails du traitement",
    "processing.meta_model_load": "Temps de chargement du modèle",
    "processing.meta_audio_duration": "Durée audio",
    "processing.meta_asr_chunks": "Fragments ASR (estimés)",
    "processing.meta_backend": "Backend",
    "processing.meta_level": "Niveau",
    "processing.meta_realtime": "Détection en temps réel",
    "processing.step_prepare": "Préparation audio",
    "processing.step_transcribe": "Reconnaissance vocale",
    "processing.step_ipa": "Conversion IPA",
    "processing.step_phonemes": "Extraction des phonèmes",
    "processing.step_score": "Évaluation de la prononciation",
    "processing.step_total": "Total",
    "record.permission_title": "Accès au microphone requis",
    "record.permission_body":
      "Veuillez autoriser l'accès au microphone dans le navigateur, puis appuyer à nouveau sur le bouton.",
    "record.too_short_title": "Enregistrement trop court !",
    "record.too_short_body":
      "Cliquez sur le bouton et parlez pour enregistrer votre prononciation. Cliquez à nouveau pour arrêter.",
    "buttons.next_phrase": "Suivant ->",
    "buttons.close": "Fermer",
    "buttons.press_to_play": "Appuyer pour jouer",
    "buttons.download_recording": "Télécharger l'enregistrement",
    "buttons.see_all_ipa": "Voir tous les symboles IPA",
    "ipa.title": "Symboles IPA",
    "ipa.subtitle": "Tous les phonèmes reconnus par le modèle",
    "ipa.loading": "Chargement des symboles...",
    "ipa.error": "Impossible de charger les symboles.",
    "ipa.category.consonants": "Consonnes",
    "ipa.category.vowels": "Voyelles",
    "ipa.category.diphthongs": "Diphtongues",
    "ipa.category.modifiers": "Modificateurs",
    "ipa.category.other": "Autres symboles",
    "ipa.back": "← Retour",
    "ipa.no_explanation": "(pas d'explication)",
    "ipa.symbols_count": "{count} symboles",
    "feedback.title": "Ta prononciation",
    "feedback.target_phrase_label": "Cible :",
    "feedback.target_ipa_label": "Cible :",
    "feedback.your_ipa_label": "Ton IPA :",
    "feedback.phrase_not_in_vocab": "(Non dans le vocabulaire)",
    "feedback.phoneme_analysis": "Analyse des phonèmes :",
    "feedback.phoneme_similarity": "Similarité des phonèmes :",
    "feedback.distance": "Distance",
    "feedback.phoneme_match": "Correspondance",
    "feedback.play_target": "Jouer la prononciation cible",
    "feedback.speech_not_supported": "(Synthèse vocale non disponible)",
    "feedback.ipa_help": "Que signifient ces symboles ?",
    "feedback.no_ipa_help": "Aucun mot trouvé.",
    "score.excellent": "Excellent !",
    "score.good": "Bien !",
    "score.fair": "Passable",
    "score.try_again": "Réessayer",
    "score.message.excellent": "Prononciation parfaite ! Bravo !",
    "score.message.good": "Très proche ! Continue à pratiquer !",
    "score.message.fair": "Tu progresses ! Essaie encore !",
    "score.message.try_again": "Pratiquons encore cette phrase.",
    "processing.label": "Traitement...",
    "footer.powered_by": "Propulsé par",
    "footer.local_processing": "Tout le traitement se fait localement dans ton navigateur",
    "footer.webgpu_status_checking": "WebGPU : vérification...",
    "footer.webgpu_status_active": "WebGPU : actif (shader-f16)",
    "footer.webgpu_status_unavailable": "WebGPU : indisponible → WASM",
    "footer.webgpu_status_fallback": "WebGPU : désactivé ({backend})",
    "footer.webgpu_status_available": "WebGPU : disponible",
    "footer.webgpu_status_no_shader_f16": "WebGPU : pas de shader-f16 → WASM",
    "footer.webgpu_status_disabled_manual": "WebGPU : désactivé → WASM",
    "footer.webgpu_status_validation_failed": "WebGPU : validation échouée → WASM",
    "footer.disable_webgpu": "Désactiver WebGPU",
    "footer.enable_webgpu": "Activer WebGPU",
    "footer.device_details": "Détails de l'appareil",
    "footer.device_details_title": "Détails de l'appareil pour le rapport de bug",
    "footer.device_details_help": "Copiez ces informations lors du dépôt d'un rapport de bug.",
    "footer.copy": "Copier",
    "footer.attribution": "Attributions",
    "errors.title": "Erreur",
    "errors.message_label": "Message :",
    "errors.unknown": "Erreur inconnue",
    "errors.no_stack": "Pas de trace de pile disponible",
    "errors.show_details": "Afficher les détails complets de l'erreur",
    "errors.reload": "Recharger la page",
    "history.title": "Historique d'entraînement",
    "history.loading": "Chargement...",
    "history.empty": "Pas encore d'historique. Commence à pratiquer !",
    "history.score": "Score",
    "history.time": "il y a {time}",
    "level.title": "Ton niveau",
    "level.label": "Difficulté : {level}/1000",
    "level.description": "Ton niveau sera automatiquement ajusté en fonction de tes performances",
    "level.actual": "Niveau réel : {level}",
    "level.change_confirm":
      "Veux-tu vraiment passer du niveau {oldLevel} à {newLevel} ? Une nouvelle phrase sera chargée.",
    "level.stats_subtitle": "Basé sur les performances récentes",
    "level.mastered": "{mastered}/{total} maîtrisé(s) (≥95%)",
    "processing.analyzing": "Analyse...",
    "voice.offline": "Hors ligne",
    "voice.online": "En ligne",
  },
};

type UiLangChangeListener = (uiLang: SupportedLanguage) => void;

let currentUiLang: SupportedLanguage = resolveInitialUiLang();
const listeners = new Set<UiLangChangeListener>();

function resolveInitialUiLang(): SupportedLanguage {
  // First check query string
  if (typeof window !== "undefined" && window.location) {
    const params = new URLSearchParams(window.location.search);
    const uiLangParam = params.get("lang");
    if (uiLangParam && SUPPORTED_UI_LANGS.includes(uiLangParam as SupportedLanguage)) {
      return uiLangParam as SupportedLanguage;
    }
  }
  // Then check localStorage
  const stored = safeGetStorage(STORAGE_KEY);
  if (stored && SUPPORTED_UI_LANGS.includes(stored as SupportedLanguage)) {
    return stored as SupportedLanguage;
  }
  return detectUiLangFromLocale();
}

function detectUiLangFromLocale(): SupportedLanguage {
  const locales =
    Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];

  for (const locale of locales) {
    if (!locale) continue;
    const normalized = locale.toLowerCase().replace("_", "-");
    const [tag, region] = normalized.split("-");
    if (tag === "de" || (region && GERMAN_REGIONS.has(region))) {
      return "de";
    }
    if (tag === "fr" || (region && FRENCH_REGIONS.has(region))) {
      return "fr";
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

function safeRemoveStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function t(key: string, variables: Record<string, string | number> = {}): string {
  const langTable = translations[currentUiLang] || translations.en;
  const template = langTable[key] || translations.en[key] || key;
  return Object.keys(variables).reduce((result, varKey) => {
    const value = variables[varKey];
    return result.replaceAll(`{${varKey}}`, String(value));
  }, template);
}

export function getUiLang(): SupportedLanguage {
  return currentUiLang;
}

export function isUiLangAuto(): boolean {
  return safeGetStorage(STORAGE_KEY) === null;
}

export function setUiLang(value: "auto" | SupportedLanguage): void {
  if (value === "auto") {
    safeRemoveStorage(STORAGE_KEY);
    const detected = detectUiLangFromLocale();
    if (detected !== currentUiLang) {
      currentUiLang = detected;
      applyTranslations();
      listeners.forEach((l) => l(currentUiLang));
    }
  } else {
    setUiLangValue(value);
  }
}

function setUiLangValue(uiLang: string): void {
  const normalized = SUPPORTED_UI_LANGS.includes(uiLang as SupportedLanguage)
    ? (uiLang as SupportedLanguage)
    : "en";
  if (normalized === currentUiLang) return;
  currentUiLang = normalized;
  safeSetStorage(STORAGE_KEY, normalized);
  applyTranslations();
  listeners.forEach((listener) => listener(currentUiLang));
}

export function onUiLangChange(listener: UiLangChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function applyTranslations(root: Document | Element = document): void {
  if (!root) return;
  if (document?.documentElement) {
    document.documentElement.lang = currentUiLang;
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
  return currentUiLang;
}
