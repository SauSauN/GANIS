import { useSyncExternalStore } from "react";
import type { ProjectSpace } from "@/lib/projectSpace";

/**
 * Guide de démarrage du tableau de bord.
 *
 * Affiché à la première visite, dans l'espace public comme dans l'espace
 * privé (un état par espace, et par compte pour l'espace privé). Une fois
 * terminé ou ignoré, il ne s'impose plus ; on peut le rouvrir depuis le
 * tableau de bord.
 *
 * L'état est propre à l'appareil (préférence d'interface, pas une donnée
 * narrative). Sans stockage disponible, le guide reste simplement affiché
 * jusqu'à ce qu'on le ferme pour la session.
 */

/** Étapes du guide, dans l'ordre d'affichage. */
export type GuideStepId = "create" | "universe" | "story" | "extra";

export const GUIDE_STEPS: GuideStepId[] = ["create", "universe", "story", "extra"];

export interface GuideState {
  /** Vrai une fois le guide terminé ou ignoré. */
  closed: boolean;
  /** Étapes déjà faites depuis le guide. */
  done: GuideStepId[];
}

const KEY_PREFIX = "ganis-start-guide:";
const CHANGE_EVENT = "ganis:start-guide-change";

const EMPTY: GuideState = { closed: false, done: [] };

/** Clé de stockage : un état par espace, et par compte pour l'espace privé. */
export function guideKey(space: ProjectSpace, userId?: string | null): string {
  return space === "private" ? `${KEY_PREFIX}private:${userId ?? ""}` : `${KEY_PREFIX}public`;
}

/** Lit un état enregistré ; toute valeur inattendue redonne l'état initial. */
export function parseGuideState(raw: string | null): GuideState {
  if (!raw) return EMPTY;

  try {
    const parsed = JSON.parse(raw) as Partial<GuideState> | null;

    if (!parsed || typeof parsed !== "object") return EMPTY;

    const done = Array.isArray(parsed.done)
      ? GUIDE_STEPS.filter((step) => parsed.done!.includes(step))
      : [];

    return { closed: parsed.closed === true, done };
  } catch {
    return EMPTY;
  }
}

/** États gardés pour la session si le stockage est indisponible. */
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, state: GuideState) {
  const raw = JSON.stringify(state);

  try {
    localStorage.setItem(key, raw);
  } catch {
    memory.set(key, raw);
  }

  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getGuideState(key: string): GuideState {
  return parseGuideState(read(key));
}

/** Marque une étape comme faite (sans fermer le guide). */
export function markGuideStep(key: string, step: GuideStepId) {
  const state = getGuideState(key);
  if (state.done.includes(step)) return;
  write(key, { ...state, done: [...state.done, step] });
}

/** Ferme le guide (terminé ou ignoré) : il ne s'ouvrira plus seul. */
export function closeGuide(key: string) {
  write(key, { ...getGuideState(key), closed: true });
}

/** Rouvre le guide à la demande. */
export function reopenGuide(key: string) {
  write(key, { ...getGuideState(key), closed: false });
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** État du guide pour une clé, mis à jour à chaque changement. */
export function useGuideState(key: string): GuideState {
  // La chaîne brute sert d'instantané : stable tant que rien ne change.
  const raw = useSyncExternalStore(subscribe, () => read(key));
  return parseGuideState(raw);
}
