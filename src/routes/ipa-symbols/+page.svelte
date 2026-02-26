<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import { getUiLang, initI18n, t } from "../../i18n.js";
  import { HF_REPO } from "../../lib/model-config.js";
  import ipaExamples from "../../data/ipa-examples.json";

  type CategoryKey = "consonants" | "vowels" | "diphthongs" | "modifiers";

  interface SymbolEntry {
    symbol: string;
    explanation: string | null;
  }

  interface CategorySection {
    key: CategoryKey;
    labelKey: string;
    symbols: SymbolEntry[];
  }

  let uiLang = $state(getUiLang());
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);
  let sections = $state<CategorySection[]>([]);
  let otherSymbols = $state<SymbolEntry[]>([]);
  let totalCount = $state(0);

  const CATEGORY_LABEL_KEYS: Record<CategoryKey, string> = {
    consonants: "ipa.category.consonants",
    vowels: "ipa.category.vowels",
    diphthongs: "ipa.category.diphthongs",
    modifiers: "ipa.category.modifiers",
  };

  function getExplanation(symbol: string): string | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const examples = ipaExamples as any;
    for (const cat of ["consonants", "vowels", "diphthongs", "modifiers"] as CategoryKey[]) {
      const entry = examples[cat]?.[symbol];
      if (entry) {
        return (entry[uiLang] as string | undefined) ?? (entry["en"] as string | undefined) ?? null;
      }
    }
    return null;
  }

  function getCategoryForSymbol(symbol: string): CategoryKey | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const examples = ipaExamples as any;
    for (const cat of ["consonants", "vowels", "diphthongs", "modifiers"] as CategoryKey[]) {
      if (examples[cat]?.[symbol] !== undefined) return cat;
    }
    return null;
  }

  async function loadSymbols() {
    isLoading = true;
    loadError = null;
    try {
      const vocabUrl = `https://huggingface.co/${HF_REPO}/resolve/main/tokens.txt`;
      const resp = await fetch(vocabUrl);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();

      // Parse tokens.txt: "token id" per line
      const modelTokens = new Set<string>();
      for (const line of text.split("\n")) {
        const parts = line.trim().split(" ");
        if (parts.length === 2) {
          const token = parts[0];
          // Skip special tokens
          if (!token.startsWith("<")) {
            modelTokens.add(token);
          }
        }
      }

      // Build category sections: only model-known symbols from ipa-examples.json
      const usedSymbols = new Set<string>();
      const builtSections: CategorySection[] = [];

      for (const cat of ["consonants", "vowels", "diphthongs", "modifiers"] as CategoryKey[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const catSymbols = (ipaExamples as any)[cat] as Record<
          string,
          { de?: string; en?: string }
        >;
        const entries: SymbolEntry[] = [];
        for (const symbol of Object.keys(catSymbols)) {
          if (modelTokens.has(symbol)) {
            entries.push({ symbol, explanation: getExplanation(symbol) });
            usedSymbols.add(symbol);
          }
        }
        if (entries.length > 0) {
          builtSections.push({ key: cat, labelKey: CATEGORY_LABEL_KEYS[cat], symbols: entries });
        }
      }

      // Any model tokens not in ipa-examples.json
      const other: SymbolEntry[] = [];
      for (const token of modelTokens) {
        if (!usedSymbols.has(token) && getCategoryForSymbol(token) === null) {
          other.push({ symbol: token, explanation: null });
        }
      }
      other.sort((a, b) => a.symbol.localeCompare(b.symbol));

      sections = builtSections;
      otherSymbols = other;
      totalCount = builtSections.reduce((s, c) => s + c.symbols.length, 0) + other.length;
    } catch (err) {
      loadError = (err as Error).message;
    }
    isLoading = false;
  }

  onMount(() => {
    initI18n();
    uiLang = getUiLang();
    void loadSymbols();
  });

  function formatExample(text: string): string {
    return text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }
</script>

<div class="container py-5">
  <header class="mb-4">
    <a href="{base}/" class="btn btn-sm btn-outline-secondary mb-3">{t("ipa.back")}</a>
    <h1 class="display-5 fw-bold">{t("ipa.title")}</h1>
    <p class="lead text-muted">{t("ipa.subtitle")}</p>
    {#if !isLoading && !loadError}
      <span class="badge bg-secondary">{t("ipa.symbols_count", { count: totalCount })}</span>
    {/if}
  </header>

  {#if isLoading}
    <div class="text-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">{t("ipa.loading")}</span>
      </div>
      <p class="mt-3 text-muted">{t("ipa.loading")}</p>
    </div>
  {:else if loadError}
    <div class="alert alert-danger">{t("ipa.error")} ({loadError})</div>
  {:else}
    {#each sections as section}
      <section class="mb-5">
        <h2 class="h4 border-bottom pb-2 mb-3">{t(section.labelKey)}</h2>
        <div class="row row-cols-2 row-cols-sm-3 row-cols-md-4 row-cols-lg-6 g-2">
          {#each section.symbols as entry}
            <div class="col">
              <div class="card h-100 border-0 bg-light">
                <div class="card-body p-2 text-center">
                  <span class="d-block fs-3 mb-1" style="font-family: serif; line-height: 1.2"
                    >{entry.symbol}</span
                  >
                  {#if entry.explanation}
                    <small class="text-muted" style="font-size: 0.75rem"
                      ><!-- eslint-disable-next-line svelte/no-at-html-tags -->{@html formatExample(
                        entry.explanation,
                      )}</small
                    >
                  {:else}
                    <small class="text-muted fst-italic" style="font-size: 0.75rem"
                      >{t("ipa.no_explanation")}</small
                    >
                  {/if}
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/each}

    {#if otherSymbols.length > 0}
      <section class="mb-5">
        <h2 class="h4 border-bottom pb-2 mb-3">{t("ipa.category.other")}</h2>
        <div class="row row-cols-2 row-cols-sm-3 row-cols-md-4 row-cols-lg-6 g-2">
          {#each otherSymbols as entry}
            <div class="col">
              <div class="card h-100 border-0 bg-light">
                <div class="card-body p-2 text-center">
                  <span class="d-block fs-3 mb-1" style="font-family: serif; line-height: 1.2"
                    >{entry.symbol}</span
                  >
                  <small class="text-muted fst-italic" style="font-size: 0.75rem"
                    >{t("ipa.no_explanation")}</small
                  >
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>
