import itemCatalog from "@/lib/itemCatalog.json";
import speciesCatalog from "@/lib/speciesCatalog.json";
import linkCatalog from "@/lib/worldLinkCatalog.json";
import type {
  CharacterDetailLevel,
  CustomLocationType,
  SpeciesNature,
  WorldEntry,
  WorldEntryInput,
  WorldLink,
  WorldLinkKind,
  WorldModule,
  WorldSettings,
} from "@/types";

/*
 * Objets, faune et flore : deux modules facultatifs construits sur le même
 * modèle que les lieux (voir `lib/locations.ts`).
 *
 *   champs communs  →  champs de la catégorie  →  champs du type
 *
 * Les catalogues (`itemCatalog.json`, `speciesCatalog.json`) sont lus tels
 * quels par Rust (`world_service::Module::catalog`) : les deux ne peuvent
 * pas diverger. La faune et la flore ont en plus une **nature** : une
 * espèce entière, ou un animal / une plante précis (qui peut aussi être un
 * personnage).
 *
 * Les deux modules sont désactivés par défaut : l'auteur les active dans
 * Paramètres du projet et choisit ses catégories.
 */

// ----------------------------------------------------------------------------
// Catalogues
// ----------------------------------------------------------------------------

export type WorldFieldKind = "text" | "longText" | "tags" | "choice" | "reference" | "colors";

export interface WorldField {
  key: string;
  kind: WorldFieldKind;
  maxLength: number;
  /** Catégories qui le proposent (vide, avec `types` vide : champ commun). */
  categories: string[];
  types: string[];
  /** Natures concernées (vide : toutes). */
  natures: string[];
  options: string[];
}

export interface WorldTypeDef {
  id: string;
  category: string;
  /** Type ajouté par l'auteur : son nom (affiché tel quel). */
  customName?: string;
}

export interface WorldCatalog {
  categories: string[];
  statuses: string[];
  defaultStatus: string;
  natures: Array<{ id: SpeciesNature; defaultStatus: string }>;
  types: WorldTypeDef[];
  fields: WorldField[];
}

interface RawCatalog {
  categories: string[];
  statuses: string[];
  defaultStatus: string;
  natures: Array<{ id: string; defaultStatus: string }>;
  types: Array<{ id: string; category: string }>;
  fields: Array<{
    key: string;
    kind: string;
    maxLength: number;
    categories?: string[];
    types?: string[];
    natures?: string[];
    options?: string[];
  }>;
}

function readCatalog(raw: RawCatalog): WorldCatalog {
  return {
    categories: raw.categories,
    statuses: raw.statuses,
    defaultStatus: raw.defaultStatus,
    natures: raw.natures.map((nature) => ({ id: nature.id as SpeciesNature, defaultStatus: nature.defaultStatus })),
    types: raw.types.map((item) => ({ id: item.id, category: item.category })),
    fields: raw.fields.map((field) => ({
      key: field.key,
      kind: field.kind as WorldFieldKind,
      maxLength: field.maxLength,
      categories: field.categories ?? [],
      types: field.types ?? [],
      natures: field.natures ?? [],
      options: field.options ?? [],
    })),
  };
}

export const WORLD_MODULES: WorldModule[] = ["item", "species"];

export const CATALOGS: Record<WorldModule, WorldCatalog> = {
  item: readCatalog(itemCatalog as RawCatalog),
  species: readCatalog(speciesCatalog as RawCatalog),
};

export function catalogOf(module: WorldModule): WorldCatalog {
  return CATALOGS[module];
}

export function hasNature(module: WorldModule): boolean {
  return CATALOGS[module].natures.length > 0;
}

// ----------------------------------------------------------------------------
// Types et catégories
// ----------------------------------------------------------------------------

export function isBuiltinType(module: WorldModule, type: string): boolean {
  return CATALOGS[module].types.some((item) => item.id === type);
}

/** Types proposés : par défaut, puis ajoutés par l'auteur. */
export function allTypes(module: WorldModule, customTypes: CustomLocationType[]): WorldTypeDef[] {
  return [
    ...CATALOGS[module].types,
    ...customTypes.map((item) => ({ id: item.id, category: item.category, customName: item.name })),
  ];
}

export function typesOfCategory(
  module: WorldModule,
  category: string,
  customTypes: CustomLocationType[],
): WorldTypeDef[] {
  return allTypes(module, customTypes).filter((item) => item.category === category);
}

