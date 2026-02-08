/**
 * Feedback display component
 */

import { db } from "../db.js";
import { getLanguage, t } from "../i18n.js";
import { setState, state } from "../state.js";
import type { PhonemeComparisonItem, Phrase, Score } from "../types.js";
import { generateExplanationsHTML } from "./ipa-helper.js";

// Track current audio playback
let currentAudio: HTMLAudioElement | null = null;
let speechSynthesisSupported: boolean | null = null; // null = unknown, true/false after check

/**
 * Display pronunciation feedback with phoneme-level analysis
 */
export function displayFeedback(targetPhrase: Phrase, actualIPA: string, score: Score): void {
  const section = document.getElementById("feedback-section");
  const alert = document.getElementById("feedback-alert");
  const targetElement = document.getElementById("feedback-target");
  const targetIPAElement = document.getElementById("feedback-target-ipa");
  const actualIPAElement = document.getElementById("feedback-actual-ipa");
  const scoreElement = document.getElementById("feedback-score");
  const messageElement = document.getElementById("feedback-message");

  // Show feedback section
  if (section) section.style.display = "block";

  // Increment recording count and hide tips after 3 recordings
  setState({ recordingCount: state.recordingCount + 1 });

  // Update alert styling
  if (alert) {
    alert.className = `alert ${score.bootstrapClass}`;

    // Show similarity only if phrase was recognized
    const similarityText = score.notFound
      ? ""
      : `<p class="mb-0">${t("feedback.phoneme_similarity")} <strong>${score.similarityPercent}%</strong></p>`;

    alert.innerHTML = `
      <h4 class="alert-heading">${score.grade}</h4>
      ${similarityText}
    `;
  }

  // Generate side-by-side phoneme comparison
  const comparisonGrid = document.getElementById("phoneme-comparison-grid");
  if (comparisonGrid) {
    if (
      !score.notFound &&
      score.phonemeComparison &&
      Array.isArray(score.phonemeComparison) &&
      score.phonemeComparison.length > 0
    ) {
      comparisonGrid.innerHTML = generatePhonemeComparisonHTML(score.phonemeComparison);
    } else if (score.notFound) {
      comparisonGrid.innerHTML = `<span class="text-muted">${t("feedback.phrase_not_in_vocab")}</span>`;
    } else {
      comparisonGrid.innerHTML = "";
    }
  }

  // Update content
  if (targetElement) targetElement.textContent = targetPhrase.phrase;
  if (targetIPAElement) {
    // Use the first (standard) IPA pronunciation
    targetIPAElement.textContent = targetPhrase.ipas[0]?.ipa || "";
  }
  if (actualIPAElement) {
    // Show phonemes if available, or "Not recognized" if phrase not found
    if (score.notFound) {
      actualIPAElement.textContent = t("feedback.phrase_not_in_vocab");
    } else {
      actualIPAElement.textContent = actualIPA || "—";
    }
  }
  if (scoreElement) scoreElement.textContent = score.grade;
  if (messageElement) messageElement.textContent = score.message;

  // Show play button if recording is available
  const playBtn = document.getElementById("play-recording-btn");
  if (playBtn && state.lastRecordingBlob) {
    playBtn.style.display = "inline-block";
    setupPlayButton(playBtn);
  }

  // Show play target button for desired pronunciation (if supported)
  const playTargetBtn = document.getElementById("play-target-btn");
  const speechHint = document.getElementById("speech-synthesis-hint");
  if (playTargetBtn && targetPhrase.phrase) {
    void checkSpeechSynthesisSupport().then((supported) => {
      if (supported) {
        playTargetBtn.style.display = "inline-block";
        playTargetBtn.onclick = () => void playDesiredPronunciation(targetPhrase.phrase);
        if (speechHint) speechHint.style.display = "none";
      } else {
        playTargetBtn.style.display = "none";
        if (speechHint) {
          speechHint.style.display = "inline";
          speechHint.textContent = t("feedback.speech_not_supported");
        }
      }
    });
  }

  // Populate IPA explanations
  const ipaContent = document.getElementById("ipa-explanations-content");
  if (ipaContent) {
    // Use the first (standard) IPA pronunciation
    const primaryIPA = targetPhrase.ipas[0]?.ipa || "";
    const explanationsHTML = generateExplanationsHTML(primaryIPA, actualIPA);
    ipaContent.innerHTML = explanationsHTML || t("feedback.no_ipa_help");
  }

  // Set up IPA help toggle (collapse initially)
  const ipaToggle = document.getElementById("ipa-help-toggle");
  const ipaExplanations = document.getElementById("ipa-explanations");
  const ipaChevron = document.getElementById("ipa-help-chevron");
  if (ipaToggle && ipaExplanations) {
    ipaExplanations.style.display = "none";
    if (ipaChevron) {
      ipaChevron.className = "bi bi-chevron-down ms-1";
    }
    ipaToggle.onclick = (e) => {
      e.preventDefault();
      const isHidden = ipaExplanations.style.display === "none";
      ipaExplanations.style.display = isHidden ? "block" : "none";
      if (ipaChevron) {
        ipaChevron.className = isHidden ? "bi bi-chevron-up ms-1" : "bi bi-chevron-down ms-1";
      }
    };
  }

  // Scroll to feedback
  if (section) {
    section.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

/**
 * Hide feedback section
 */
export function hideFeedback() {
  const section = document.getElementById("feedback-section");
  if (section) section.style.display = "none";

  // Hide play buttons
  const playBtn = document.getElementById("play-recording-btn");
  if (playBtn) playBtn.style.display = "none";

  const playTargetBtn = document.getElementById("play-target-btn");
  if (playTargetBtn) playTargetBtn.style.display = "none";

  const speechHint = document.getElementById("speech-synthesis-hint");
  if (speechHint) speechHint.style.display = "none";

  // Collapse IPA explanations
  const ipaExplanations = document.getElementById("ipa-explanations");
  if (ipaExplanations) ipaExplanations.style.display = "none";
  const ipaChevron = document.getElementById("ipa-help-chevron");
  if (ipaChevron) ipaChevron.className = "bi bi-chevron-down ms-1";

  // Note: We intentionally DON'T cancel speech here because it can interfere
  // with the next phrase's playDesiredPronunciation() call on Chrome Linux.
  // The playDesiredPronunciation() function handles cancel() with proper timing.
  // if (window.speechSynthesis) {
  //   speechSynthesis.cancel();
  // }
}

// Long-press threshold in milliseconds
const LONG_PRESS_THRESHOLD = 500;

/**
 * Set up play button with click (play) and long-press (download) handlers
 */
function setupPlayButton(playBtn: HTMLElement): void {
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let isLongPress = false;

  const handlePressStart = (): void => {
    isLongPress = false;
    pressTimer = setTimeout(() => {
      isLongPress = true;
      downloadRecording();
    }, LONG_PRESS_THRESHOLD);
  };

  const handlePressEnd = (): void => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    if (!isLongPress) {
      playRecording();
    }
  };

  const handlePressCancel = (): void => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };

  // Remove existing listeners by cloning
  const newBtn = playBtn.cloneNode(true);
  if (playBtn.parentNode) {
    playBtn.parentNode.replaceChild(newBtn, playBtn);
  }

  // Mouse events
  newBtn.addEventListener("mousedown", handlePressStart);
  newBtn.addEventListener("mouseup", handlePressEnd);
  newBtn.addEventListener("mouseleave", handlePressCancel);

  // Touch events
  newBtn.addEventListener("touchstart", (e: Event) => {
    e.preventDefault();
    handlePressStart();
  });
  newBtn.addEventListener("touchend", (e: Event) => {
    e.preventDefault();
    handlePressEnd();
  });
  newBtn.addEventListener("touchcancel", handlePressCancel);
}

