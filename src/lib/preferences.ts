import { useSyncExternalStore } from "react";

/**
 * Préférences d'affichage de l'interface.
 *
 * Elles sont propres à l'appareil et distinctes des données narratives :
 * les modifier n'altère jamais le contenu d'un projet.
 */

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

const KEY = "ganis-text-size";
const EVENT = "ganis:text-size-change";

export function getTextSize(): TextSize {
  try {
    const saved = localStorage.getItem(KEY);

    if (saved === "small" || saved === "normal" || saved === "large") {
      return saved;
    }
  } catch {
    /* stockage indisponible : taille par défaut */
  }

  return "normal";
}

function paint(size: TextSize) {
  const root = document.documentElement;

  if (size === "normal") {
    root.style.removeProperty("font-size");
  } else {
    root.style.fontSize = `${TEXT_SIZE_PX[size]}px`;
  }
}

/** Applique la taille enregistrée au démarrage, avant le premier rendu. */
export function initTextSize() {
  paint(getTextSize());
}

/** Enregistre la taille du texte et l'applique immédiatement. */
export function setTextSize(size: TextSize) {
  try {
    localStorage.setItem(KEY, size);
  } catch {
    /* ignoré */
  }

  paint(size);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);

  return () => window.removeEventListener(EVENT, onChange);
}

/** Taille du texte courante, mise à jour dès qu'elle change. */
export function useTextSize(): TextSize {
  return useSyncExternalStore(subscribe, getTextSize);
}