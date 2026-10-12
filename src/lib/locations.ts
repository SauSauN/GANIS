import catalog from "@/lib/locationCatalog.json";
import type { CustomLocationType, Location, LocationInput, LocationSettings } from "@/types";

/*
 * Lieux : six catégories, des types (par défaut ou ajoutés par l'auteur),
 * et une fiche en trois couches de champs :
 *
 *   champs communs  →  champs de la catégorie  →  champs du type
 *
 * Le catalogue (`locationCatalog.json`) est lu tel quel par Rust
 * (`location_service::catalog`) : les deux ne peuvent pas diverger.
 * Tous les champs sont enregistrés dans `fields` ; changer de type
 * n'efface rien (les champs qui ne s'appliquent plus sont masqués).
 */

// ----------------------------------------------------------------------------
// Catégories et types
// ----------------------------------------------------------------------------

export type LocationCategory =
  | "settlement"
  | "political"
  | "region"
  | "built"
  | "natural"
  | "special";

export const LOCATION_CATEGORIES = catalog.categories as LocationCategory[];

export interface LocationTypeDef {
  id: string;
  category: LocationCategory;
  /** Type ajouté par l'auteur : son nom (affiché tel quel). */
  customName?: string;
}

/** Types par défaut, dans l'ordre du catalogue. */
export const BUILTIN_TYPES: LocationTypeDef[] = catalog.types.map((item) => ({
  id: item.id,
  category: item.category as LocationCategory,
}));

const BUILTIN_BY_ID = new Map(BUILTIN_TYPES.map((item) => [item.id, item]));

/** Vrai si le type fait partie du catalogue (libellé traduit). */
export function isBuiltinType(type: string): boolean {
  return BUILTIN_BY_ID.has(type);
}

/** Types proposés pour ce projet : par défaut, puis ajoutés par l'auteur. */
export function allTypes(customTypes: CustomLocationType[]): LocationTypeDef[] {
  return [
    ...BUILTIN_TYPES,
    ...customTypes.map((item) => ({
      id: item.id,
      category: item.category as LocationCategory,
      customName: item.name,
    })),
  ];
}

/** Types d'une catégorie (par défaut puis ajoutés par l'auteur). */
export function typesOfCategory(
  category: LocationCategory,
  customTypes: CustomLocationType[],
): LocationTypeDef[] {
  return allTypes(customTypes).filter((item) => item.category === category);
}

/** Description d'un type (`undefined` : type inconnu, ex. supprimé). */
export function findType(
  type: string,
  customTypes: CustomLocationType[],
): LocationTypeDef | undefined {
  const builtin = BUILTIN_BY_ID.get(type);
  if (builtin) return builtin;

  const custom = customTypes.find((item) => item.id === type);
  return custom
    ? { id: custom.id, category: custom.category as LocationCategory, customName: custom.name }
    : undefined;
}

// ----------------------------------------------------------------------------
// Statuts
// ----------------------------------------------------------------------------

/** Statuts par défaut : codes traduits (`statuses.<code>`). */
export const DEFAULT_STATUSES: string[] = catalog.statuses;

export const DEFAULT_STATUS = "existing";

export function statusValues(lists: LocationSettings["lists"]): string[] {
  return lists.status ?? DEFAULT_STATUSES;
}

export function isDefaultStatus(value: string): boolean {
  return DEFAULT_STATUSES.includes(value);
}

// ----------------------------------------------------------------------------
// Champs
// ----------------------------------------------------------------------------

export type LocationFieldKind =
  | "text"
  | "longText"
  | "tags"
  | "choice"
  | "reference"
  | "location"
  | "character";

export interface LocationField {
  key: string;
  kind: LocationFieldKind;
  maxLength: number;
  /** Catégories qui le proposent (vide, avec `types` vide : champ commun). */
  categories: LocationCategory[];
  types: string[];
  /** Valeurs d'un champ « choice » (codes traduits). */
  options: string[];
}

