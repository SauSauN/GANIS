import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

/** Choix de l'utilisateur : un thème fixe, ou le thème du système. */
export type ThemeMode = Theme | "system";

const KEY = "ganis-theme";
const EVENT = "ganis:theme-change";

function readStoredMode(): ThemeMode | null {
  try {
    const saved = localStorage.getItem(KEY);

    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved;
    }
  } catch {
    /* stockage indisponible : on suit le système */
  }

  return null;
}

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function paint(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function notify() {
  window.dispatchEvent(new Event(EVENT));
}

/** Choix enregistré, ou « system » par défaut. */
export function getThemeMode(): ThemeMode {
  return readStoredMode() ?? "system";
}

/** Thème réellement affiché pour un choix donné. */
export function resolveTheme(mode: ThemeMode): Theme {
  return mode === "system" ? systemTheme() : mode;
}

/** Thème à afficher au démarrage. */
export function getInitialTheme(): Theme {
  return resolveTheme(getThemeMode());
}

/** Enregistre le choix de thème et l'applique immédiatement. */
export function setThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* ignoré */
  }

  paint(resolveTheme(mode));
  notify();
}

/** Applique un thème fixe (clair ou sombre) et l'enregistre. */
export function applyTheme(theme: Theme) {
  setThemeMode(theme);
}

/**
 * Initialise le thème au démarrage, avant le premier rendu.
 *
 * N'écrit rien dans le stockage : un choix « système » reste « système ».
 * Suit aussi les changements de thème du système tant que ce choix est actif.
 */
export function initTheme() {
  paint(getInitialTheme());

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (getThemeMode() === "system") {
        paint(systemTheme());
        notify();
      }
    });
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);

  return () => window.removeEventListener(EVENT, onChange);
}

/** Choix de thème courant, mis à jour dès qu'il change. */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, getThemeMode);
}

/** Thème réellement affiché (clair ou sombre), mis à jour dès qu'il change. */
export function useResolvedTheme(): Theme {
  return useSyncExternalStore(subscribe, () =>
    document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
}