/**
 * Download the last recorded audio as a file
 */
function downloadRecording() {
  if (!state.lastRecordingBlob) return;

  const url = URL.createObjectURL(state.lastRecordingBlob);
  const a = document.createElement("a");
  a.href = url;

  // Use current phrase for filename if available
  const phrase = state.currentPhrase?.phrase || "recording";
  const lang = getLanguage();
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");

  // Replace spaces with underscores in phrase for clean filenames
  const phraseSafe = phrase.replace(/\s+/g, "_");

  // Include recognized IPA in filename if available
  let filename = `${phraseSafe}_${timestamp}_${lang}`;
  if (state.actualIPA) {
    // Remove spaces for cleaner filename
    filename += `_${state.actualIPA.replace(/\s+/g, "")}`;
  }
  a.download = `${filename}.webm`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Play the last recorded audio
 * @param scorePercent - Optional score percentage (0-100). If provided and < 95, auto-play desired pronunciation
 */
export function playRecording(scorePercent?: number) {
  if (!state.lastRecordingBlob) return;

  // Stop any currently playing audio
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  const url = URL.createObjectURL(state.lastRecordingBlob);
  currentAudio = new Audio(url);

  // Clean up blob URL when done
  currentAudio.onended = () => {
    URL.revokeObjectURL(url);
    currentAudio = null;

    // Automatically play desired pronunciation after recording ends, but only if score < 95%
    if (scorePercent !== undefined && scorePercent < 95 && state.currentPhrase?.phrase) {
      console.log(
        `Recording ended, score ${scorePercent}% < 95%, playing desired pronunciation...`,
      );
      void playDesiredPronunciation(state.currentPhrase.phrase);
    } else if (scorePercent !== undefined && scorePercent >= 95) {
      console.log(`Recording ended, score ${scorePercent}% >= 95%, skipping desired pronunciation`);
    }
  };

  // Clean up on error too
  currentAudio.onerror = () => {
    URL.revokeObjectURL(url);
    currentAudio = null;
    console.error("Audio playback error");
  };

  // Wait for audio to be ready before playing (fixes Android issues)
  currentAudio.oncanplay = () => {
    if (currentAudio) {
      currentAudio.play().catch((error: unknown) => {
        console.error("Failed to play audio:", error);
        // Retry once on Android
        setTimeout(() => {
          if (currentAudio) {
            currentAudio.play().catch((retryError: unknown) => {
              console.error("Retry failed:", retryError);
            });
          }
        }, 100);
      });
    }
  };

  // Start loading the audio
  currentAudio.load();
}

/**
 * Check if Web Speech API is supported and has voices available
 * @returns {Promise<boolean>}
 */
function checkSpeechSynthesisSupport() {
  // Return cached result if already checked
  if (speechSynthesisSupported !== null) {
    return Promise.resolve(speechSynthesisSupported);
  }

  // No speechSynthesis API at all
  if (!window.speechSynthesis) {
    speechSynthesisSupported = false;
    return Promise.resolve(false);
  }

  // Check if voices are available (they load async in some browsers)
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      speechSynthesisSupported = true;
      resolve(true);
      return;
    }

    // Wait for voices to load (with timeout)
    const timeout = setTimeout(() => {
      speechSynthesisSupported = false;
      resolve(false);
    }, 1000);

    speechSynthesis.onvoiceschanged = () => {
      clearTimeout(timeout);
      const loadedVoices = speechSynthesis.getVoices();
      speechSynthesisSupported = loadedVoices.length > 0;
      resolve(speechSynthesisSupported);
    };
  });
}