/** Description d'un type (`undefined` : type inconnu, ex. supprimé). */
export function findType(
  module: WorldModule,
  type: string,
  customTypes: CustomLocationType[],
): WorldTypeDef | undefined {
  return allTypes(module, customTypes).find((item) => item.id === type);
}

/**
 * Catégories proposées à la création : celles choisies par l'auteur. Si le
 * réglage est vide (ancien projet, module tout juste activé), toutes.
 */
export function enabledCategories(module: WorldModule, settings: WorldSettings): string[] {
  const chosen = CATALOGS[module].categories.filter((category) => settings.categories.includes(category));
  return chosen.length > 0 ? chosen : CATALOGS[module].categories;
}

// ----------------------------------------------------------------------------
// Statuts et natures
// ----------------------------------------------------------------------------

export function statusValues(module: WorldModule, lists: WorldSettings["lists"]): string[] {
  return lists.status ?? CATALOGS[module].statuses;
}

export function isDefaultStatus(module: WorldModule, value: string): boolean {
  return CATALOGS[module].statuses.includes(value);
}

/** Statut d'une nouvelle fiche (selon la nature pour la faune et la flore). */
export function defaultStatus(module: WorldModule, nature: SpeciesNature | null): string {
  const catalog = CATALOGS[module];
  return catalog.natures.find((item) => item.id === nature)?.defaultStatus ?? catalog.defaultStatus;
}

// ----------------------------------------------------------------------------
// Champs
// ----------------------------------------------------------------------------

/** Champs communs, rangés en deux groupes de la fiche (identité, histoire). */
const COMMON_GROUPS: Record<WorldModule, { identity: string[]; story: string[] }> = {
  item: {
    identity: ["colorPalette", "aliases", "firstAppearance", "description", "creator", "value", "rarity"],
    story: ["origin", "history", "notes"],
  },
  species: {
    identity: ["colorPalette", "aliases", "scientificName", "age", "markings", "firstAppearance", "description"],
    story: ["habitat", "legends", "notes"],
  },
};

export function fieldsOf(module: WorldModule): WorldField[] {
  return CATALOGS[module].fields;
}

export function fieldByKey(module: WorldModule, key: string): WorldField | undefined {
  return CATALOGS[module].fields.find((field) => field.key === key);
}

/** Vrai si le champ concerne cette nature (objets : toujours). */
export function fieldFitsNature(field: WorldField, nature: SpeciesNature | null): boolean {
  return field.natures.length === 0 || nature === null || field.natures.includes(nature);
}

const isCommon = (field: WorldField) => field.categories.length === 0 && field.types.length === 0;

export function categoryFields(
  module: WorldModule,
  category: string | undefined,
  nature: SpeciesNature | null = null,
): WorldField[] {
  return category
    ? fieldsOf(module).filter((field) => field.categories.includes(category) && fieldFitsNature(field, nature))
    : [];
}

/** Champs propres au type (sans répéter ceux de sa catégorie). */
export function typeFields(
  module: WorldModule,
  type: string,
  category: string | undefined,
  nature: SpeciesNature | null = null,
): WorldField[] {
  return fieldsOf(module).filter(
    (field) =>
      field.types.includes(type) &&
      !(category && field.categories.includes(category)) &&
      fieldFitsNature(field, nature),
  );
}

/** Clés que la fiche peut montrer pour ce type et cette nature. */
export function visibleFieldKeys(
  module: WorldModule,
  type: string,
  category: string | undefined,
  nature: SpeciesNature | null = null,
): Set<string> {
  return new Set([
    ...fieldsOf(module)
      .filter((field) => isCommon(field) && fieldFitsNature(field, nature))
      .map((field) => field.key),
    ...categoryFields(module, category, nature).map((field) => field.key),
    ...typeFields(module, type, category, nature).map((field) => field.key),
  ]);
}

/**
 * Ce que montre chaque niveau de détail :
 * - Basique : nom, type, statut, emplacement, description, notes, images ;
 * - Moyen : + champs d'identité et champs de la catégorie ;
 * - Avancé : + champs propres au type et histoire.
 */
export function levelParts(module: WorldModule, level: CharacterDetailLevel | null) {
  const rank = level === "basic" ? 0 : level === "intermediate" ? 1 : 2;
  const groups = COMMON_GROUPS[module];
  return {
    // La palette (cadre de l'image) est proposée à tous les niveaux.
    identity: rank === 0 ? ["colorPalette", "description"] : groups.identity,
    story: rank < 2 ? ["notes"] : groups.story,
    category: rank >= 1,
    type: rank >= 2,
  };
}

