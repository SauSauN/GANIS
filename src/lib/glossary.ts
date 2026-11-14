import type { GlossaryTerm } from "@/types";

/*
 * Glossaire : tri alphabétique, regroupement par lettre et recherche.
 *
 * Les accents et la casse ne comptent ni pour le tri ni pour la lettre :
 * « Éclipse » se range sous E, entre « eau » et « écume ». Un terme qui ne
 * commence pas par une lettre (« 7e lune », « « Ressac » ») est rangé sous #.
 */

/** Groupe des termes qui ne commencent pas par une lettre. */
export const OTHER_LETTER = "#";

const collator = new Intl.Collator(["fr", "en"], { sensitivity: "base", numeric: true, ignorePunctuation: true });

/** Texte sans accents ni casse, pour comparer et chercher. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
}

/** Termes triés par ordre alphabétique (puis par date de création). */
export function sortTerms(terms: GlossaryTerm[]): GlossaryTerm[] {
  return [...terms].sort(
    (a, b) => collator.compare(a.term.trim(), b.term.trim()) || a.createdAt.localeCompare(b.createdAt),
  );
}

/** Lettre sous laquelle le terme est rangé (« É » → « E », « 7e lune » → « # »). */
export function letterOf(term: string): string {
  // Le premier caractère qui est une lettre ou un chiffre décide ; une
  // ponctuation d'ouverture (guillemets, parenthèse) est ignorée.
  const first = fold(term).match(/[\p{L}\p{N}]/u)?.[0];
  if (!first || !/\p{L}/u.test(first)) return OTHER_LETTER;
  return (LIGATURES[first] ?? first).toLocaleUpperCase();
}

/** Ligatures rangées sous leur première lettre (« Œil » sous O). */
const LIGATURES: Record<string, string> = { "œ": "o", "æ": "a", "ß": "s" };

export interface LetterGroup {
  letter: string;
  terms: GlossaryTerm[];
}

/** Termes regroupés par lettre, groupes dans l'ordre alphabétique, # à la fin. */
export function groupByLetter(terms: GlossaryTerm[]): LetterGroup[] {
  const groups = new Map<string, GlossaryTerm[]>();
  for (const term of sortTerms(terms)) {
    const letter = letterOf(term.term);
    const list = groups.get(letter);
    if (list) list.push(term);
    else groups.set(letter, [term]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === OTHER_LETTER ? 1 : b === OTHER_LETTER ? -1 : collator.compare(a, b)))
    .map(([letter, list]) => ({ letter, terms: list }));
}

/**
 * Termes qui contiennent tous les mots de la recherche, dans le terme, la
 * définition ou la catégorie (sans tenir compte des accents ni de la casse).
 * `category` : seulement les termes de cette catégorie (`""` : sans catégorie).
 */
export function filterTerms(terms: GlossaryTerm[], query: string, category: string | null = null): GlossaryTerm[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return terms.filter((term) => {
    if (category !== null && fold(term.category.trim()) !== fold(category.trim())) return false;
    if (words.length === 0) return true;
    const haystack = fold(`${term.term} ${term.definition} ${term.category}`);
    return words.every((word) => haystack.includes(word));
  });
}

/** Catégories utilisées, sans doublon (casse et accents ignorés), triées. */
export function categoriesOf(terms: GlossaryTerm[]): string[] {
  const seen = new Map<string, string>();
  for (const term of terms) {
    const category = term.category.trim();
    if (category && !seen.has(fold(category))) seen.set(fold(category), category);
  }
  return [...seen.values()].sort(collator.compare);
}