/**
 * Play the desired pronunciation using Web Speech API
 */
export async function playDesiredPronunciation(phrase: string): Promise<void> {
  if (!phrase || !window.speechSynthesis) {
    console.log("Speech synthesis not available");
    return;
  }

  console.log("playDesiredPronunciation called with phrase:", phrase);

  // Get user level to adjust speech rate and preferred voice
  let userLevel = 1;
  let preferredVoiceName: string | null = null;
  const lang = getLanguage();
  try {
    const stats = await db.getUserStats(lang);
    userLevel = stats.userLevel;
    preferredVoiceName = await db.getPreferredVoice(lang);
  } catch (error) {
    console.warn("Could not get user stats for speech rate, using default:", error);
  }

  // Function to actually speak once voices are ready
  const speakPhrase = () => {
    // Cancel any ongoing speech
    speechSynthesis.cancel();

    // CRITICAL: Small delay to avoid Chrome Linux bug where cancel() interferes with speak()
    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(phrase);
      utterance.lang = lang === "de" ? "de-DE" : "en-US";

      // Get available voices
      const voices = speechSynthesis.getVoices();
      const languageVoices = voices.filter((voice) =>
        voice.lang.startsWith(lang === "de" ? "de" : "en"),
      );

      // Log all available voices for debugging
      console.log(`Total voices available: ${voices.length}`);
      console.log(`Language-matched voices (${lang}):`, languageVoices.length);
      languageVoices.forEach((voice) => {
        console.log(`  - ${voice.name} (${voice.lang}) | Local: ${voice.localService}`);
      });

      let selectedVoice: SpeechSynthesisVoice | undefined;

      // First, try to use preferred voice if set
      if (preferredVoiceName) {
        selectedVoice = languageVoices.find((voice) => voice.name === preferredVoiceName);
        if (selectedVoice) {
          console.log("✓ Using preferred voice:", selectedVoice.name);
        } else {
          console.warn("Preferred voice not found:", preferredVoiceName);
        }
      }

      // If no preferred voice or not found, select randomly from offline voices
      if (!selectedVoice) {
        // Prefer offline voices (localService = true), but fall back to all voices if none available
        let availableVoices = languageVoices.filter((voice) => voice.localService);
        if (availableVoices.length === 0) {
          availableVoices = languageVoices;
          console.log("No offline voices available, using all voices");
        } else {
          console.log(
            `Using ${availableVoices.length} offline voices out of ${languageVoices.length} total`,
          );
        }

        if (availableVoices.length > 0) {
          selectedVoice = availableVoices[Math.floor(Math.random() * availableVoices.length)];
          console.log(
            "✓ Selected random voice:",
            selectedVoice.name,
            "| Offline:",
            selectedVoice.localService,
          );
        } else {
          console.warn("⚠ No voices available for this language");
        }
      }

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      // Adjust speech rate based on user level
      // Level 1-599: Scale from 0.5 (very slow) to 1.0 (normal)
      // Level 600+: 1.0 (normal speed)
      let rate: number;
      if (userLevel < 600) {
        // Linear scaling: 0.5 at level 1, approaching 1.0 at level 600
        rate = 0.5 + (userLevel / 600) * 0.5;
      } else {
        rate = 1.0;
      }
      utterance.rate = rate;
      utterance.pitch = 0.95; // Slightly lower pitch for clarity
      utterance.volume = 1.0; // Full volume

      console.log(
        "Speaking phrase:",
        phrase,
        "with language:",
        utterance.lang,
        "| Rate:",
        rate.toFixed(2),
        "(Level:",
        userLevel,
        ")",
      );

      utterance.onstart = () => console.log("Speech started");
      utterance.onend = () => console.log("Speech ended");
      utterance.onerror = (e) => console.error("Speech error:", e);

      speechSynthesis.speak(utterance);
    }, 100); // 100ms delay to avoid Chrome Linux cancel/speak bug
  };

  // Check if voices are already loaded
  const voices = speechSynthesis.getVoices();
  console.log("Available voices:", voices.length);

  if (voices.length > 0) {
    // Voices ready, speak immediately
    console.log("Voices already loaded, speaking immediately");
    speakPhrase();
  } else {
    // Wait for voices to load (happens on first page load)
    console.log("Waiting for speech synthesis voices to load...");
    let hasSpoken = false;

    const onVoicesChanged = () => {
      console.log("Voices loaded via event, speaking now");
      if (!hasSpoken) {
        hasSpoken = true;
        speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        speakPhrase();
      }
    };
    speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);

    // Fallback timeout in case voiceschanged never fires
    setTimeout(() => {
      const voicesNow = speechSynthesis.getVoices();
      console.log("Timeout check: voices available:", voicesNow.length);
      if (voicesNow.length > 0 && !hasSpoken) {
        hasSpoken = true;
        speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        speakPhrase();
      } else if (!hasSpoken) {
        console.warn("No voices available after timeout");
      }
    }, 500);
  }
}