export function levelFieldKeys(
  module: WorldModule,
  type: string,
  category: string | undefined,
  nature: SpeciesNature | null,
  level: CharacterDetailLevel | null,
): Set<string> {
  const parts = levelParts(module, level);
  return new Set([
    ...parts.identity,
    ...parts.story,
    ...(parts.category ? categoryFields(module, category, nature).map((field) => field.key) : []),
    ...(parts.type ? typeFields(module, type, category, nature).map((field) => field.key) : []),
  ]);
}

/** Champs remplis que la fiche n'affiche plus (autre type, autre nature) : gardés. */
export function hiddenFilledKeys(
  module: WorldModule,
  fields: Record<string, string>,
  type: string,
  category: string | undefined,
  nature: SpeciesNature | null,
): string[] {
  const known = new Set(fieldsOf(module).map((field) => field.key));
  const visible = visibleFieldKeys(module, type, category, nature);
  return Object.keys(fields).filter((key) => known.has(key) && !visible.has(key) && fields[key]);
}

/** Champs remplis que le niveau de détail ne montre pas (gardés). */
export function levelHiddenFilledKeys(
  module: WorldModule,
  fields: Record<string, string>,
  type: string,
  category: string | undefined,
  nature: SpeciesNature | null,
  level: CharacterDetailLevel | null,
): string[] {
  const visible = visibleFieldKeys(module, type, category, nature);
  const shown = levelFieldKeys(module, type, category, nature, level);
  return Object.keys(fields).filter((key) => visible.has(key) && !shown.has(key) && fields[key]);
}

// ----------------------------------------------------------------------------
// Hiérarchie (objet rangé dans un autre ; animal précis dans son espèce)
// ----------------------------------------------------------------------------

export interface WorldNode {
  entry: WorldEntry;
  depth: number;
  children: WorldNode[];
}

const byName = (a: WorldEntry, b: WorldEntry) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.createdAt.localeCompare(b.createdAt);

/** Arbre par nom à chaque niveau ; un parent introuvable (ou une boucle) : racine. */
export function buildWorldTree(entries: WorldEntry[]): WorldNode[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const children = new Map<string | null, WorldEntry[]>();

  for (const entry of entries) {
    const parent = entry.parentId && byId.has(entry.parentId) ? entry.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), entry]);
  }

  const placed = new Set<string>();

  function build(parent: string | null, depth: number): WorldNode[] {
    return (children.get(parent) ?? [])
      .filter((entry) => !placed.has(entry.id))
      .sort(byName)
      .map((entry) => {
        placed.add(entry.id);
        return { entry, depth, children: build(entry.id, depth + 1) };
      });
  }

  const roots = build(null, 0);

  for (const entry of [...entries].sort(byName)) {
    if (!placed.has(entry.id)) {
      placed.add(entry.id);
      roots.push({ entry, depth: 0, children: build(entry.id, 1) });
    }
  }

  return roots;
}

export function flattenWorldTree(nodes: WorldNode[], collapsed: Set<string> = new Set()): WorldNode[] {
  return nodes.flatMap((node) => [
    node,
    ...(collapsed.has(node.entry.id) ? [] : flattenWorldTree(node.children, collapsed)),
  ]);
}

/** Groupe du panneau : une catégorie et les arbres qui en relèvent. */
export interface WorldCategoryGroup {
  /** Catégorie du catalogue ; `null` : type inconnu (supprimé). */
  category: string | null;
  nodes: WorldNode[];
  /** Fiches du groupe, sous-éléments compris. */
  count: number;
}

/**
 * Range les arbres par catégorie, dans l'ordre du catalogue (les types
 * inconnus à la fin). Un élément rangé dans un autre reste sous son parent,
 * quelle que soit sa propre catégorie. Les catégories vides sont omises.
 */
export function groupWorldTreeByCategory(
  module: WorldModule,
  nodes: WorldNode[],
  customTypes: CustomLocationType[],
): WorldCategoryGroup[] {
  const size = (node: WorldNode): number => 1 + node.children.reduce((sum, child) => sum + size(child), 0);
  const order: Array<string | null> = [...CATALOGS[module].categories, null];
  const groups = new Map<string | null, WorldNode[]>();

  for (const node of nodes) {
    const found = findType(module, node.entry.type, customTypes)?.category ?? null;
    const category = found && order.includes(found) ? found : null;
    groups.set(category, [...(groups.get(category) ?? []), node]);
  }

  return order
    .filter((category) => groups.has(category))
    .map((category) => {
      const list = groups.get(category) ?? [];
      return { category, nodes: list, count: list.reduce((sum, node) => sum + size(node), 0) };
    });
}

