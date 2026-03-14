<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { resolve } from "$app/paths";
  import { goto } from "$app/navigation";
  import type { Snippet } from "svelte";
  import { t as _t, getUiLang, onUiLangChange, initI18n } from "../i18n.js";
  import { getStudyLang } from "../study-lang.js";
  import type { SupportedLanguage } from "../types.js";
  import { isFullscreenGame } from "../stores.js";

  let { children }: { children: Snippet } = $props();

  let buildDateLocal = $state("");
  let uiLang = $state<SupportedLanguage>(getUiLang());

  function t(key: string): string {
    void uiLang;
    return _t(key);
  }

  // @ts-expect-error TS2554
  const homeHref: string = resolve("/");
  // @ts-expect-error TS2554
  const catchItHref: string = resolve("/catch-it");
  // @ts-expect-error TS2554
  const phrasesHref: string = resolve("/phrases");
  // @ts-expect-error TS2554
  const settingsHref: string = resolve("/settings");

  const unsubUiLang = onUiLangChange((lang) => {
    uiLang = lang;
  });

  onMount(() => {
    buildDateLocal = new Date(__BUILD_DATE__).toLocaleString();
    initI18n();
    uiLang = getUiLang();
    return () => unsubUiLang();
  });

  // Redirect to settings if no study language is set (unless already there or URL has sl param)
  $effect(() => {
    void page.url.pathname;
    if (typeof window === "undefined") return;
    if (window.location.pathname.includes("/settings")) return;
    // Allow catch-it URL params to provide study lang without redirect
    const params = new URLSearchParams(window.location.search);
    if (params.get("sl")) return;
    if (!getStudyLang()) {
      try {
        window.sessionStorage.setItem("settings-return-url", window.location.href);
      } catch {
        // ignore
      }
      void goto(settingsHref);
    }
  });

  function isActive(path: string): boolean {
    if (path === "/") {
      return (
        page.url.pathname === "/" ||
        page.url.pathname === homeHref ||
        page.url.pathname === homeHref + "/"
      );
    }
    return (
      page.url.pathname === path ||
      page.url.pathname === path + "/" ||
      page.url.pathname.endsWith(path) ||
      page.url.pathname.endsWith(path + "/")
    );
  }
</script>

<nav class="app-nav" hidden={$isFullscreenGame}>
  <a
    href={homeHref}
    class="nav-link"
    class:nav-link-active={isActive("/")}
    aria-disabled={isActive("/")}
  >
    {t("nav.speak-it")}
  </a>
  <a
    href={catchItHref}
    class="nav-link"
    class:nav-link-active={isActive("/catch-it")}
    aria-disabled={isActive("/catch-it")}
  >
    {t("catch-it.title")}
  </a>
  <a
    href={phrasesHref}
    class="nav-link"
    class:nav-link-active={isActive("/phrases")}
    aria-disabled={isActive("/phrases")}
  >
    {t("phrases.title")}
  </a>
  <a
    href={settingsHref}
    class="nav-link nav-link-settings"
    class:nav-link-active={isActive("/settings")}
    aria-disabled={isActive("/settings")}
    title={t("nav.settings")}
  >
    ⚙
  </a>
</nav>

{@render children()}

<footer class="text-center text-muted py-3" style="font-size: 0.75rem" hidden={$isFullscreenGame}>
  Build: <time datetime={__BUILD_DATE__} title={__BUILD_DATE__}
    >{buildDateLocal || __BUILD_DATE__}</time
  >
</footer>

<style>
  .app-nav {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-bottom: 1px solid #dee2e6;
    background: #fff;
  }

  .nav-link {
    padding: 0.3rem 0.8rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    color: #0d6efd;
    text-decoration: none;
    border: 1px solid transparent;
  }

  .nav-link:hover:not(.nav-link-active) {
    background: #f0f4ff;
    border-color: #c9d8fb;
  }

  .nav-link-active {
    color: #6c757d;
    background: #f8f9fa;
    border-color: #dee2e6;
    pointer-events: none;
    cursor: default;
  }

  .nav-link-settings {
    margin-left: auto;
    font-size: 1.4rem;
    padding: 0.1rem 0.5rem;
  }
</style>