/**
 * Generate HTML for side-by-side phoneme comparison using table layout
 */
function generatePhonemeComparisonHTML(phonemeComparison: PhonemeComparisonItem[]): string {
  // Guard against undefined or non-array input
  if (!phonemeComparison || !Array.isArray(phonemeComparison) || phonemeComparison.length === 0) {
    return "";
  }

  // Build class and tooltip data for each column
  const columns = phonemeComparison.map((comp: PhonemeComparisonItem) => {
    const target = comp.target || "—";
    const actual = comp.actual || "—";

    let pairClass = "match";
    if (!comp.match) {
      if (comp.target && !comp.actual) {
        pairClass = "missing";
      } else if (!comp.target && comp.actual) {
        pairClass = "extra";
      } else {
        pairClass = "mismatch";
      }
    }

    const tooltip = comp.match
      ? t("feedback.phoneme_match")
      : `${t("feedback.distance")}: ${comp.distance.toFixed(2)}`;

    return { target, actual, pairClass, tooltip };
  });

  // Build table with two rows for proper text selection
  let html = '<table class="phoneme-table"><tbody>';

  // Target row
  html += '<tr class="phoneme-row-target">';
  for (const col of columns) {
    html += `<td class="phoneme-cell ${col.pairClass}" title="${col.tooltip}">${col.target}</td>`;
  }
  html += "</tr>";

  // Actual row
  html += '<tr class="phoneme-row-actual">';
  for (const col of columns) {
    html += `<td class="phoneme-cell ${col.pairClass}" title="${col.tooltip}">${col.actual}</td>`;
  }
  html += "</tr>";

  html += "</tbody></table>";
  return html;
}

