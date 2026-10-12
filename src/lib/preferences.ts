import { useSyncExternalStore } from "react";

/**
 * Préférences d'affichage de l'interface.
 *
 * Elles sont propres à l'appareil et distinctes des données narratives :
 * les modifier n'altère jamais le contenu d'un projet.
 */

function subscribeTo(event: string) {
  return (onChange: () => void) => {
    window.addEventListener(event, onChange);

    return () => window.removeEventListener(event, onChange);
  };
}

// ----------------------------------------------------------------------------
// Taille du texte
// ----------------------------------------------------------------------------

export type TextSize = "small" | "normal" | "large";

export const TEXT_SIZES: TextSize[] = ["small", "normal", "large"];

export const TEXT_SIZE_LABELS: Record<TextSize, string> = {
  small: "Petite",
  normal: "Normale",
  large: "Grande",
};

/** Taille de base de l'interface, en pixels (toute l'interface est en rem). */
const TEXT_SIZE_PX: Record<TextSize, number> = {
  small: 14,
  normal: 16,
  large: 18,
};

const TEXT_SIZE_KEY = "ganis-text-size";
const TEXT_SIZE_EVENT = "ganis:text-size-change";

export function getTextSize(): TextSize {
  try {
    const saved = localStorage.getItem(TEXT_SIZE_KEY);

    if (saved === "small" || saved === "normal" || saved === "large") {
      return saved;
    }
  } catch {
    /* stockage indisponible : taille par défaut */
  }

  return "normal";
}

function paintTextSize(size: TextSize) {
  const root = document.documentElement;

  if (size === "normal") {
    root.style.removeProperty("font-size");
  } else {
    root.style.fontSize = `${TEXT_SIZE_PX[size]}px`;
  }
}

/** Applique la taille enregistrée au démarrage, avant le premier rendu. */
export function initTextSize() {
  paintTextSize(getTextSize());
}

/** Enregistre la taille du texte et l'applique immédiatement. */
export function setTextSize(size: TextSize) {
  try {
    localStorage.setItem(TEXT_SIZE_KEY, size);
  } catch {
    /* ignoré */
  }

  paintTextSize(size);
  window.dispatchEvent(new Event(TEXT_SIZE_EVENT));
}

/** Taille du texte courante, mise à jour dès qu'elle change. */
export function useTextSize(): TextSize {
  return useSyncExternalStore(subscribeTo(TEXT_SIZE_EVENT), getTextSize);
}

// ----------------------------------------------------------------------------
// Barre latérale de l'espace de travail (icônes seules ou icônes + noms)
// ----------------------------------------------------------------------------

const RAIL_KEY = "ganis-rail-expanded";
const RAIL_EVENT = "ganis:rail-change";

/** Vrai si la barre de gauche affiche les noms (valeur par défaut). */
export function getRailExpanded(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) !== "false";
  } catch {
    return true;
  }
}

/** Enregistre l'état de la barre de gauche. */
export function setRailExpanded(expanded: boolean) {
  try {
    localStorage.setItem(RAIL_KEY, String(expanded));
  } catch {
    /* ignoré */
  }

  window.dispatchEvent(new Event(RAIL_EVENT));
}

/** État de la barre de gauche, mis à jour dès qu'il change. */
export function useRailExpanded(): boolean {
  return useSyncExternalStore(subscribeTo(RAIL_EVENT), getRailExpanded);
}

// ----------------------------------------------------------------------------
// Largeur du panneau du milieu de l'espace de travail
// ----------------------------------------------------------------------------

/** Largeur minimale (px) du panneau ouvert. */
export const PANEL_MIN_WIDTH = 200;

/** Largeur maximale (px) du panneau. */
export const PANEL_MAX_WIDTH = 480;

/** Largeur par défaut (px), rétablie par un double-clic sur le bord. */
export const PANEL_DEFAULT_WIDTH = 256;

/**
 * Tiré en dessous de cette largeur (px), le panneau se replie, puis se
 * ferme au relâchement du bouton.
 */
export const PANEL_CLOSE_THRESHOLD = 120;

