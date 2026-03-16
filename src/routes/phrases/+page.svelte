<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { page } from "$app/state";
  import "../../styles/main.css";
  import { t as _t, getUiLang, initI18n, onUiLangChange } from "../../i18n.js";
  import type { SupportedLanguage, Phrase, IPA } from "../../types.js";
  import { getAllPhrases } from "../../utils/random.js";
  import { preloadPhrases } from "../../utils/phrase-loader.js";
  import type { StudyLanguage } from "../../study-lang.js";
  import { SUPPORTED_STUDY_LANGS } from "../../study-lang.js";
  import { playPhraseAudio } from "../../speech/phrase-audio.js";

  let uiLang = $state<SupportedLanguage>(getUiLang());
  function t(key: string, vars: Record<string, string | number> = {}): string {
    void uiLang;
    return _t(key, vars);
  }

  const unsubUiLang = onUiLangChange((lang) => {
    uiLang = lang;
  });

  onDestroy(() => {
    unsubUiLang();
  });

  // --- Data model ---
  type LangEntry = { phrase: string; ipas: string[] };
  type PhraseGroup = {
    enKey: string;
    emoji: string;
    langs: Partial<Record<StudyLanguage, LangEntry>>;
  };

  // Build cross-language groups (loaded asynchronously in onMount)
  async function buildGroups(): Promise<PhraseGroup[]> {
    const groupMap = new Map<string, PhraseGroup>();

    for (const lang of SUPPORTED_STUDY_LANGS) {
      for (const phrase of await getAllPhrases(lang)) {
        const enKey = lang === "en-GB" ? phrase.phrase : (phrase["en-GB"] ?? phrase.phrase);
        if (!groupMap.has(enKey)) {
          groupMap.set(enKey, { enKey, emoji: phrase.emoji, langs: {} });
        }
        const group = groupMap.get(enKey)!;
        group.langs[lang] = {
          phrase: phrase.phrase,
          ipas: phrase.ipas.map((i) => i.ipa),
        };
      }
    }

    return [...groupMap.values()].sort((a, b) =>
      a.enKey.localeCompare(b.enKey, "en", { sensitivity: "base" }),
    );
  }

  let allGroups = $state<PhraseGroup[]>([]);

  // --- URL param helpers ---
  function parseUrlLangs(): Set<StudyLanguage> {
    const p = page.url.searchParams.get("langs");
    if (!p) return new Set(SUPPORTED_STUDY_LANGS);
    const parsed = p
      .split(",")
      .filter((l): l is StudyLanguage => (SUPPORTED_STUDY_LANGS as readonly string[]).includes(l));
    return parsed.length > 0 ? new Set(parsed) : new Set(SUPPORTED_STUDY_LANGS);
  }

  function syncUrl() {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (selectedLangs.size < SUPPORTED_STUDY_LANGS.length) {
      params.set("langs", [...SUPPORTED_STUDY_LANGS].filter((l) => selectedLangs.has(l)).join(","));
    }
    if (searchText) params.set("q", searchText);
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      "",
      query ? `?${query}` : window.location.pathname,
    );
  }

  // --- Filtering state ---
  let selectedLangs = $state<Set<StudyLanguage>>(parseUrlLangs());
  let searchText = $state(page.url.searchParams.get("q") ?? "");

  $effect(() => {
    void selectedLangs;
    void searchText;
    syncUrl();
  });
  let visibleCount = $state(100);

  function toggleLang(lang: StudyLanguage) {
    const next = new Set(selectedLangs);
    if (next.has(lang)) {
      if (next.size > 1) next.delete(lang);
    } else {
      next.add(lang);
    }
    selectedLangs = next;
  }

  // Ordered list of selected langs (stable order)
  const orderedLangs: StudyLanguage[] = SUPPORTED_STUDY_LANGS;

  // --- Filtered and searched groups ---
  const filteredGroups = $derived.by(() => {
    const query = searchText.trim().toLowerCase();
    const langs = selectedLangs;

    return allGroups.filter((g) => {
      // Must have at least one selected lang
      const hasLang = [...langs].some((l) => g.langs[l]);
      if (!hasLang) return false;

      // Text search: icontains across phrase texts of selected langs
      if (query) {
        const matchesEmoji = g.emoji.includes(query);
        const matchesPhrase = [...langs].some((l) => {
          const entry = g.langs[l];
          return entry && entry.phrase.toLowerCase().includes(query);
        });
        if (!matchesEmoji && !matchesPhrase) return false;
      }

      return true;
    });
  });

  const visibleGroups = $derived(filteredGroups.slice(0, visibleCount));

  // Reset visible count when filter changes
  $effect(() => {
    void filteredGroups;
    visibleCount = 100;
  });

  // --- Infinite scroll ---
  let sentinel: HTMLDivElement | null = null;
  let observer: IntersectionObserver | null = null;

  onMount(() => {
    initI18n();
    uiLang = getUiLang();

    void (async () => {
      await Promise.all(SUPPORTED_STUDY_LANGS.map((lang) => preloadPhrases(lang)));
      allGroups = await buildGroups();
    })();

    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          visibleCount = Math.min(visibleCount + 100, filteredGroups.length);
        }
      },
      { rootMargin: "200px" },
    );

    if (sentinel) observer.observe(sentinel);

    return () => observer?.disconnect();
  });

  $effect(() => {
    if (observer && sentinel) {
      observer.disconnect();
      observer.observe(sentinel);
    }
  });

  // --- Audio playback ---
  async function playAudio(group: PhraseGroup, lang: StudyLanguage) {
    const entry = group.langs[lang]!;
    const phrase: Phrase = {
      phrase: entry.phrase,
      emoji: group.emoji,
      ipas: entry.ipas.map((ipa): IPA => ({ ipa, source: "" })),
      "en-GB": lang === "en-GB" ? undefined : group.enKey,
    };
    await playPhraseAudio(phrase, lang, "edge-tts-male");
  }

  // --- Feedback ---
  type FeedbackTarget = { phrase: string; lang: StudyLanguage };
  let feedbackTarget = $state<FeedbackTarget | null>(null);
  let feedbackText = $state("");
  let feedbackStatus = $state<"idle" | "sending" | "sent" | "error">("idle");

  function openFeedback(group: PhraseGroup, lang: StudyLanguage) {
    feedbackTarget = { phrase: group.langs[lang]!.phrase, lang };
    feedbackText = "";
    feedbackStatus = "idle";
  }

  function closeFeedback() {
    feedbackTarget = null;
  }

  async function submitFeedback() {
    if (!feedbackTarget || !feedbackText.trim()) return;
    feedbackStatus = "sending";
    const formData = new FormData();
    formData.set("phrase", feedbackTarget.phrase);
    formData.set("studyLang", feedbackTarget.lang);
    formData.set("uiLang", uiLang);
    formData.set("text", feedbackText.trim());
    try {
      const res = await fetch("/api/feedback", { method: "POST", body: formData });
      feedbackStatus = res.ok ? "sent" : "error";
    } catch {
      feedbackStatus = "error";
    }
  }

  const LANG_LABELS: Record<StudyLanguage, string> = {
    "de-DE": "Deutsch",
    "en-GB": "English",
    "fr-FR": "Français",
    "it-IT": "Italiano",
    "es-ES": "Español",
  };
