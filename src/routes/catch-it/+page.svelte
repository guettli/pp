<script lang="ts">
  import { resolve } from "$app/paths";
  import { onDestroy, onMount } from "svelte";
  import { db } from "../../db.js";
  import { t as _t, getUiLang, initI18n, onUiLangChange } from "../../i18n.js";
  import { isFullscreenGame } from "../../stores.js";
  import {
    getStudyLang,
    setStudyLang,
    studyLangToPhraseLang,
    SUPPORTED_STUDY_LANGS,
    type StudyLanguage,
  } from "../../study-lang.js";
  import "../../styles/main.css";
  import type { Phrase, SupportedLanguage } from "../../types.js";
  import { getPhraseInLang } from "../../utils/phrase-xlang.js";
  import { preloadPhrases } from "../../utils/phrase-loader.js";
  import { getAllPhrases } from "../../utils/random.js";

  // @ts-expect-error TS2554
  const homeHref: string = resolve("/");

  const MAX_PHRASE_LEN = 15;
  // Forbidden angle zones: 0, 90, 180, 270 degrees ±5 degrees
  const FORBIDDEN_DEG = [0, 90, 180, 270];
  const ANGLE_MARGIN = 5 * (Math.PI / 180);
  // Allow box to go this many px outside left/right walls (~2em off-screen)
  const WALL_MARGIN = 32;

  type GameState = "no-lang" | "intro" | "playing" | "gameover";

  let uiLang = $state<SupportedLanguage>(getUiLang());

  function t(key: string, vars: Record<string, string | number> = {}): string {
    void uiLang;
    return _t(key, vars);
  }

  // Configurable game settings
  const CFG_DEFAULTS = {
    phraseCount: 5,
    duration: 30,
    speedStart: 80,
    speedEnd: 200,
    wordsPerSec: 2,
    wordLifetime: 4,
  };

  let cfgPhraseCount = $state(5);
  let cfgDuration = $state(30);
  let cfgSpeedStart = $state(80);
  let cfgSpeedEnd = $state(200);
  let cfgWordsPerSec = $state(2);
  let cfgWordLifetime = $state(4);
  let isSettingsLoaded = $state(false);

  let gameState = $state<GameState>("no-lang");
  let studyLang = $state<string>("");
  let targetPhrases = $state<Phrase[]>([]);
  let score = $state(0);
  let timeLeft = $state(30);

  // Wrong-clicked phrases collected during a round, shown at gameover
  let wrongClickedPhrases = $state<Phrase[]>([]);
  // Correctly caught phrases collected during a round, shown at gameover
  let correctCaughtPhrases = $state<Phrase[]>([]);

  // Phrase popup on symbol press: fade in then phase out
  let showingPhraseIdx = $state<number | null>(null);
  let phraseAnimKey = $state(0);
  let phraseShowTimer: ReturnType<typeof setTimeout> | null = null;

  // Drag-only range tracking for generic sliders (plain vars, no reactive needed)
  let _rangeDragActive = false;
  let _rangeDragX = 0;
  let _rangeDragged = false;

  // Browser back button handler
  let _popstateHandler: (() => void) | null = null;

  // Svelte-rendered list (add/remove only — position updated via DOM directly)
  interface FlyingPhrase {
    id: number;
    phrase: Phrase;
    isTarget: boolean;
    feedback: "none" | "correct" | "wrong";
  }

  // Physics state updated every RAF frame — not reactive
  interface Physics {
    x: number; // px, centre of phrase
    y: number; // px, centre of phrase
    vx: number; // px/s base (scale multiplied each frame)
    vy: number; // px/s base
    halfW: number; // estimated half-width for wall bounce
    born: number; // timestamp ms
    duration: number; // lifespan ms
  }

  let flyingPhrases = $state<FlyingPhrase[]>([]);
  const physics = new Map<number, Physics>();
  const phraseEls = new Map<number, HTMLElement>();
  let nextId = 0;

  let gameTimerHandle: ReturnType<typeof setInterval> | null = null;
  let spawnHandle: ReturnType<typeof setTimeout> | null = null;
  let rafHandle: number | null = null;
  let lastFrameTime = 0;

  let gameAreaEl: HTMLDivElement | undefined = $state();
  let allShortPhrases: Phrase[] = [];

  const unsubUiLang = onUiLangChange((lang) => {
    uiLang = lang;
  });

  // Save settings to PouchDB when they change (only after initial load)
  $effect(() => {
    if (!isSettingsLoaded) return;
    db.saveCatchItSettings({
      phraseCount: cfgPhraseCount,
      duration: cfgDuration,
      speedStart: cfgSpeedStart,
      speedEnd: cfgSpeedEnd,
      wordsPerSec: cfgWordsPerSec,
      wordLifetime: cfgWordLifetime,
    }).catch(() => {});
  });

  // Sync config to URL
  $effect(() => {
    if (typeof window === "undefined") return;
    if (gameState === "no-lang" || gameState === "playing") return;
    const params = new URLSearchParams();
    if (studyLang) params.set("sl", studyLang);
    params.set("n", String(cfgPhraseCount));
    params.set("dur", String(cfgDuration));
    params.set("ss", String(cfgSpeedStart));
    params.set("se", String(cfgSpeedEnd));
    params.set("wps", String(cfgWordsPerSec));
    params.set("wlt", String(cfgWordLifetime));
    window.history.replaceState({}, "", window.location.pathname + "?" + params.toString());
  });

  let emojiSize = $derived(Math.max(1.2, 2.5 - (cfgPhraseCount - 3) * 0.2));

  onMount(async () => {
    initI18n();
    uiLang = getUiLang();

    // Read config from URL params
    const params = new URLSearchParams(window.location.search);
    const slParam = params.get("sl");
    const sl =
      slParam && SUPPORTED_STUDY_LANGS.includes(slParam as StudyLanguage)
        ? (slParam as StudyLanguage)
        : getStudyLang();

    if (!sl) {
      gameState = "no-lang";
      return;
    }
    // If URL provided a study lang, persist it
    if (slParam && slParam !== getStudyLang()) {
      setStudyLang(sl);
    }
    studyLang = sl;

    cfgPhraseCount = clamp(parseInt(params.get("n") ?? "") || 5, 3, 7);
    cfgDuration = clamp(parseInt(params.get("dur") ?? "") || 30, 15, 300);
    cfgSpeedStart = clamp(parseInt(params.get("ss") ?? "") || 80, 20, 400);
    cfgSpeedEnd = clamp(parseInt(params.get("se") ?? "") || 200, 20, 400);
    cfgWordsPerSec = clamp(parseFloat(params.get("wps") ?? "") || 2, 1, 5);
    cfgWordLifetime = clamp(parseInt(params.get("wlt") ?? "") || 4, 2, 10);

    // Load saved settings from PouchDB (URL params take priority)
    const saved = await db.getCatchItSettings().catch(() => null);
    if (saved) {
      if (!params.has("n")) cfgPhraseCount = clamp(saved.phraseCount ?? cfgPhraseCount, 3, 7);
      if (!params.has("dur")) cfgDuration = clamp(saved.duration ?? cfgDuration, 15, 300);
      if (!params.has("ss")) cfgSpeedStart = clamp(saved.speedStart ?? cfgSpeedStart, 20, 400);
      if (!params.has("se")) cfgSpeedEnd = clamp(saved.speedEnd ?? cfgSpeedEnd, 20, 400);
      if (!params.has("wps")) cfgWordsPerSec = clamp(saved.wordsPerSec ?? cfgWordsPerSec, 1, 5);
      if (!params.has("wlt")) cfgWordLifetime = clamp(saved.wordLifetime ?? cfgWordLifetime, 2, 10);
    }
    isSettingsLoaded = true;

    const phraseLang = studyLangToPhraseLang(sl);
    await Promise.all([
      preloadPhrases(phraseLang),
      preloadPhrases("en-GB"),
      preloadPhrases(uiLang),
    ]);
    allShortPhrases = (await getAllPhrases(phraseLang)).filter(
      (p) => p.phrase.length <= MAX_PHRASE_LEN,
    );
    gameState = "intro"; // $effect picks targets when gameState becomes "intro"

    _popstateHandler = () => {
      if (gameState === "playing") {
        stopGame();
        unlockScroll();
        isFullscreenGame.set(false);
        gameState = "intro";
      }
    };
    window.addEventListener("popstate", _popstateHandler);
  });

  onDestroy(() => {
    unlockScroll();
    isFullscreenGame.set(false);
    unsubUiLang();
    stopGame();
    if (_popstateHandler) window.removeEventListener("popstate", _popstateHandler);
  });

  function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
  }

  function handleSymbolPress(i: number) {
    if (phraseShowTimer) clearTimeout(phraseShowTimer);
    showingPhraseIdx = i;
    phraseAnimKey++;
    phraseShowTimer = setTimeout(() => {
      showingPhraseIdx = null;
      phraseShowTimer = null;
    }, 2000);
  }

  let _phraseSliderYAtDragStart: number | null = null;

  function onRangePointerDown(e: PointerEvent) {
    _rangeDragX = e.clientX;
    _rangeDragActive = true;
    _rangeDragged = false;
    if ((e.currentTarget as HTMLElement | null)?.id === "cfg-phrases") {
      _phraseSliderYAtDragStart = (e.currentTarget as HTMLElement).getBoundingClientRect().top;
      // Disable CSS scroll anchoring BEFORE the Svelte DOM update (phrases grow/shrink).
      // This prevents the browser from auto-adjusting scrollY during the layout change,
      // which would fight our own scroll compensation in onRangePointerUp.
      if (typeof document !== "undefined") document.documentElement.style.overflowAnchor = "none";
    }
  }

  function onRangePointerMove(e: PointerEvent) {
    if (_rangeDragActive && Math.abs(e.clientX - _rangeDragX) > 8) {
      _rangeDragged = true;
    }
  }

  function onRangePointerUp() {
    _rangeDragActive = false;
    _rangeDragged = false;
    if (_phraseSliderYAtDragStart !== null && typeof document !== "undefined") {
      const slider = document.getElementById("cfg-phrases");
      if (slider) {
        const yTarget = _phraseSliderYAtDragStart;
        // Iterative rAF correction: keep scrolling until the slider is back at yTarget.
        // Runs after CSS scroll anchoring (which fires during the rendering pipeline).
        // overflow-anchor is restored first, then one final correction pass runs to
        // compensate for any shift the browser applies upon anchor restoration.
        let _rafAttempts = 4;
        const _correctScroll = () => {
          const delta = slider.getBoundingClientRect().top - yTarget;
          if (Math.abs(delta) > 1) {
            window.scrollBy(0, delta);
          }
          _rafAttempts--;
          if (_rafAttempts > 0) {
            requestAnimationFrame(_correctScroll);
          } else if (_rafAttempts === 0) {
            // Restore anchor and do one final pass to catch any browser-induced shift.
            document.documentElement.style.overflowAnchor = "";
            _rafAttempts = -1;
            requestAnimationFrame(_correctScroll);
          }
        };
        requestAnimationFrame(_correctScroll);
      }
      _phraseSliderYAtDragStart = null;
    }
  }

  // Reactively repick target phrases when cfgPhraseCount changes (or gameState becomes "intro").
  $effect(() => {
    if (!isSettingsLoaded || gameState !== "intro" || allShortPhrases.length === 0) return;
    targetPhrases = pickTargets();
  });

  function onRangeInput(e: Event, getter: () => number, setter: (v: number) => void) {
    if (_rangeDragActive && !_rangeDragged) {
      // Click on track without drag — revert
      (e.target as HTMLInputElement).value = String(getter());
      return;
    }
    setter(+(e.target as HTMLInputElement).value);
  }

  function lockScroll() {
    document.documentElement.style.overflow = "hidden";
  }

  function unlockScroll() {
    document.documentElement.style.overflow = "";
  }

  /** Pick a random launch angle avoiding axis-aligned directions. */
  function randomAngle(): number {
    let angle: number;
    do {
      angle = Math.random() * 2 * Math.PI;
    } while (
      FORBIDDEN_DEG.some((deg) => {
        const rad = deg * (Math.PI / 180);
        const diff = Math.abs(((angle - rad + Math.PI) % (2 * Math.PI)) - Math.PI);
        return diff < ANGLE_MARGIN;
      })
    );
    return angle;
  }

  /** Rotate velocity by a small random deflection (3–7°) after a wall bounce. */
  function deflectBounce(vx: number, vy: number): [number, number] {
    const a = (3 + Math.random() * 4) * (Math.PI / 180) * (Math.random() < 0.5 ? 1 : -1);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return [vx * cos - vy * sin, vx * sin + vy * cos];
  }

  function pickTargets(): Phrase[] {
    const pool = [...allShortPhrases];
    const targets: Phrase[] = [];
    const usedEmojis = new Set<string>();
    while (targets.length < cfgPhraseCount && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      const candidate = pool.splice(idx, 1)[0];
      if (!usedEmojis.has(candidate.emoji)) {
        usedEmojis.add(candidate.emoji);
        targets.push(candidate);
      }
    }
    return targets;
  }

  function startGame() {
    score = 0;
    timeLeft = cfgDuration;
    flyingPhrases = [];
    physics.clear();
    phraseEls.clear();
    nextId = 0;
    showingPhraseIdx = null;
    wrongClickedPhrases = [];
    correctCaughtPhrases = [];
    if (phraseShowTimer) {
      clearTimeout(phraseShowTimer);
      phraseShowTimer = null;
    }
    window.history.pushState({ catchItGame: true }, "");
    gameState = "playing";
    isFullscreenGame.set(true);
    lockScroll();

    gameTimerHandle = setInterval(() => {
      timeLeft -= 1;
      if (timeLeft <= 0) endGame();
    }, 1000);

    scheduleSpawn();
    startRaf();
  }

  function currentBaseSpeed(): number {
    const elapsed = cfgDuration - timeLeft;
    return cfgSpeedStart + (elapsed / cfgDuration) * (cfgSpeedEnd - cfgSpeedStart);
  }

  function scheduleSpawn() {
    if (gameState !== "playing") return;
    spawnPhrase();
    const interval = Math.round(1000 / cfgWordsPerSec);
    spawnHandle = setTimeout(scheduleSpawn, interval);
  }

  function spawnPhrase() {
    const areaW = gameAreaEl?.clientWidth ?? 400;
    const areaH = gameAreaEl?.clientHeight ?? 500;

    // Track which non-matching phrases are currently on screen
    const targetEmojis = new Set(targetPhrases.map((p) => p.emoji));
    const activeNonMatchingTexts = new Set(
      flyingPhrases.filter((fp) => !fp.isTarget).map((fp) => fp.phrase.phrase),
    );

    const useTarget = Math.random() < 1 / 3 && targetPhrases.length > 0;
    let phrase: Phrase;
    if (useTarget) {
      phrase = targetPhrases[Math.floor(Math.random() * targetPhrases.length)];
    } else {
      // Non-matching: exclude target phrases & their emojis; no duplicate on screen
      const nonTargets = allShortPhrases.filter(
        (p) =>
          !targetPhrases.some((tp) => tp.phrase === p.phrase) &&
          !targetEmojis.has(p.emoji) &&
          !activeNonMatchingTexts.has(p.phrase),
      );
      // Fallback: relax "no duplicate" constraint if pool exhausted
      const pool =
        nonTargets.length > 0
          ? nonTargets
          : allShortPhrases.filter(
              (p) =>
                !targetPhrases.some((tp) => tp.phrase === p.phrase) && !targetEmojis.has(p.emoji),
            );
      if (pool.length === 0) return;
      phrase = pool[Math.floor(Math.random() * pool.length)];
    }

    const duration = cfgWordLifetime * 1000;
    const halfW = Math.min(phrase.phrase.length * 7 + 16, 120);
    const halfH = 18;
    const x = halfW + Math.random() * Math.max(1, areaW - 2 * halfW);
    const y = halfH + Math.random() * Math.max(1, areaH - 2 * halfH);
    const angle = randomAngle();
    const speed = currentBaseSpeed();

    const id = nextId++;
    physics.set(id, {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      halfW,
      born: Date.now(),
      duration,
    });
    flyingPhrases = [
      ...flyingPhrases,
      {
        id,
        phrase,
        isTarget: targetPhrases.some((tp) => tp.phrase === phrase.phrase),
        feedback: "none",
      },
    ];
  }

  function scaleAt(progress: number): number {
    if (progress < 0.15) return 0.5 + (progress / 0.15) * 0.5;
    if (progress > 0.85) return 1.0 - ((progress - 0.85) / 0.15) * 0.5;
    return 1.0;
  }

  function opacityAt(progress: number): number {
    if (progress < 0.12) return progress / 0.12;
    if (progress > 0.88) return (1 - progress) / 0.12;
    return 1;
  }

  function startRaf() {
    lastFrameTime = performance.now();

    function frame(now: number) {
      if (gameState !== "playing") return;
      const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
      lastFrameTime = now;

      const areaW = gameAreaEl?.clientWidth ?? 400;
      const areaH = gameAreaEl?.clientHeight ?? 500;
      const nowMs = Date.now();
      const toRemove: number[] = [];

      for (const [id, ph] of physics) {
        const elapsed = nowMs - ph.born;
        if (elapsed >= ph.duration) {
          toRemove.push(id);
          continue;
        }

        const progress = elapsed / ph.duration;
        const scale = scaleAt(progress);
        const opacity = opacityAt(progress);

        // Speed proportional to scale: fast when big, slow when fading
        ph.x += ph.vx * scale * dt;
        ph.y += ph.vy * scale * dt;

        // Bounce off walls (allow WALL_MARGIN px outside on left/right)
        if (ph.x - ph.halfW < -WALL_MARGIN) {
          ph.x = ph.halfW - WALL_MARGIN;
          ph.vx = Math.abs(ph.vx);
          [ph.vx, ph.vy] = deflectBounce(ph.vx, ph.vy);
        } else if (ph.x + ph.halfW > areaW + WALL_MARGIN) {
          ph.x = areaW + WALL_MARGIN - ph.halfW;
          ph.vx = -Math.abs(ph.vx);
          [ph.vx, ph.vy] = deflectBounce(ph.vx, ph.vy);
        }
        if (ph.y - 18 < 0) {
          ph.y = 18;
          ph.vy = Math.abs(ph.vy);
          [ph.vx, ph.vy] = deflectBounce(ph.vx, ph.vy);
        } else if (ph.y + 18 > areaH) {
          ph.y = areaH - 18;
          ph.vy = -Math.abs(ph.vy);
          [ph.vx, ph.vy] = deflectBounce(ph.vx, ph.vy);
        }

        const el = phraseEls.get(id);
        if (el) {
          el.style.left = `${ph.x}px`;
          el.style.top = `${ph.y}px`;
          el.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
          el.style.opacity = `${opacity.toFixed(3)}`;
          el.style.fontSize = `${(0.65 + scale * 0.4).toFixed(2)}rem`;
        }
      }

      if (toRemove.length > 0) {
        for (const id of toRemove) {
          physics.delete(id);
          phraseEls.delete(id);
        }
        flyingPhrases = flyingPhrases.filter((fp) => !toRemove.includes(fp.id));
      }

      rafHandle = window.requestAnimationFrame(frame);
    }

    rafHandle = window.requestAnimationFrame(frame);
  }

  // Svelte action: register element ref for direct DOM updates
  function trackEl(node: HTMLElement, id: number) {
    phraseEls.set(id, node);
    return {
      destroy() {
        phraseEls.delete(id);
      },
    };
  }

  function handlePhraseClick(fp: FlyingPhrase) {
    if (fp.feedback !== "none") return;

    if (fp.isTarget) {
      score += 1;
      if (!correctCaughtPhrases.some((p) => p.phrase === fp.phrase.phrase)) {
        correctCaughtPhrases = [...correctCaughtPhrases, fp.phrase];
      }
      flyingPhrases = flyingPhrases.map((p) =>
        p.id === fp.id ? { ...p, feedback: "correct" as const } : p,
      );
      setTimeout(() => {
        physics.delete(fp.id);
        phraseEls.delete(fp.id);
        flyingPhrases = flyingPhrases.filter((p) => p.id !== fp.id);
      }, 300);
    } else {
      if (!wrongClickedPhrases.some((p) => p.phrase === fp.phrase.phrase)) {
        wrongClickedPhrases = [...wrongClickedPhrases, fp.phrase];
      }
      flyingPhrases = flyingPhrases.map((p) =>
        p.id === fp.id ? { ...p, feedback: "wrong" as const } : p,
      );
      setTimeout(() => {
        flyingPhrases = flyingPhrases.map((p) =>
          p.id === fp.id ? { ...p, feedback: "none" as const } : p,
        );
      }, 400);
    }
  }

  function endGame() {
    stopGame();
    unlockScroll();
    isFullscreenGame.set(false);
    flyingPhrases = [];
    physics.clear();
    phraseEls.clear();
    gameState = "gameover";
  }

  function stopGame() {
    if (gameTimerHandle) {
      clearInterval(gameTimerHandle);
      gameTimerHandle = null;
    }
    if (spawnHandle) {
      clearTimeout(spawnHandle);
      spawnHandle = null;
    }
    if (rafHandle) {
      window.cancelAnimationFrame(rafHandle);
      rafHandle = null;
    }
    if (phraseShowTimer) {
      clearTimeout(phraseShowTimer);
      phraseShowTimer = null;
    }
    showingPhraseIdx = null;
  }

  function resetSettings() {
    cfgPhraseCount = CFG_DEFAULTS.phraseCount;
    cfgDuration = CFG_DEFAULTS.duration;
    cfgSpeedStart = CFG_DEFAULTS.speedStart;
    cfgSpeedEnd = CFG_DEFAULTS.speedEnd;
    cfgWordsPerSec = CFG_DEFAULTS.wordsPerSec;
    cfgWordLifetime = CFG_DEFAULTS.wordLifetime;
    // $effect repicks targets when cfgPhraseCount changes
  }

  function restartGame() {
    stopGame();
    isFullscreenGame.set(false);
    flyingPhrases = [];
    physics.clear();
    phraseEls.clear();
    gameState = "intro"; // $effect picks new targets
  }
