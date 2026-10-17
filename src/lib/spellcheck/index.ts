import enAff from "@/assets/dictionaries/en.aff?url&no-inline";
import enDic from "@/assets/dictionaries/en.dic?url&no-inline";
import frAff from "@/assets/dictionaries/fr.aff?url&no-inline";
import frDic from "@/assets/dictionaries/fr.dic?url&no-inline";

/*
 * Correcteur orthographique des notes, dans la langue du logiciel (et non
 * celle du système) : français si GANIS est en français, anglais s'il est
 * en anglais. Le travail se fait dans un worker ; les réponses sont gardées
 * en mémoire, mot par mot.
 */

export type SpellLanguage = "fr" | "en";

const DICTIONARIES: Record<SpellLanguage, { aff: string; dic: string }> = {
  fr: { aff: frAff, dic: frDic },
  en: { aff: enAff, dic: enDic },
};

export function spellLanguage(language: string | undefined): SpellLanguage {
  return language?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

/** Mots d'un texte, avec leur position (apostrophes et traits d'union compris). */
export function wordsOf(text: string): Array<{ word: string; index: number }> {
  const result: Array<{ word: string; index: number }> = [];
  for (const match of text.matchAll(/[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu)) {
    const word = match[0];
    // Une lettre seule, un sigle en capitales : pas vérifiés.
    if (word.length < 2 || (word.length <= 5 && word === word.toUpperCase())) continue;
    result.push({ word, index: match.index ?? 0 });
  }
  return result;
}

// ----------------------------------------------------------------------------
// Dictionnaire personnel (mots ajoutés par l'auteur, sur cet ordinateur)
// ----------------------------------------------------------------------------

const PERSONAL_KEY = "ganis.spellcheck.personal";

function readPersonal(): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(PERSONAL_KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

let personal: Set<string> | null = null;

export function isPersonalWord(word: string): boolean {
  personal ??= readPersonal();
  return personal.has(word.toLowerCase());
}

export function addPersonalWord(word: string) {
  personal ??= readPersonal();
  personal.add(word.toLowerCase());
  try {
    localStorage.setItem(PERSONAL_KEY, JSON.stringify([...personal]));
  } catch {
    // Stockage indisponible : le mot reste accepté pendant la séance.
  }
}

// ----------------------------------------------------------------------------
// Worker
// ----------------------------------------------------------------------------

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, (data: { wrong?: string[]; suggestions?: string[]; error?: string }) => void>();
/** Réponses connues, par langue : mot → correct ? */
const known: Record<SpellLanguage, Map<string, boolean>> = { fr: new Map(), en: new Map() };
let broken = false;

function send(message: Record<string, unknown>): Promise<{ wrong?: string[]; suggestions?: string[]; error?: string }> {
  if (!worker) {
    worker = new Worker(new URL("./speller.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ id: number }>) => {
      const resolve = waiting.get(event.data.id);
      waiting.delete(event.data.id);
      resolve?.(event.data as never);
    };
    worker.onerror = () => {
      broken = true;
      for (const resolve of waiting.values()) resolve({ error: "worker" });
      waiting.clear();
    };
  }
  const id = nextId++;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    worker!.postMessage({ id, ...message });
  });
}

/** Réponse déjà connue pour ce mot (`undefined` : pas encore vérifié). */
export function cachedCorrect(lang: SpellLanguage, word: string): boolean | undefined {
  if (isPersonalWord(word)) return true;
  return known[lang].get(word);
}

/** Vérifie des mots (ceux déjà connus ne sont pas renvoyés au worker). */
export async function checkWords(lang: SpellLanguage, words: Iterable<string>): Promise<boolean> {
  if (broken) return false;
  const todo = [...new Set(words)].filter((w) => !known[lang].has(w));
  if (!todo.length) return false;
  const { wrong, error } = await send({ type: "check", lang, ...DICTIONARIES[lang], words: todo });
  if (error) return false;
  const bad = new Set(wrong);
  for (const w of todo) known[lang].set(w, !bad.has(w));
  return true;
}

export async function suggestWords(lang: SpellLanguage, word: string): Promise<string[]> {
  if (broken) return [];
  const { suggestions } = await send({ type: "suggest", lang, ...DICTIONARIES[lang], word });
  return suggestions ?? [];
}
