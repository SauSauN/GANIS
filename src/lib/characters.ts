import catalog from "@/lib/characterFields.json";
import type {
  Character,
  CharacterDetailLevel,
  CharacterInput,
  CharacterListKey,
  CharacterSettings,
} from "@/types";

/*
 * Fiche de personnage : trois niveaux de 15 champs.
 *
 *   Niveau 1 — Basique : l'identité        (identifier le personnage)
 *   Niveau 2 — Moyen   : l'apparence       (le visualiser, le reconnaître)
 *   Niveau 3 — Avancé  : la personnalité   (le rendre crédible et évolutif)
 *
 * Le niveau vaut pour tout le projet : il est choisi à la création du
 * premier personnage, puis se change dans les paramètres du projet. Les
 * niveaux sont cumulatifs. Passer à un niveau inférieur ne supprime rien.
 *
 * Les champs enregistrés dans `fields` sont décrits dans
 * `characterFields.json`. Rust a la même liste (`character_service::FIELDS`)
 * et un test vérifie qu'elles sont identiques. Hors de `fields` : nom
 * complet (prénom + nom), rôle, statut, image principale, galerie.
 */

// ----------------------------------------------------------------------------
// Niveaux
// ----------------------------------------------------------------------------

export const DETAIL_LEVELS: CharacterDetailLevel[] = ["basic", "intermediate", "advanced"];

/** Nombre de champs de chaque niveau. */
export const FIELDS_PER_LEVEL = 15;

/** Vrai si une fiche de niveau `level` affiche ce qui apparaît à `from`. */
export function levelIncludes(level: CharacterDetailLevel, from: CharacterDetailLevel): boolean {
  return DETAIL_LEVELS.indexOf(level) >= DETAIL_LEVELS.indexOf(from);
}

/** Niveaux affichés par une fiche de ce niveau. */
export function levelsUpTo(level: CharacterDetailLevel): CharacterDetailLevel[] {
  return DETAIL_LEVELS.filter((item) => levelIncludes(level, item));
}

// ----------------------------------------------------------------------------
// Listes personnalisables
// ----------------------------------------------------------------------------

export const LIST_KEYS: CharacterListKey[] = ["role", "status", "gender", "build"];

/**
 * Valeurs par défaut des listes. Ce sont des codes, traduits par
 * `characters.json` (`lists.<liste>.<code>`) ; les valeurs ajoutées par
 * l'utilisateur sont du texte affiché tel quel.
 */
export const DEFAULT_LISTS: Record<CharacterListKey, string[]> = {
  role: ["main", "secondary", "antagonist", "mentor", "ally", "extra"],
  status: ["alive", "dead", "missing", "transformed", "newIdentity", "unknown"],
  gender: ["female", "male", "nonBinary", "other"],
  build: ["slim", "athletic", "average", "muscular", "stocky", "heavy"],
};

/** Valeurs d'une liste pour ce projet. */
export function listValues(
  lists: CharacterSettings["lists"],
  key: CharacterListKey,
): string[] {
  return lists[key] ?? DEFAULT_LISTS[key];
}

/** Vrai si la valeur est un code par défaut (donc à traduire). */
export function isDefaultValue(key: CharacterListKey, value: string): boolean {
  return DEFAULT_LISTS[key].includes(value);
}

// ----------------------------------------------------------------------------
// Champs
// ----------------------------------------------------------------------------

export type FieldKind = "text" | "longText" | "date" | "choice" | "reference" | "place" | "tags" | "colors";

export interface CharacterField {
  key: string;
  /** Niveau qui propose ce champ. */
  level: CharacterDetailLevel;
  kind: FieldKind;
  maxLength: number;
  /** Liste personnalisable (champs « choice »). */
  list?: CharacterListKey;
}

export const CHARACTER_FIELDS: CharacterField[] = catalog.map((field) => ({
  key: field.key,
  level: field.level as CharacterDetailLevel,
  kind: field.kind as FieldKind,
  maxLength: field.maxLength,
  list: "list" in field ? (field.list as CharacterListKey) : undefined,
}));

const FIELD_KEYS = new Set(CHARACTER_FIELDS.map((field) => field.key));

/** Champs (de `fields`) propres à un niveau. */
export function fieldsOfLevel(level: CharacterDetailLevel): CharacterField[] {
  return CHARACTER_FIELDS.filter((field) => field.level === level);
}

/** Étiquettes (champ « tags ») : tableau JSON → liste. */
export function parseList(value: string | undefined): string[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    // Ancienne valeur en texte simple : une seule étiquette.
    return [value];
  }
}

/** Liste → valeur enregistrée (vide si la liste est vide). */
export function serializeList(values: string[]): string {
  return values.length > 0 ? JSON.stringify(values) : "";
}

// ----------------------------------------------------------------------------
// Nom
// ----------------------------------------------------------------------------

/** Longueur maximale du prénom, et du nom (identique à Rust). */
export const MAX_NAME_LENGTH = 100;

/** Prénom et nom, dans cet ordre, le nom en majuscules (« Aldric VENN »). */
export function fullName(person: { firstName: string; lastName: string }): string {
  return [person.firstName.trim(), person.lastName.trim().toLocaleUpperCase()].filter(Boolean).join(" ");
}