/** Parents d'un élément, du plus haut au plus proche. */
export function ancestorsOf(entries: WorldEntry[], id: string): WorldEntry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const path: WorldEntry[] = [];
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

export function selfAndDescendants(entries: WorldEntry[], id: string): Set<string> {
  const result = new Set<string>([id]);
  let grew = true;

  while (grew) {
    grew = false;
    for (const entry of entries) {
      if (entry.parentId && result.has(entry.parentId) && !result.has(entry.id)) {
        result.add(entry.id);
        grew = true;
      }
    }
  }

  return result;
}

export function childrenOf(entries: WorldEntry[], id: string): WorldEntry[] {
  return entries.filter((entry) => entry.parentId === id).sort(byName);
}

/**
 * Parents possibles : pas l'élément lui-même ni ce qu'il contient ; pour la
 * faune et la flore, seulement des espèces (un animal précis ne regroupe rien).
 */
export function parentCandidates(module: WorldModule, entries: WorldEntry[], selfId: string | null): WorldEntry[] {
  const excluded = selfId ? selfAndDescendants(entries, selfId) : new Set<string>();
  return entries.filter(
    (entry) => !excluded.has(entry.id) && (!hasNature(module) || entry.nature === "species"),
  );
}

// ----------------------------------------------------------------------------
// Brouillon (formulaire)
// ----------------------------------------------------------------------------

export type WorldDraft = WorldEntryInput;

export const MAX_WORLD_NAME_LENGTH = 200;

export function emptyWorldDraft(
  module: WorldModule,
  type = "",
  parentId: string | null = null,
  nature: SpeciesNature | null = null,
): WorldDraft {
  const resolved = hasNature(module) ? (nature ?? "species") : null;
  return { name: "", type, nature: resolved, parentId, status: defaultStatus(module, resolved), fields: {} };
}

export function draftFromEntry(entry: WorldEntry): WorldDraft {
  return {
    name: entry.name,
    type: entry.type,
    nature: entry.nature,
    parentId: entry.parentId,
    status: entry.status,
    fields: { ...entry.fields },
  };
}

function cleanFields(module: WorldModule, fields: Record<string, string>): Record<string, string> {
  const known = new Set(fieldsOf(module).map((field) => field.key));
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key]) => known.has(key))
      .map(([key, value]) => [key, value.trim()] as const)
      .filter(([, value]) => value !== "" && value !== "[]"),
  );
}

export function sameWorldDraft(module: WorldModule, a: WorldDraft, b: WorldDraft): boolean {
  if (
    a.name.trim() !== b.name.trim() ||
    a.type !== b.type ||
    (a.nature ?? null) !== (b.nature ?? null) ||
    (a.parentId ?? null) !== (b.parentId ?? null) ||
    a.status !== b.status
  ) {
    return false;
  }

  const fa = cleanFields(module, a.fields);
  const fb = cleanFields(module, b.fields);
  const keys = new Set([...Object.keys(fa), ...Object.keys(fb)]);
  return [...keys].every((key) => fa[key] === fb[key]);
}

export function isBlankWorldDraft(module: WorldModule, draft: WorldDraft): boolean {
  return draft.name.trim() === "" && Object.keys(cleanFields(module, draft.fields)).length === 0;
}

export function worldNameError(name: string): "nameRequired" | "nameTooLong" | null {
  const trimmed = name.trim();
  if (!trimmed) return "nameRequired";
  if ([...trimmed].length > MAX_WORLD_NAME_LENGTH) return "nameTooLong";
  return null;
}

/** Fiche prête à être envoyée à Rust. */
export function toWorldInput(module: WorldModule, draft: WorldDraft): WorldEntryInput {
  const nature = hasNature(module) ? (draft.nature ?? "species") : null;
  return {
    name: draft.name.trim(),
    type: draft.type,
    nature,
    parentId: draft.parentId || null,
    status: draft.status || defaultStatus(module, nature),
    fields: cleanFields(module, draft.fields),
  };
}

// ----------------------------------------------------------------------------
// Onglets, modules de l'espace de travail, paramètres
// ----------------------------------------------------------------------------

const TAB_PREFIX: Record<WorldModule, string> = { item: "item:", species: "species:" };

