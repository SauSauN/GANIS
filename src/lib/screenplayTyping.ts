import type { ScreenplayKind } from "@/types";

/*
 * Saisie assistée du scénario (testée) : suggestions pendant la frappe.
 * - transition, plan : les formules du métier, filtrées par ce qui est tapé ;
 * - action : le dernier mot commencé se complète par le nom d'un personnage
 *   (en capitales, comme on présente un personnage) ou d'un lieu ;
 * - didascalie : les plus courantes.
 */

export const TRANSITIONS = [
  "COUPE FRANCHE :",
  "FONDU ENCHAÎNÉ :",
  "FONDU AU NOIR.",
  "FONDU AU BLANC.",
  "FONDU EN OUVERTURE :",
  "RACCORD :",
  "CUT TO:",
  "SMASH CUT TO:",
  "MATCH CUT TO:",
  "DISSOLVE TO:",
  "FADE OUT.",
];

export const SHOTS = [
  "GROS PLAN SUR",
  "TRÈS GROS PLAN SUR",
  "PLAN LARGE",
  "PLAN D'ENSEMBLE",
  "PLAN SUBJECTIF",
  "CONTRECHAMP",
  "INSERT :",
  "TRAVELLING",
  "PANORAMIQUE",
  "FLASH-BACK.",
  "RETOUR AU PRÉSENT.",
  "CLOSE ON",
  "ANGLE ON",
  "POV",
];

export const PARENTHETICALS = [
  "à voix basse",
  "un temps",
  "off",
  "en voix off",
  "au téléphone",
  "pour elle-même",
  "pour lui-même",
  "souriant",
  "hésitant",
  "criant",
  "V.O.",
  "O.S.",
  "beat",
];

/** Comparaison sans accents ni casse. */
const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface Completion {
  /** Ce que l'on montre. */
  label: string;
  /** Texte complet de l'élément une fois la suggestion choisie. */
  value: string;
}

export interface Names {
  characters: string[];
  locations: string[];
}

/**
 * Suggestions pour un élément en cours de frappe (au plus `limit`). Rien
 * quand la suggestion est déjà écrite en entier.
 */
export function completions(kind: ScreenplayKind, text: string, names: Names, limit = 4): Completion[] {
  if (kind === "transition" || kind === "shot") {
    const typed = fold(text.trim());
    const list = kind === "transition" ? TRANSITIONS : SHOTS;
    return list
      .filter((s) => fold(s).startsWith(typed) && fold(s) !== typed)
      .slice(0, limit)
      .map((s) => ({ label: s, value: s }));
  }
  if (kind === "action" || kind === "dialogue") {
    const match = text.match(/(^|[\s(«"'’-])([\p{L}][\p{L}'’-]{1,})$/u);
    if (!match) return [];
    const word = fold(match[2]);
    const before = text.slice(0, text.length - match[2].length);
    const seen = new Set<string>();
    const out: Completion[] = [];
    const push = (shown: string) => {
      if (seen.has(shown) || out.length >= limit) return;
      seen.add(shown);
      out.push({ label: shown, value: before + shown });
    };
    for (const name of names.characters) {
      const parts = [name, ...name.split(/\s+/)];
      if (parts.some((p) => fold(p).startsWith(word) && fold(p) !== word)) push(kind === "action" ? name.toUpperCase() : name);
    }
    for (const name of names.locations) if (fold(name).startsWith(word) && fold(name) !== word) push(name);
    return out;
  }
  return [];
}