const PANEL_WIDTH_KEY = "ganis-panel-width";
const PANEL_WIDTH_EVENT = "ganis:panel-width-change";

/** Ramène une largeur dans les bornes autorisées. */
export function clampPanelWidth(width: number): number {
  return Math.round(
    Math.min(Math.max(width, PANEL_MIN_WIDTH), PANEL_MAX_WIDTH),
  );
}

/** Largeur enregistrée du panneau du milieu. */
export function getPanelWidth(): number {
  try {
    const saved = localStorage.getItem(PANEL_WIDTH_KEY);

    if (saved !== null) {
      const width = Number(saved);

      if (Number.isFinite(width)) {
        return clampPanelWidth(width);
      }
    }
  } catch {
    /* stockage indisponible : largeur par défaut */
  }

  return PANEL_DEFAULT_WIDTH;
}

/** Enregistre la largeur du panneau du milieu. */
export function setPanelWidth(width: number) {
  try {
    localStorage.setItem(PANEL_WIDTH_KEY, String(clampPanelWidth(width)));
  } catch {
    /* ignoré */
  }

  window.dispatchEvent(new Event(PANEL_WIDTH_EVENT));
}

/** Largeur du panneau du milieu, mise à jour dès qu'elle change. */
export function usePanelWidth(): number {
  return useSyncExternalStore(subscribeTo(PANEL_WIDTH_EVENT), getPanelWidth);
}

// ----------------------------------------------------------------------------
// Enregistrement automatique
// ----------------------------------------------------------------------------

/** Délais proposés (secondes) entre la dernière modification et l'enregistrement. */
export const AUTO_SAVE_DELAYS = [1, 3, 10, 30] as const;

export type AutoSaveDelay = (typeof AUTO_SAVE_DELAYS)[number];

export interface AutoSaveSettings {
  /** Désactivé par défaut : l'utilisateur enregistre lui-même. */
  enabled: boolean;
  delay: AutoSaveDelay;
}

const AUTO_SAVE_KEY = "ganis-auto-save";
const AUTO_SAVE_EVENT = "ganis:auto-save-change";
const DEFAULT_AUTO_SAVE: AutoSaveSettings = { enabled: false, delay: 3 };

function isAutoSaveDelay(value: unknown): value is AutoSaveDelay {
  return AUTO_SAVE_DELAYS.includes(value as AutoSaveDelay);
}

// Même objet tant que la valeur enregistrée ne change pas
// (exigé par `useSyncExternalStore`).
let autoSaveRaw: string | null | undefined;
let autoSaveCache: AutoSaveSettings = DEFAULT_AUTO_SAVE;

export function getAutoSave(): AutoSaveSettings {
  let raw: string | null = null;

  try {
    raw = localStorage.getItem(AUTO_SAVE_KEY);
  } catch {
    /* stockage indisponible : réglage par défaut */
  }

  if (raw === autoSaveRaw) {
    return autoSaveCache;
  }

  autoSaveRaw = raw;
  autoSaveCache = DEFAULT_AUTO_SAVE;

  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;

    if (typeof parsed === "object" && parsed !== null) {
      const { enabled, delay } = parsed as Record<string, unknown>;

      autoSaveCache = {
        enabled: enabled === true,
        delay: isAutoSaveDelay(delay) ? delay : DEFAULT_AUTO_SAVE.delay,
      };
    }
  } catch {
    /* valeur illisible : réglage par défaut */
  }

  return autoSaveCache;
}

/** Enregistre le réglage d'enregistrement automatique. */
export function setAutoSave(changes: Partial<AutoSaveSettings>) {
  const next = { ...getAutoSave(), ...changes };

  try {
    localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(next));
  } catch {
    /* ignoré */
  }

  window.dispatchEvent(new Event(AUTO_SAVE_EVENT));
}

/** Réglage d'enregistrement automatique, mis à jour dès qu'il change. */
export function useAutoSave(): AutoSaveSettings {
  return useSyncExternalStore(subscribeTo(AUTO_SAVE_EVENT), getAutoSave);
}