/** Onglet d'une fiche : `item:<id>` ou `species:<id>`. */
export function worldTabId(module: WorldModule, id: string): string {
  return `${TAB_PREFIX[module]}${id}`;
}

/** Fiche d'un onglet (sinon `null`). */
export function worldEntryOfTab(tabId: string): { module: WorldModule; id: string } | null {
  for (const module of WORLD_MODULES) {
    const prefix = TAB_PREFIX[module];
    if (tabId.startsWith(prefix) && tabId.length > prefix.length) {
      return { module, id: tabId.slice(prefix.length) };
    }
  }
  return null;
}

/** Module de la barre de gauche (et section des paramètres) d'un module. */
export const WORKSPACE_MODULE: Record<WorldModule, "items" | "species"> = { item: "items", species: "species" };

export function createFeatureOf(module: WorldModule): string {
  return `${WORKSPACE_MODULE[module]}.create`;
}

export function listFeatureOf(module: WorldModule): string {
  return `${WORKSPACE_MODULE[module]}.list`;
}

/** Onglet des paramètres du projet consacré au module. */
export function worldSettingsTab(module: WorldModule): string {
  return `settings:${WORKSPACE_MODULE[module]}`;
}

// ----------------------------------------------------------------------------
// Liens entre éléments
// ----------------------------------------------------------------------------

export interface WorldLinkTypeDef {
  id: string;
  from: WorldLinkKind[];
  to: WorldLinkKind[];
}

export const WORLD_LINK_TYPES: WorldLinkTypeDef[] = linkCatalog.types.map((item) => ({
  id: item.id,
  from: item.from as WorldLinkKind[],
  to: item.to as WorldLinkKind[],
}));

export const WORLD_LINK_KINDS = linkCatalog.kinds as WorldLinkKind[];

/** Sortes qui ont des liens du monde (les autres paires ont déjà les leurs). */
export function isWorldKind(kind: WorldLinkKind): boolean {
  return kind === "item" || kind === "species";
}

/** Une paire `a`/`b` peut-elle avoir un lien du monde ? */
export function canLink(a: WorldLinkKind, b: WorldLinkKind): boolean {
  return isWorldKind(a) || isWorldKind(b);
}

/**
 * Natures de lien possibles entre l'élément de la fiche (`self`) et un
 * élément d'une autre sorte (`other`), avec le sens : `forward` si la fiche
 * est la source (« possède »), sinon elle est la cible (« appartient à »).
 * Un type qui marche dans les deux sens n'est proposé qu'une fois (vers
 * l'avant).
 */
export function linkChoices(
  self: WorldLinkKind,
  other: WorldLinkKind,
): Array<{ type: string; forward: boolean }> {
  if (!canLink(self, other)) return [];

  const choices: Array<{ type: string; forward: boolean }> = [];

  for (const def of WORLD_LINK_TYPES) {
    const forward = def.from.includes(self) && def.to.includes(other);
    const backward = def.from.includes(other) && def.to.includes(self);
    if (forward) choices.push({ type: def.id, forward: true });
    else if (backward) choices.push({ type: def.id, forward: false });
  }

  return choices;
}

/** Liens d'un élément, vus de sa fiche : l'autre côté et le sens. */
export interface LinkView {
  link: WorldLink;
  otherKind: WorldLinkKind;
  otherId: string;
  /** Vrai : la fiche est la source du lien. */
  forward: boolean;
}

export function linksOfEntry(links: WorldLink[], id: string): LinkView[] {
  const order = (type: string) => {
    const index = WORLD_LINK_TYPES.findIndex((item) => item.id === type);
    return index === -1 ? WORLD_LINK_TYPES.length : index;
  };

  return links
    .filter((link) => link.sourceId === id || link.targetId === id)
    .sort((a, b) => order(a.type) - order(b.type) || a.createdAt.localeCompare(b.createdAt))
    .map((link) =>
      link.sourceId === id
        ? { link, otherKind: link.targetKind, otherId: link.targetId, forward: true }
        : { link, otherKind: link.sourceKind, otherId: link.sourceId, forward: false },
    );
}

/** Lien à créer depuis une fiche, orienté selon le choix. */
export function orientLink(
  self: { kind: WorldLinkKind; id: string },
  other: { kind: WorldLinkKind; id: string },
  forward: boolean,
): Pick<WorldLink, "sourceKind" | "sourceId" | "targetKind" | "targetId"> {
  const [source, target] = forward ? [self, other] : [other, self];
  return { sourceKind: source.kind, sourceId: source.id, targetKind: target.kind, targetId: target.id };
}