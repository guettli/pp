<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getStudyLang, setStudyLang, type StudyLanguage } from "../../study-lang.js";
  import {
    getUiLang,
    isUiLangAuto,
    setUiLang,
    t as _t,
    onUiLangChange,
    initI18n,
  } from "../../i18n.js";
  import {
    getAvailableVoices,
    RANDOM_VOICE_NAME,
    type VoiceOption,
  } from "../../speech/phrase-audio.js";
  import { db } from "../../db.js";
  import type { SupportedLanguage } from "../../types.js";
  import "../../styles/main.css";

  let uiLang = $state<SupportedLanguage>(getUiLang());
  function t(key: string, vars: Record<string, string | number> = {}): string {
    void uiLang;
    return _t(key, vars);
  }

  let studyLangValue = $state(getStudyLang() ?? "");
  let uiLangValue = $state(isUiLangAuto() ? "auto" : getUiLang());
  let availableVoices = $state<VoiceOption[]>([]);
  let selectedVoiceName = $state(RANDOM_VOICE_NAME);
  let saved = $state(false);

  const unsubUiLang = onUiLangChange((lang) => {
    uiLang = lang;
  });

  onMount(async () => {
    initI18n();
    uiLang = getUiLang();
    const sl = getStudyLang();
    if (sl) {
      availableVoices = getAvailableVoices(sl);
      const savedVoice = await db.getPreferredVoice(sl);
      selectedVoiceName =
        savedVoice &&
        (savedVoice === RANDOM_VOICE_NAME || availableVoices.some((v) => v.name === savedVoice))
          ? savedVoice
          : RANDOM_VOICE_NAME;
    }
  });

  onDestroy(() => {
    unsubUiLang();
  });

  async function onStudyLangChange(sl: string) {
    studyLangValue = sl;
    if (sl) {
      availableVoices = getAvailableVoices(sl as StudyLanguage);
      const savedVoice = await db.getPreferredVoice(sl);
      selectedVoiceName =
        savedVoice &&
        (savedVoice === RANDOM_VOICE_NAME || availableVoices.some((v) => v.name === savedVoice))
          ? savedVoice
          : RANDOM_VOICE_NAME;
    } else {
      availableVoices = [];
      selectedVoiceName = RANDOM_VOICE_NAME;
    }
  }

  async function save() {
    if (!studyLangValue) return;
    setStudyLang(studyLangValue as StudyLanguage);
    setUiLang(uiLangValue as "auto" | SupportedLanguage);
    if (selectedVoiceName) {
      await db.savePreferredVoice(studyLangValue as StudyLanguage, selectedVoiceName);
    }
    saved = true;
    setTimeout(() => {
      saved = false;
    }, 2000);

    // Redirect back to origin page if any
    let returnUrl: string | null = null;
    try {
      returnUrl = window.sessionStorage.getItem("settings-return-url");
      if (returnUrl) window.sessionStorage.removeItem("settings-return-url");
    } catch {
      // ignore
    }
    if (returnUrl && !returnUrl.includes("/settings")) {
      window.location.href = returnUrl;
    }
  }
</script>

<svelte:head>
  <title>{t("settings.title")}</title>
</svelte:head>

<div class="container py-4" style="max-width: 480px">
  <h1 class="mb-4">{t("settings.title")}</h1>

  <div class="mb-3">
    <label for="study-lang-select" class="form-label">{t("study-lang.label")}</label>
    <select
      id="study-lang-select"
      class="form-select"
      value={studyLangValue}
      onchange={(e) => onStudyLangChange((e.target as HTMLSelectElement).value)}
    >
      <option value="">{t("study-lang.choose")}</option>
      <option value="en-GB">{t("study-lang.en-GB")}</option>
      <option value="de-DE">{t("study-lang.de")}</option>
      <option value="fr-FR">{t("study-lang.fr-FR")}</option>
      <option value="it-IT">{t("study-lang.it-IT")}</option>
    </select>
  </div>

  <div class="mb-3">
    <label for="ui-lang-select" class="form-label">{t("ui-lang.label")}</label>
    <select
      id="ui-lang-select"
      class="form-select"
      value={uiLangValue}
      onchange={(e) => {
        uiLangValue = (e.target as HTMLSelectElement).value;
        setUiLang(uiLangValue as "auto" | SupportedLanguage);
      }}
    >
      <option value="auto">{t("ui-lang.auto")}</option>
      <option value="de-DE">{t("language.de")}</option>
      <option value="en-GB">{t("language.en")}</option>
      <option value="fr-FR">{t("language.fr")}</option>
      <option value="it-IT">{t("language.it")}</option>
    </select>
  </div>

  {#if availableVoices.length > 0}
    <div class="mb-3">
      <label for="voice-select" class="form-label">{t("voice.label")}</label>
      <select
        id="voice-select"
        class="form-select"
        value={selectedVoiceName}
        onchange={(e) => {
          selectedVoiceName = (e.target as HTMLSelectElement).value;
        }}
      >
        <option value={RANDOM_VOICE_NAME}>Random</option>
        {#each availableVoices as voice (voice.name)}
          <option value={voice.name}>{voice.label}</option>
        {/each}
      </select>
    </div>
  {/if}

  {#if !studyLangValue}
    <p class="text-danger small mb-3">{t("settings.no-study-lang")}</p>
  {/if}

  <button class="btn btn-primary w-100" onclick={save} disabled={!studyLangValue}>
    {saved ? t("settings.saved") : t("settings.save")}
  </button>

  {#if saved}
    <div class="alert alert-success mt-3">{t("settings.saved")}</div>
  {/if}
</div>