</script>

<svelte:head>
  <title>{t("phrases.title")} – Phoneme Party</title>
</svelte:head>

<div class="phrases-page container py-3">
  <h1 class="mb-3">{t("phrases.title")}</h1>

  <!-- Controls -->
  <div class="controls mb-3 d-flex flex-wrap gap-3 align-items-center">
    <!-- Language filter -->
    <div class="lang-filters d-flex gap-2 flex-wrap">
      {#each orderedLangs as lang (lang)}
        <label class="lang-checkbox" class:active={selectedLangs.has(lang)}>
          <input
            type="checkbox"
            checked={selectedLangs.has(lang)}
            onchange={() => toggleLang(lang)}
          />
          {LANG_LABELS[lang]}
        </label>
      {/each}
    </div>

    <!-- Search -->
    <div class="search-box flex-grow-1">
      <input
        type="search"
        class="form-control"
        placeholder={t("phrases.search_placeholder")}
        bind:value={searchText}
      />
    </div>
  </div>

  <!-- Count -->
  <p class="text-muted small mb-2">
    {t("phrases.count", { count: filteredGroups.length })}
  </p>

  <!-- Table -->
  <div class="table-wrapper">
    <table class="phrases-table">
      <thead>
        <tr>
          <th class="col-emoji">{t("phrases.col_symbol")}</th>
          <th class="col-phrase">{t("phrases.col_phrase")}</th>
          <th class="col-ipa">{t("phrases.col_ipa")}</th>
        </tr>
      </thead>
      <tbody>
        {#each visibleGroups as group (group.enKey)}
          {@const activeLangs = orderedLangs.filter((l) => selectedLangs.has(l) && group.langs[l])}
          {#if activeLangs.length > 0}
            {#each activeLangs as lang, i (lang)}
              <tr class:group-first={i === 0} class:group-last={i === activeLangs.length - 1}>
                {#if i === 0}
                  <td class="col-emoji emoji-cell" rowspan={activeLangs.length}>
                    {group.emoji}
                  </td>
                {/if}
                <td class="col-phrase">
                  <span class="lang-tag">{lang}</span>
                  {group.langs[lang]!.phrase}
                  <button
                    class="play-btn"
                    onclick={() => playAudio(group, lang)}
                    title="Play audio"
                    aria-label="Play audio">▶</button
                  ><button
                    class="feedback-btn"
                    onclick={() => openFeedback(group, lang)}
                    title="Submit feedback"
                    aria-label="Submit feedback">✎</button
                  >
                </td>
                <td class="col-ipa">
                  {#each group.langs[lang]!.ipas as ipa (ipa)}
                    <span class="ipa-text">{ipa}</span>
                  {/each}
                </td>
              </tr>
            {/each}
          {/if}
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Sentinel for infinite scroll -->
  <div bind:this={sentinel} class="scroll-sentinel"></div>

  {#if visibleCount < filteredGroups.length}
    <p class="text-center text-muted py-3">{t("phrases.loading_more")}</p>
  {/if}
</div>

{#if feedbackTarget}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="feedback-overlay" onclick={closeFeedback}>
    <div class="feedback-modal" onclick={(e) => e.stopPropagation()}>
      <h6 class="mb-2">Feedback for "<em>{feedbackTarget.phrase}</em>" ({feedbackTarget.lang})</h6>
      {#if feedbackStatus === "sent"}
        <p class="text-success mb-2">Thank you for your feedback!</p>
        <button class="btn btn-sm btn-secondary" onclick={closeFeedback}>Close</button>
      {:else}
        <textarea
          class="form-control mb-2"
          rows={3}
          placeholder="Describe the issue (e.g. wrong IPA, incorrect translation…)"
          bind:value={feedbackText}
          disabled={feedbackStatus === "sending"}
        ></textarea>
        {#if feedbackStatus === "error"}
          <p class="text-danger small mb-2">Failed to send. Please try again.</p>
        {/if}
        <div class="d-flex gap-2 justify-content-end">
          <button
            class="btn btn-sm btn-secondary"
            onclick={closeFeedback}
            disabled={feedbackStatus === "sending"}>Cancel</button
          >
          <button
            class="btn btn-sm btn-primary"
            onclick={submitFeedback}
            disabled={!feedbackText.trim() || feedbackStatus === "sending"}
            >{feedbackStatus === "sending" ? "Sending…" : "Send"}</button
          >
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .phrases-page {
    max-width: 900px;
    margin: 0 auto;
  }

  .lang-checkbox {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.75rem;
    border-radius: 20px;
    border: 1px solid #dee2e6;
    background: #f8f9fa;
    cursor: pointer;
    font-size: 0.875rem;
    user-select: none;
    transition: background 0.15s;
  }

  .lang-checkbox input {
    margin: 0;
  }

  .lang-checkbox.active {
    background: #0d6efd;
    color: #fff;
    border-color: #0d6efd;
  }

  .search-box {
    min-width: 200px;
  }

  .table-wrapper {
    overflow-x: auto;
  }

  .phrases-table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .phrases-table thead th {
    background: #f8f9fa;
    padding: 0.6rem 0.75rem;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6c757d;
    border-bottom: 2px solid #dee2e6;
    text-align: left;
  }

  .phrases-table tbody tr {
    border-bottom: 1px solid #f0f0f0;
  }

  .phrases-table tbody tr.group-first td {
    border-top: 2px solid #dee2e6;
  }

  .phrases-table tbody tr:first-child.group-first td {
    border-top: none;
  }

  .phrases-table tbody td {
    padding: 0.4rem 0.75rem;
    vertical-align: middle;
    font-size: 0.9rem;
  }

  .emoji-cell {
    font-size: 1.6rem;
    text-align: center;
    width: 3rem;
    vertical-align: middle;
    border-right: 1px solid #dee2e6;
  }

  .lang-tag {
    display: inline-block;
    font-size: 0.65rem;
    color: #6c757d;
    background: #f0f0f0;
    border-radius: 3px;
    padding: 0 4px;
    margin-right: 0.4rem;
    font-family: monospace;
    vertical-align: middle;
  }

  .play-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 0.4rem;
    padding: 0;
    width: 1.4rem;
    height: 1.4rem;
    font-size: 0.6rem;
    line-height: 1;
    border: 1px solid #dee2e6;
    border-radius: 50%;
    background: #f8f9fa;
    color: #495057;
    cursor: pointer;
    vertical-align: middle;
    transition: background 0.15s;
  }

  .play-btn:hover {
    background: #0d6efd;
    color: #fff;
    border-color: #0d6efd;
  }

  .ipa-text {
    display: block;
    font-family: "Noto Serif", serif;
    color: #495057;
    font-size: 0.85rem;
  }

  .scroll-sentinel {
    height: 1px;
  }

  .feedback-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-left: 0.25rem;
    padding: 0;
    width: 1.4rem;
    height: 1.4rem;
    font-size: 0.75rem;
    line-height: 1;
    border: 1px solid #dee2e6;
    border-radius: 50%;
    background: #f8f9fa;
    color: #6c757d;
    cursor: pointer;
    vertical-align: middle;
    transition: background 0.15s;
  }

  .feedback-btn:hover {
    background: #ffc107;
    color: #000;
    border-color: #ffc107;
  }

  .feedback-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .feedback-modal {
    background: #fff;
    border-radius: 8px;
    padding: 1.25rem;
    width: min(420px, 90vw);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  }
</style>