/**
 * Setup long press detection for voice selection dialog
 * @param buttonIds - Array of button element IDs to attach long press to
 */
export function setupVoiceSelectionButton(buttonIds: string[] = ["play-target-btn"]): void {
  buttonIds.forEach((buttonId) => {
    const button = document.getElementById(buttonId);
    if (!button) {
      console.warn(`Voice selection: Button not found: ${buttonId}`);
      return;
    }

    let pressTimer: number | null = null;
    let longPressTriggered = false;

    const startPress = () => {
      longPressTriggered = false;
      pressTimer = window.setTimeout(() => {
        longPressTriggered = true;
        console.log("Long press detected, showing voice selection dialog");
        void showVoiceSelectionDialog();
      }, 500); // 500ms for long press
    };

    const endPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    // Intercept click to prevent default action if long press occurred
    const handleClick = (e: Event) => {
      if (longPressTriggered) {
        e.preventDefault();
        e.stopPropagation();
        longPressTriggered = false;
        return false;
      }
    };

    button.addEventListener("mousedown", startPress);
    button.addEventListener("mouseup", endPress);
    button.addEventListener("mouseleave", endPress);
    button.addEventListener("touchstart", startPress);
    button.addEventListener("touchend", endPress);
    button.addEventListener("touchcancel", endPress);
    button.addEventListener("click", handleClick, true); // Use capture phase

    console.log(`Voice selection long-press handler attached to: ${buttonId}`);
  });
}

/**
 * Show voice selection dialog
 */