/** Forme d'un champ dans le JSON (les listes absentes valent « vide »). */
interface CatalogField {
  key: string;
  kind: string;
  maxLength: number;
  categories?: string[];
  types?: string[];
  options?: string[];
}

export const LOCATION_FIELDS: LocationField[] = (catalog.fields as CatalogField[]).map((field) => ({
  key: field.key,
  kind: field.kind as LocationFieldKind,
  maxLength: field.maxLength,
  categories: (field.categories ?? []) as LocationCategory[],
  types: field.types ?? [],
  options: field.options ?? [],
}));

const FIELD_KEYS = new Set(LOCATION_FIELDS.map((field) => field.key));

/** Champs communs à tous les lieux, rangés en deux groupes de la fiche. */
export const IDENTITY_FIELDS = ["aliases", "firstAppearance", "description"];
export const STORY_FIELDS = ["history", "notes"];

const isCommon = (field: LocationField) =>
  field.categories.length === 0 && field.types.length === 0;

export function fieldByKey(key: string): LocationField | undefined {
  return LOCATION_FIELDS.find((field) => field.key === key);
}

/** Champs propres à une catégorie. */
export function categoryFields(category: LocationCategory | undefined): LocationField[] {
  return category ? LOCATION_FIELDS.filter((field) => field.categories.includes(category)) : [];
}

/**
 * Champs propres à un type. Un champ déjà proposé par la catégorie n'est
 * pas répété (ex. « Climat » pour une forêt).
 */
export function typeFields(type: string, category: LocationCategory | undefined): LocationField[] {
  return LOCATION_FIELDS.filter(
    (field) =>
      field.types.includes(type) && !(category && field.categories.includes(category)),
  );
}

/** Clés affichées par la fiche d'un lieu de ce type. */
export function visibleFieldKeys(type: string, category: LocationCategory | undefined): Set<string> {
  return new Set([
    ...LOCATION_FIELDS.filter(isCommon).map((field) => field.key),
    ...categoryFields(category).map((field) => field.key),
    ...typeFields(type, category).map((field) => field.key),
  ]);
}

/**
 * Champs remplis que la fiche n'affiche plus (gardés d'un ancien type) :
 * ils ne sont pas effacés, et réapparaissent si l'on revient au type.
 */
export function hiddenFilledKeys(
  fields: Record<string, string>,
  type: string,
  category: LocationCategory | undefined,
): string[] {
  const visible = visibleFieldKeys(type, category);
  return Object.keys(fields).filter((key) => FIELD_KEYS.has(key) && !visible.has(key) && fields[key]);
}

// ----------------------------------------------------------------------------
// Hiérarchie
// ----------------------------------------------------------------------------

export interface LocationNode {
  location: Location;
  depth: number;
  children: LocationNode[];
}

const byName = (a: Location, b: Location) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) ||
  a.createdAt.localeCompare(b.createdAt);

/**
 * Arbre des lieux, par nom à chaque niveau. Un lieu dont le parent est
 * introuvable (ou qui ferait une boucle) est placé à la racine.
 */
export function buildLocationTree(locations: Location[]): LocationNode[] {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const children = new Map<string | null, Location[]>();

  for (const location of locations) {
    const parent = location.parentId && byId.has(location.parentId) ? location.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), location]);
  }

  const placed = new Set<string>();

  function build(parent: string | null, depth: number): LocationNode[] {
    return (children.get(parent) ?? [])
      .filter((location) => !placed.has(location.id))
      .sort(byName)
      .map((location) => {
        placed.add(location.id);
        return { location, depth, children: build(location.id, depth + 1) };
      });
  }

  const roots = build(null, 0);

  // Boucle dans les données (ne devrait pas arriver) : rattachée à la racine.
  for (const location of [...locations].sort(byName)) {
    if (!placed.has(location.id)) {
      placed.add(location.id);
      roots.push({ location, depth: 0, children: build(location.id, 1) });
    }
  }

  return roots;
}

