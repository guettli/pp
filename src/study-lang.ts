import type { StudyLanguage, SupportedLanguage } from "./types.js";
export type { StudyLanguage };

const STUDY_LANG_KEY = "phoneme-party-study-lang";
export const SUPPORTED_STUDY_LANGS: StudyLanguage[] = ["en-GB", "de"];

type StudyLangChangeListener = (studyLang: StudyLanguage) => void;

const listeners = new Set<StudyLangChangeListener>();

let currentStudyLang: StudyLanguage | null = resolveInitialStudyLang();

function resolveInitialStudyLang(): StudyLanguage | null {
  if (typeof window !== "undefined" && window.location) {
    const params = new URLSearchParams(window.location.search);
    const param = params.get("lang");
    if (param && SUPPORTED_STUDY_LANGS.includes(param as StudyLanguage)) {
      return param as StudyLanguage;
    }
  }
  try {
    const stored = window.localStorage.getItem(STUDY_LANG_KEY);
    if (stored && SUPPORTED_STUDY_LANGS.includes(stored as StudyLanguage)) {
      return stored as StudyLanguage;
    }
  } catch {
    // ignore
  }
  return null;
}

export function getStudyLang(): StudyLanguage | null {
  return currentStudyLang;
}

export function setStudyLang(studyLang: StudyLanguage): void {
  if (studyLang === currentStudyLang) return;
  currentStudyLang = studyLang;
  try {
    window.localStorage.setItem(STUDY_LANG_KEY, studyLang);
  } catch {
    // ignore
  }
  listeners.forEach((l) => l(studyLang));
}

export function onStudyLangChange(listener: StudyLangChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Map study language to the phrase list key used internally. */
export function studyLangToPhraseLang(studyLang: StudyLanguage): SupportedLanguage {
  return studyLang === "en-GB" ? "en" : "de";
}