async function showVoiceSelectionDialog(): Promise<void> {
  const modal = document.getElementById("voice-selection-modal");
  const voiceList = document.getElementById("voice-list");
  if (!modal || !voiceList) return;

  const lang = getLanguage();

  // Function to populate the voice list once voices are available
  const populateVoiceList = async () => {
    const voices = speechSynthesis.getVoices();
    const languageVoices = voices.filter((voice) =>
      voice.lang.startsWith(lang === "de" ? "de" : "en"),
    );

    // Get current preferred voice
    const preferredVoiceName = await db.getPreferredVoice(lang);

    // Clear and populate voice list
    voiceList.innerHTML = "";

    for (const voice of languageVoices) {
      const item = document.createElement("div");
      item.className = "list-group-item";
      item.style.cursor = "pointer";

      // Create 3-column layout
      const row = document.createElement("div");
      row.className = "d-flex justify-content-between align-items-center gap-3";

      // Column 1: Voice name (clickable)
      const nameSpan = document.createElement("span");
      nameSpan.textContent = voice.name;
      nameSpan.className = "voice-name";
      nameSpan.style.flex = "1";
      nameSpan.style.minWidth = "0"; // Allow text truncation

      // Column 2: Offline/Online badge
      const statusBadge = document.createElement("span");
      statusBadge.className = `badge ${voice.localService ? "bg-success" : "bg-secondary"}`;
      statusBadge.textContent = voice.localService ? "Offline" : "Online";
      statusBadge.style.minWidth = "70px";
      statusBadge.style.textAlign = "center";

      // Column 3: Checkbox
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "form-check-input";
      checkbox.checked = voice.name === preferredVoiceName;
      checkbox.style.cursor = "pointer";

      // Play phrase when clicking the row (but not checkbox)
      const playVoice = () => {
        if (state.currentPhrase?.phrase) {
          void playWithSpecificVoice(state.currentPhrase.phrase, voice);
        }
      };

      item.onclick = playVoice;
      nameSpan.onclick = playVoice;
      statusBadge.onclick = playVoice;

      // Save preference when checkbox is clicked
      checkbox.onclick = async (e) => {
        e.stopPropagation();
        if (checkbox.checked) {
          await db.savePreferredVoice(lang, voice.name);
          // Uncheck all other checkboxes
          voiceList.querySelectorAll("input[type='checkbox']").forEach((cb) => {
            if (cb !== checkbox) {
              (cb as HTMLInputElement).checked = false;
            }
          });
        } else {
          // If unchecking, clear the preference
          await db.savePreferredVoice(lang, "");
        }
      };

      row.appendChild(nameSpan);
      row.appendChild(statusBadge);
      row.appendChild(checkbox);
      item.appendChild(row);
      voiceList.appendChild(item);
    }

    // Show modal using Bootstrap
    const bootstrap = (
      window as { bootstrap?: { Modal: new (el: Element) => { show: () => void } } }
    ).bootstrap;
    if (bootstrap) {
      const bsModal = new bootstrap.Modal(modal);
      bsModal.show();
    }
  };

  // Check if voices are already loaded
  const voices = speechSynthesis.getVoices();
  console.log(`Voice selection: Found ${voices.length} voices initially`);

  if (voices.length > 0) {
    await populateVoiceList();
  } else {
    // Wait for voices to load
    console.log("Voice selection: Waiting for voices to load...");
    speechSynthesis.onvoiceschanged = () => {
      console.log("Voice selection: Voices loaded via onvoiceschanged event");
      void populateVoiceList();
    };
  }
}

/**
 * Play phrase with a specific voice
 */
async function playWithSpecificVoice(phrase: string, voice: SpeechSynthesisVoice): Promise<void> {
  if (!phrase || !window.speechSynthesis) return;

  // Get user level for rate adjustment
  let userLevel = 1;
  try {
    const stats = await db.getUserStats(getLanguage());
    userLevel = stats.userLevel;
  } catch (error) {
    console.warn("Could not get user stats for speech rate:", error);
  }

  // Calculate speech rate
  let rate: number;
  if (userLevel < 600) {
    rate = 0.5 + (userLevel / 600) * 0.5;
  } else {
    rate = 1.0;
  }

  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(phrase);
  utterance.voice = voice;
  utterance.rate = rate;
  utterance.pitch = 0.95;
  utterance.volume = 1.0;

  console.log("Playing with voice:", voice.name, "| Rate:", rate.toFixed(2));
  speechSynthesis.speak(utterance);
}