/** Nœuds dans l'ordre d'affichage ; les branches repliées sont sautées. */
export function flattenTree(nodes: LocationNode[], collapsed: Set<string> = new Set()): LocationNode[] {
  return nodes.flatMap((node) => [
    node,
    ...(collapsed.has(node.location.id) ? [] : flattenTree(node.children, collapsed)),
  ]);
}

/** Parents d'un lieu, du plus haut au plus proche. */
export function ancestorsOf(locations: Location[], id: string): Location[] {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const path: Location[] = [];
  const seen = new Set<string>([id]);
  let current = byId.get(id)?.parentId ?? null;

  while (current && !seen.has(current)) {
    const parent = byId.get(current);
    if (!parent) break;

    seen.add(current);
    path.unshift(parent);
    current = parent.parentId;
  }

  return path;
}

/** Identifiants d'un lieu et de tout ce qu'il contient. */
export function selfAndDescendants(locations: Location[], id: string): Set<string> {
  const result = new Set<string>([id]);
  let grew = true;

  while (grew) {
    grew = false;

    for (const location of locations) {
      if (location.parentId && result.has(location.parentId) && !result.has(location.id)) {
        result.add(location.id);
        grew = true;
      }
    }
  }

  return result;
}

/** Lieux contenus directement. */
export function childrenOf(locations: Location[], id: string): Location[] {
  return locations.filter((location) => location.parentId === id).sort(byName);
}

// ----------------------------------------------------------------------------
// Brouillon (formulaire)
// ----------------------------------------------------------------------------

export type LocationDraft = LocationInput;

export const MAX_LOCATION_NAME_LENGTH = 200;

export function emptyLocationDraft(type = "", parentId: string | null = null): LocationDraft {
  return { name: "", type, parentId, status: DEFAULT_STATUS, fields: {} };
}

export function draftFromLocation(location: Location): LocationDraft {
  return {
    name: location.name,
    type: location.type,
    parentId: location.parentId,
    status: location.status,
    fields: { ...location.fields },
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
export function sameLocationDraft(a: LocationDraft, b: LocationDraft): boolean {
  if (
    a.name.trim() !== b.name.trim() ||
    a.type !== b.type ||
    (a.parentId ?? null) !== (b.parentId ?? null) ||
    a.status !== b.status
  ) {
    return false;
  }

  const fa = cleanFields(a.fields);
  const fb = cleanFields(b.fields);
  const keys = new Set([...Object.keys(fa), ...Object.keys(fb)]);

  return [...keys].every((key) => fa[key] === fb[key]);
}

/** Vrai si rien n'a été saisi (le type et le parent ne comptent pas). */
export function isBlankLocationDraft(draft: LocationDraft): boolean {
  return draft.name.trim() === "" && Object.keys(cleanFields(draft.fields)).length === 0;
}

export function locationNameError(name: string): "nameRequired" | "nameTooLong" | null {
  const trimmed = name.trim();
  if (!trimmed) return "nameRequired";
  if ([...trimmed].length > MAX_LOCATION_NAME_LENGTH) return "nameTooLong";
  return null;
}

/** Fiche prête à être envoyée à Rust. */
export function toLocationInput(draft: LocationDraft): LocationInput {
  return {
    name: draft.name.trim(),
    type: draft.type,
    parentId: draft.parentId || null,
    status: draft.status || DEFAULT_STATUS,
    fields: cleanFields(draft.fields),
  };
}

// ----------------------------------------------------------------------------
// Onglets
// ----------------------------------------------------------------------------

/** Préfixe de l'onglet d'une fiche : `location:<id>`. */
export const LOCATION_TAB_PREFIX = "location:";

export function locationTabId(locationId: string): string {
  return `${LOCATION_TAB_PREFIX}${locationId}`;
}

/** Identifiant du lieu d'un onglet de fiche (sinon `null`). */
export function locationIdOfTab(tabId: string): string | null {
  return tabId.startsWith(LOCATION_TAB_PREFIX) ? tabId.slice(LOCATION_TAB_PREFIX.length) : null;
}

/** Onglet des paramètres du projet consacré aux lieux. */
export const LOCATION_SETTINGS_TAB = "settings:locations";