/** Erreur du prénom et du nom, vérifiée avant l'envoi (Rust vérifie aussi). */
export function nameError(
  firstName: string,
  lastName: string,
): "nameRequired" | "nameTooLong" | null {
  const first = firstName.trim();
  const last = lastName.trim();

  if (!first && !last) return "nameRequired";
  if ([...first].length > MAX_NAME_LENGTH || [...last].length > MAX_NAME_LENGTH) {
    return "nameTooLong";
  }

  return null;
}

// ----------------------------------------------------------------------------
// Brouillon (formulaire)
// ----------------------------------------------------------------------------

export type CharacterDraft = CharacterInput;

export function emptyDraft(): CharacterDraft {
  return { firstName: "", lastName: "", role: "main", status: "alive", fields: {} };
}

export function draftFromCharacter(character: Character): CharacterDraft {
  return {
    firstName: character.firstName,
    lastName: character.lastName.toLocaleUpperCase(),
    role: character.role,
    status: character.status,
    fields: { ...character.fields },
  };
}

/** Champs connus et non vides (comme Rust les enregistre). */
function cleanFields(fields: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => FIELD_KEYS.has(key))
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([, value]) => value !== "" && value !== "[]"),
  );
}

/** Vrai si les deux fiches enregistreraient la même chose. */
export function sameDraft(a: CharacterDraft, b: CharacterDraft): boolean {
  if (
    a.firstName.trim() !== b.firstName.trim() ||
    a.lastName.trim() !== b.lastName.trim() ||
    a.role !== b.role ||
    a.status !== b.status
  ) {
    return false;
  }

  const fa = cleanFields(a.fields);
  const fb = cleanFields(b.fields);
  const keys = new Set([...Object.keys(fa), ...Object.keys(fb)]);

  return [...keys].every((key) => fa[key] === fb[key]);
}

/** Vrai si rien n'a été saisi (formulaire de création encore vierge). */
export function isBlankDraft(draft: CharacterDraft): boolean {
  return fullName(draft) === "" && Object.keys(cleanFields(draft.fields)).length === 0;
}

/** Fiche prête à être envoyée à Rust. */
export function toInput(draft: CharacterDraft): CharacterInput {
  return {
    ...draft,
    firstName: draft.firstName.trim(),
    lastName: draft.lastName.trim().toLocaleUpperCase(),
    fields: cleanFields(draft.fields),
  };
}

// ----------------------------------------------------------------------------
// Progression
// ----------------------------------------------------------------------------

export interface LevelProgress {
  filled: number;
  total: number;
}

/**
 * Champs remplis d'un niveau, sur 15. Le rôle et le statut ont toujours
 * une valeur ; le nom, l'image et la galerie comptent s'ils sont présents.
 */
export function levelProgress(
  draft: CharacterDraft,
  level: CharacterDetailLevel,
  images: { portrait: boolean; gallery: number },
): LevelProgress {
  const fields = cleanFields(draft.fields);
  let filled = fieldsOfLevel(level).filter((field) => field.key in fields).length;

  if (level === "basic") {
    filled += (fullName(draft) ? 1 : 0) + 2 + (images.portrait ? 1 : 0);
  }

  if (level === "intermediate" && images.gallery > 0) {
    filled += 1;
  }

  return { filled, total: FIELDS_PER_LEVEL };
}

// ----------------------------------------------------------------------------
// Avatar sans photo : initiales sur une couleur
// ----------------------------------------------------------------------------

const LETTER = /[\p{L}\p{N}]/u;

/** Première lettre (ou chiffre) d'un mot, s'il en a une. */
function firstLetter(word: string): string | undefined {
  return [...word].find((char) => LETTER.test(char));
}

/**
 * Initiales d'un nom : premier et dernier mot (« Jean Valjean » → « JV »,
 * « Marie-Anne de Bovet » → « MB »), une seule lettre pour un nom d'un mot
 * (« Gandalf » → « G »). « ? » si le nom n'a aucune lettre.
 */
export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .map(firstLetter)
    .filter((letter): letter is string => letter !== undefined);

  if (letters.length === 0) return "?";

  const picked = letters.length === 1 ? [letters[0]] : [letters[0], letters[letters.length - 1]];

  return picked.join("").toLocaleUpperCase();
}

/** Teintes des avatars sans photo. */
const AVATAR_HUES = [15, 45, 85, 140, 175, 205, 240, 275, 310, 345];

/**
 * Couleur de fond d'un avatar sans photo. Elle dépend de l'identifiant du
 * personnage, pas de son nom : renommer un personnage ne change pas sa couleur.
 */
export function avatarColor(id: string): string {
  let hash = 0;

  for (const char of id) {
    hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  }

  return `oklch(0.55 0.12 ${AVATAR_HUES[hash % AVATAR_HUES.length]})`;
}

// ----------------------------------------------------------------------------
// Onglets
// ----------------------------------------------------------------------------

/** Préfixe de l'onglet d'une fiche : `character:<id>`. */
export const CHARACTER_TAB_PREFIX = "character:";

export function characterTabId(characterId: string): string {
  return `${CHARACTER_TAB_PREFIX}${characterId}`;
}

/** Identifiant du personnage d'un onglet de fiche (sinon `null`). */
export function characterIdOfTab(tabId: string): string | null {
  return tabId.startsWith(CHARACTER_TAB_PREFIX) ? tabId.slice(CHARACTER_TAB_PREFIX.length) : null;
}

/** Onglet des paramètres du projet consacré aux personnages. */
export const CHARACTER_SETTINGS_TAB = "settings:characters";