</script>

<svelte:head>
  <title>{t("catch-it.title")}</title>
</svelte:head>

{#if gameState === "no-lang"}
  <div class="container py-5 text-center">
    <h1 class="mb-4">{t("catch-it.title")}</h1>
    <p class="text-muted mb-4">{t("catch-it.no-lang")}</p>
    <a href={homeHref} class="btn btn-primary">{t("catch-it.back")}</a>
  </div>
{:else if gameState === "intro"}
  <div class="container py-4">
    <p class="text-muted mb-4">{t("catch-it.intro.heading", { count: cfgPhraseCount })}</p>
    <div class="target-list mb-4">
      {#each targetPhrases as phrase (phrase.phrase)}
        <div class="d-flex align-items-center gap-3 mb-3 target-item">
          <span class="target-emoji">{phrase.emoji}</span>
          <div>
            <div class="target-phrase">{phrase.phrase}</div>
            {#if studyLang !== uiLang}
              <div class="target-translation">
                {getPhraseInLang(phrase, uiLang)}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <p class="text-muted small mb-4">{t("catch-it.intro.subtitle")}</p>
    <button class="btn btn-success btn-lg w-100 mb-4" onclick={startGame}
      >{t("catch-it.intro.start")}</button
    >

    <div class="config-section mb-4">
      <div class="config-row">
        <label for="cfg-phrases" class="config-label"
          >{t("catch-it.config.phrases", { count: cfgPhraseCount })}</label
        >
        <input
          id="cfg-phrases"
          type="range"
          min="3"
          max="7"
          step="1"
          value={cfgPhraseCount}
          onpointerdown={onRangePointerDown}
          onpointermove={onRangePointerMove}
          onpointerup={onRangePointerUp}
          onpointercancel={onRangePointerUp}
          oninput={(e) =>
            onRangeInput(
              e,
              () => cfgPhraseCount,
              (v) => {
                cfgPhraseCount = v;
              },
            )}
          class="form-range"
        />
      </div>
      <div class="config-row">
        <label for="cfg-duration" class="config-label"
          >{t("catch-it.config.duration", { value: cfgDuration })}</label
        >
        <!-- Drag-only: value changes only when dragging, not on bare click. -->
        <input
          id="cfg-duration"
          type="range"
          min="15"
          max="300"
          step="5"
          value={cfgDuration}
          onpointerdown={onRangePointerDown}
          onpointermove={onRangePointerMove}
          onpointerup={onRangePointerUp}
          onpointercancel={onRangePointerUp}
          oninput={(e) =>
            onRangeInput(
              e,
              () => cfgDuration,
              (v) => {
                cfgDuration = v;
              },
            )}
          class="form-range"
        />
      </div>
      <div class="config-row">
        <label for="cfg-speed-start" class="config-label"
          >{t("catch-it.config.speed-start", { value: cfgSpeedStart })}</label
        >
        <!-- Drag-only: value changes only when dragging, not on bare click. -->
        <input
          id="cfg-speed-start"
          type="range"
          min="20"
          max="400"
          step="10"
          value={cfgSpeedStart}
          onpointerdown={onRangePointerDown}
          onpointermove={onRangePointerMove}
          onpointerup={onRangePointerUp}
          onpointercancel={onRangePointerUp}
          oninput={(e) =>
            onRangeInput(
              e,
              () => cfgSpeedStart,
              (v) => {
                cfgSpeedStart = v;
              },
            )}
          class="form-range"
        />
      </div>
      <div class="config-row">
        <label for="cfg-speed-end" class="config-label"
          >{t("catch-it.config.speed-end", { value: cfgSpeedEnd })}</label
        >
        <!-- Drag-only: value changes only when dragging, not on bare click. -->
        <input
          id="cfg-speed-end"
          type="range"
          min="20"
          max="400"
          step="10"
          value={cfgSpeedEnd}
          onpointerdown={onRangePointerDown}
          onpointermove={onRangePointerMove}
          onpointerup={onRangePointerUp}
          onpointercancel={onRangePointerUp}
          oninput={(e) =>
            onRangeInput(
              e,
              () => cfgSpeedEnd,
              (v) => {
                cfgSpeedEnd = v;
              },
            )}
          class="form-range"
        />
      </div>
      <div class="config-row">
        <label for="cfg-wps" class="config-label"
          >{t("catch-it.config.words-per-sec", { value: cfgWordsPerSec })}</label
        >
        <!-- Drag-only: value changes only when dragging, not on bare click. -->
        <input
          id="cfg-wps"
          type="range"
          min="1"
          max="5"
          step="0.5"
          value={cfgWordsPerSec}
          onpointerdown={onRangePointerDown}
          onpointermove={onRangePointerMove}
          onpointerup={onRangePointerUp}
          onpointercancel={onRangePointerUp}
          oninput={(e) =>
            onRangeInput(
              e,
              () => cfgWordsPerSec,
              (v) => {
                cfgWordsPerSec = v;
              },
            )}
          class="form-range"
        />
      </div>
      <div class="config-row">
        <label for="cfg-lifetime" class="config-label"
          >{t("catch-it.config.word-lifetime", { value: cfgWordLifetime })}</label
        >
        <!-- Drag-only: value changes only when dragging, not on bare click. -->
        <input
          id="cfg-lifetime"
          type="range"
          min="2"
          max="10"
          step="1"
          value={cfgWordLifetime}
          onpointerdown={onRangePointerDown}
          onpointermove={onRangePointerMove}
          onpointerup={onRangePointerUp}
          onpointercancel={onRangePointerUp}
          oninput={(e) =>
            onRangeInput(
              e,
              () => cfgWordLifetime,
              (v) => {
                cfgWordLifetime = v;
              },
            )}
          class="form-range"
        />
      </div>
    </div>

    <div class="mt-2 text-end">
      <button class="btn btn-outline-secondary btn-sm" onclick={resetSettings}>
        {t("catch-it.config.reset")}
      </button>
    </div>
  </div>
{:else if gameState === "playing"}
  <div class="game-container">
    <div class="game-hud">
      <span class="hud-score">{t("catch-it.score")}: {score}</span>
      <span class="hud-timer" class:timer-urgent={timeLeft <= 10}>{timeLeft}s</span>
    </div>

    <div class="game-area" bind:this={gameAreaEl}>
      {#each flyingPhrases as fp (fp.id)}
        <button
          use:trackEl={fp.id}
          class="flying-phrase"
          class:feedback-correct={fp.feedback === "correct"}
          class:feedback-wrong={fp.feedback === "wrong"}
          data-is-target={fp.isTarget}
          onpointerdown={(e) => {
            e.preventDefault();
            handlePhraseClick(fp);
          }}
          type="button"
        >
          {fp.phrase.phrase}
        </button>
      {/each}
    </div>

    <div class="symbols-bar" style="--emoji-size: {emojiSize}rem">
      {#each targetPhrases as phrase, i (phrase.phrase)}
        <button
          class="symbol-item"
          onpointerdown={(e) => {
            e.preventDefault();
            handleSymbolPress(i);
          }}
          type="button"
        >
          <span class="symbol-emoji">{phrase.emoji}</span>
          {#if showingPhraseIdx === i}
            {#key phraseAnimKey}
              <span class="symbol-label phrase-popup">{phrase.phrase}</span>
            {/key}
          {/if}
        </button>
      {/each}
    </div>
  </div>
{:else if gameState === "gameover"}
  <div class="container py-5 text-center">
    <h1 class="mb-3">{t("catch-it.gameover.title")}</h1>
    <p class="display-4 mb-4">{t("catch-it.gameover.score", { score })}</p>
    {#if correctCaughtPhrases.length > 0}
      <div class="mt-1 mb-4">
        <p class="text-muted small mb-2">{t("catch-it.gameover.correct-phrases")}</p>
        <div class="d-flex flex-wrap gap-2 justify-content-center">
          {#each correctCaughtPhrases as phrase (phrase.phrase)}
            <span class="badge bg-success-subtle text-success-emphasis fs-6 py-2 px-3">
              {phrase.emoji}
              {phrase.phrase}
            </span>
          {/each}
        </div>
      </div>
    {/if}
    {#if wrongClickedPhrases.length > 0}
      <div class="mt-1 mb-4">
        <p class="text-muted small mb-2">{t("catch-it.gameover.wrong-phrases")}</p>
        <div class="d-flex flex-wrap gap-2 justify-content-center">
          {#each wrongClickedPhrases as phrase (phrase.phrase)}
            <span class="badge bg-danger-subtle text-danger-emphasis fs-6 py-2 px-3">
              {phrase.emoji}
              {phrase.phrase}
            </span>
          {/each}
        </div>
      </div>
    {/if}
    <div class="d-flex gap-3 justify-content-center">
      <button class="btn btn-success btn-lg" onclick={restartGame}
        >{t("catch-it.gameover.play-again")}</button
      >
      <button class="btn btn-outline-secondary btn-lg" onclick={restartGame}
        >{t("catch-it.back")}</button
      >
    </div>
  </div>
{/if}

<style>
  /* ── Intro ─────────────────────────────────────────────── */
  .target-item {
    background: #f8f9fa;
    border-radius: 12px;
    padding: 0.75rem 1rem;
  }

  .target-emoji {
    font-size: 2rem;
    line-height: 1;
  }

  .target-phrase {
    font-size: 1.1rem;
    font-weight: 600;
  }

  .target-translation {
    font-size: 0.9rem;
    color: #6c757d;
  }

  /* ── Config sliders ────────────────────────────────────── */
  .config-section {
    background: #f8f9fa;
    border-radius: 12px;
    padding: 1rem;
  }

  .config-row {
    margin-bottom: 0.75rem;
  }

  .config-row:last-child {
    margin-bottom: 0;
  }

  .config-label {
    display: block;
    font-size: 0.9rem;
    font-weight: 500;
    margin-bottom: 0.25rem;
    color: #495057;
  }

  /* ── Game layout ───────────────────────────────────────── */
  .game-container {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: #f0f4ff;
    user-select: none;
    z-index: 10;
  }

  .game-hud {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.85);
    border-bottom: 1px solid #dee2e6;
    flex-shrink: 0;
  }

  .hud-score {
    font-size: 1.25rem;
    font-weight: 700;
  }

  .hud-timer {
    font-size: 1.25rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    transition: color 0.3s;
  }

  .timer-urgent {
    color: #dc3545;
    animation: pulse 0.8s ease-in-out infinite;
  }

  /* ── Play area ─────────────────────────────────────────── */
  .game-area {
    position: relative;
    flex: 1;
    overflow: hidden;
  }

  /* ── Bottom emoji bar ──────────────────────────────────── */
  .symbols-bar {
    display: flex;
    justify-content: space-evenly;
    align-items: flex-end;
    padding: 0.5rem 0.25rem;
    background: rgba(255, 255, 255, 0.97);
    border-top: 2px solid #dee2e6;
    flex-shrink: 0;
    position: relative;
    z-index: 1;
  }

  .symbol-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    background: transparent;
    border: 2px solid transparent;
    border-radius: 10px;
    padding: 0.2rem 0.3rem;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    transition:
      background 0.15s,
      border-color 0.15s;
    min-width: 0;
  }

  .symbol-emoji {
    font-size: var(--emoji-size, 2.2rem);
    line-height: 1;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.15));
  }

  .symbol-label {
    font-size: 0.65rem;
    font-weight: 700;
    color: #004085;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 5rem;
    margin-top: 0.1rem;
  }

  .phrase-popup {
    animation: phrasePopup 2s ease-in-out forwards;
  }

  @keyframes phrasePopup {
    0% {
      opacity: 0;
    }
    15% {
      opacity: 1;
    }
    75% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  /* ── Flying phrases ────────────────────────────────────── */
  .flying-phrase {
    position: absolute;
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.5);
    transform-origin: center;
    background: #ffffff;
    border: 2px solid #adb5bd;
    border-radius: 12px;
    font-size: 1.05rem;
    font-weight: 700;
    color: #212529;
    cursor: pointer;
    white-space: nowrap;
    padding: 0.25rem 0.4rem;
    box-shadow:
      0 3px 10px rgba(0, 0, 0, 0.18),
      0 1px 3px rgba(0, 0, 0, 0.1);
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    transition:
      background-color 0.15s,
      border-color 0.15s,
      box-shadow 0.15s;
    will-change: transform, opacity, left, top;
  }

  .flying-phrase.feedback-correct {
    background: #d4edda;
    border-color: #28a745;
    box-shadow: 0 0 0 3px rgba(40, 167, 69, 0.35);
  }

  .flying-phrase.feedback-wrong {
    background: #f8d7da;
    border-color: #dc3545;
    box-shadow: 0 0 0 3px rgba(220, 53, 69, 0.35);
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }
</style>
