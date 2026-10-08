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