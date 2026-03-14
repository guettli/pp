import { writable } from "svelte/store";

/** Set to true while catch-it game is actively playing (fullscreen mode). */
export const isFullscreenGame = writable(false);
