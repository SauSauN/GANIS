import type {
  NodeCharacterLink,
  NodeLocationLink,
  ProjectType,
  Structure,
  StructureLevel,
  StructureLevelInput,
  StructureNode,
  StructureNumbering,
  StructureTemplateId,
} from "@/types";

/**
 * Découpage du récit : niveaux, numérotation et arbre des éléments.
 *
 * Mêmes règles que Rust (`src-tauri/src/services/structure_service.rs`) :
 * - de 1 à 5 niveaux (0 = le plus large) ; ceux du modèle (trois niveaux,
 *   noms traduits dans `structure.json`) ou ceux choisis par l'utilisateur ;
 * - numérotation automatique (réglage du projet) : le numéro est calculé
 *   ici d'après l'ordre du plan (`numberNodes`) et suit les déplacements,
 *   insertions et suppressions ; sinon (par défaut) chaque élément garde le
 *   numéro enregistré par Rust ;
 * - un élément peut être hors numérotation (`numbered: false`).
 */

/** Nombre de niveaux des modèles. */
export const TEMPLATE_LEVELS = 3;

/** Nombre maximal de niveaux personnalisés. */
export const MAX_LEVELS = 5;

/** Bornes de la numérotation (identiques à Rust). */
export const MAX_START = 9999;
export const MAX_DIGITS = 4;
export const MAX_LEVEL_NAME = 40;
export const MAX_NUMBER = 999_999;

/**
 * Couleur par défaut de chaque niveau, selon sa place (du plus large au
 * plus fin) : lisibles sur fond clair comme sur fond sombre.
 */
export const LEVEL_COLORS = ["#6366f1", "#0891b2", "#16a34a", "#d97706", "#db2777"];

/** Couleurs proposées pour un niveau (paramètres du projet). */
export const COLOR_CHOICES = [
  "#6366f1",
  "#2563eb",
  "#0891b2",
  "#0d9488",
  "#16a34a",
  "#65a30d",
  "#d97706",
  "#ea580c",
  "#dc2626",
  "#db2777",
  "#9333ea",
  "#64748b",
];

/** Couleur par défaut du niveau `index`. */
export function defaultLevelColor(index: number): string {
  return LEVEL_COLORS[Math.max(0, index) % LEVEL_COLORS.length];
}

/** « #rrggbb » valide. */
export function isLevelColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/** Modes de numérotation, dans l'ordre d'affichage. */
export const NUMBERINGS: StructureNumbering[] = ["continuous", "perParent", "none"];

/** Modèles proposés, dans l'ordre d'affichage. */
export const STRUCTURE_TEMPLATES: StructureTemplateId[] = [
  "novel",
  "manga",
  "film",
  "series",
  "game",
  "rpg",
  "generic",
];

/** Modèle naturel d'un type de projet (identique à Rust). */
export function templateForProjectType(type: ProjectType): StructureTemplateId {
  return type === "custom" ? "generic" : type;
}

// ----------------------------------------------------------------------------
// Niveaux
// ----------------------------------------------------------------------------

/** Niveau dont les noms et la couleur sont connus (traduits ou personnalisés). */
export interface ResolvedLevel extends Omit<StructureLevel, "one" | "other" | "color"> {
  one: string;
  other: string;
  color: string;
}

/**
 * Nom d'un niveau du modèle, traduit. `index` : 0 à 2 ; au-delà (niveaux
 * ajoutés puis retour au modèle impossible), un nom de secours.
 */
export type TemplateLevelName = (
  template: StructureTemplateId,
  index: number,
  form: "one" | "other",
) => string;

/** Noms de chaque niveau : personnalisés, sinon ceux du modèle. */
export function resolveLevels(structure: Structure, templateName: TemplateLevelName): ResolvedLevel[] {
  return structure.levels.map((level, index) => ({
    ...level,
    one: level.one ?? templateName(structure.template, index, "one"),
    other: level.other ?? level.one ?? templateName(structure.template, index, "other"),
    color: isLevelColor(level.color) ? level.color : defaultLevelColor(index),
  }));
}

/** Niveaux sous la forme attendue par Rust (`setStructureLevels`). */
export function levelsToInput(levels: ResolvedLevel[]): StructureLevelInput[] {
  return levels.map(({ id, one, other, numbering, start, digits, color }) => ({
    id,
    one,
    other,
    numbering,
    start,
    digits,
    color,
  }));
}

/**
 * Couleur d'un élément : celle de son niveau (réglée dans les paramètres
 * du projet, elle s'applique à tous les éléments du niveau).
 */
export function nodeColor(node: Pick<StructureNode, "level">, levels: Pick<ResolvedLevel, "color">[]): string {
  return levelOf(levels, node.level)?.color ?? defaultLevelColor(node.level);
}

/** Niveau d'un élément (le dernier si l'élément est plus profond). */
export function levelOf<T>(levels: T[], level: number): T | undefined {
  return levels[Math.min(Math.max(level, 0), levels.length - 1)];
}

// ----------------------------------------------------------------------------
// Arbre
// ----------------------------------------------------------------------------

export interface StructureTreeNode extends StructureNode {
  children: StructureTreeNode[];
  /** Profondeur d'affichage (0 à la racine), indépendante du niveau. */
  depth: number;
  /** Nombre total d'éléments contenus (enfants, petits-enfants…). */
  descendants: number;
}

/**
 * Reconstruit l'arbre à partir de la liste à plat renvoyée par Rust.
 *
 * Les éléments de même parent sont triés par position. Un élément dont le
 * parent est introuvable est rattaché à la racine, pour ne jamais
 * disparaître de l'affichage.
 */
export function buildStructureTree(nodes: StructureNode[]): StructureTreeNode[] {
  const byId = new Map<string, StructureTreeNode>();

  for (const node of nodes) {
    byId.set(node.id, { ...node, children: [], depth: 0, descendants: 0 });
  }

  const roots: StructureTreeNode[] = [];

  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortAndMeasure = (list: StructureTreeNode[], depth: number): number => {
    list.sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));

    let total = 0;

    for (const node of list) {
      node.depth = depth;
      node.descendants = sortAndMeasure(node.children, depth + 1);
      total += 1 + node.descendants;
    }

    return total;
  };

  sortAndMeasure(roots, 0);

  return roots;
}

/** Éléments visibles, dans l'ordre d'affichage (les replis sont respectés). */
export function flattenVisible(
  roots: StructureTreeNode[],
  collapsed: ReadonlySet<string>,
): StructureTreeNode[] {
  const out: StructureTreeNode[] = [];

  const walk = (list: StructureTreeNode[]) => {
    for (const node of list) {
      out.push(node);

      if (!collapsed.has(node.id)) {
        walk(node.children);
      }
    }
  };

  walk(roots);

  return out;
}

/** Nombre d'éléments de chaque niveau dans tout le projet. */
export function countByLevel(nodes: StructureNode[], levelCount: number): number[] {
  const counts = Array.from({ length: levelCount }, () => 0);

  for (const node of nodes) {
    counts[Math.min(Math.max(node.level, 0), levelCount - 1)] += 1;
  }

  return counts;
}

// ----------------------------------------------------------------------------
// Numérotation
// ----------------------------------------------------------------------------

/** Numérotation d'un niveau, sans ses noms. */
type NumberingRule = Pick<StructureLevel, "numbering" | "start">;

/**
 * Numéro de chaque élément.
 *
 * Numérotation automatique (`auto`) : calculé dans l'ordre de lecture du
 * plan.
 * - `continuous` : un compteur par niveau pour tout le projet (les
 *   chapitres continuent d'une partie à l'autre) ;
 * - `perParent` : un compteur par niveau et par parent (les scènes
 *   repartent dans chaque chapitre) ;
 * - `none`, ou élément hors numérotation : pas de numéro, et aucun numéro
 *   consommé (le chapitre suivant un prologue reste le chapitre 1).
 *
 * Sinon : le numéro enregistré de chaque élément (attribué à sa création,
 * modifiable, remis dans l'ordre par « Renuméroter »), pour les éléments
 * numérotés d'un niveau numéroté.
 */
export function numberNodes(
  nodes: StructureNode[],
  levels: NumberingRule[],
  auto = true,
): Map<string, number> {
  const numbers = new Map<string, number>();

  if (levels.length === 0) {
    return numbers;
  }

  if (!auto) {
    for (const node of nodes) {
      const rule = levelOf(levels, node.level);

      if (rule && rule.numbering !== "none" && node.numbered && node.number !== null) {
        numbers.set(node.id, node.number);
      }
    }

    return numbers;
  }

  const continuous = new Map<number, number>();
  const perParent = new Map<string, number>();

  for (const node of flattenVisible(buildStructureTree(nodes), new Set())) {
    const rule = levelOf(levels, node.level);

    if (!rule || rule.numbering === "none" || !node.numbered) {
      continue;
    }

    let count: number;

    if (rule.numbering === "continuous") {
      count = (continuous.get(node.level) ?? 0) + 1;
      continuous.set(node.level, count);
    } else {
      const key = `${node.parentId ?? ""}\u0000${node.level}`;
      count = (perParent.get(key) ?? 0) + 1;
      perParent.set(key, count);
    }

    numbers.set(node.id, rule.start + count - 1);
  }

  return numbers;
}

/** Numéro écrit avec le nombre minimal de chiffres (2 → « 01 »). */
export function formatNumber(value: number, digits: number): string {
  return String(value).padStart(Math.max(1, digits), "0");
}

/** Morceaux du nom d'un élément, pour l'affichage. */
export interface NodeHeading {
  /** « Chapitre 3 », ou le nom du niveau seul hors numérotation. */
  prefix: string;
  /** Numéro mis en forme (« 03 »), absent hors numérotation. */
  number: string | null;
  /** Titre libre (peut être vide). */
  title: string;
  /** Nom complet : « Chapitre 3 — Le départ », « Chapitre 3 », « Prologue ». */
  label: string;
}

/**
 * Nom d'un élément : nom du niveau + numéro, puis titre libre.
 * Hors numérotation, le titre seul (« Prologue ») ou, à défaut, le nom du
 * niveau.
 */
export function nodeHeading(
  node: Pick<StructureNode, "id" | "level" | "title">,
  levels: Pick<ResolvedLevel, "one" | "digits">[],
  numbers: Map<string, number>,
): NodeHeading {
  const level = levelOf(levels, node.level);
  const name = level?.one ?? "";
  const title = node.title.trim();
  const value = numbers.get(node.id);

  if (value === undefined) {
    return { prefix: name, number: null, title, label: title || name };
  }

  const number = formatNumber(value, level?.digits ?? 1);
  const prefix = `${name} ${number}`;

  return { prefix, number, title, label: title ? `${prefix} — ${title}` : prefix };
}

/** Exemple de numérotation (« Partie 1 › Chapitre 01 › Scène 1 »). */
export function levelsExample(levels: Pick<ResolvedLevel, "one" | "numbering" | "start" | "digits">[]): string {
  return levels
    .map((level) =>
      level.numbering === "none"
        ? level.one
        : `${level.one} ${formatNumber(level.start, level.digits)}`,
    )
    .join(" › ");
}

// ----------------------------------------------------------------------------
// Fiche d'un élément
// ----------------------------------------------------------------------------

/** Préfixe de l'onglet de la fiche d'un élément : `structure-node:<id>`. */
export const STRUCTURE_NODE_TAB_PREFIX = "structure-node:";

export function structureNodeTabId(nodeId: string): string {
  return `${STRUCTURE_NODE_TAB_PREFIX}${nodeId}`;
}

/** Identifiant de l'élément d'un onglet de fiche (sinon `null`). */
export function structureNodeIdOfTab(tabId: string): string | null {
  return tabId.startsWith(STRUCTURE_NODE_TAB_PREFIX) ? tabId.slice(STRUCTURE_NODE_TAB_PREFIX.length) : null;
}

/** Parents d'un élément, du plus large au plus proche. */
export function ancestorsOf(nodes: StructureNode[], nodeId: string): StructureNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const out: StructureNode[] = [];
  const seen = new Set<string>([nodeId]);

  for (let parentId = byId.get(nodeId)?.parentId ?? null; parentId; ) {
    const parent = byId.get(parentId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    out.unshift(parent);
    parentId = parent.parentId;
  }

  return out;
}

/** Éléments contenus dans un élément (enfants, petits-enfants…). */
export function descendantIdsOf(nodes: StructureNode[], nodeId: string): Set<string> {
  const out = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const node of nodes) {
      if (node.parentId === current && !out.has(node.id) && node.id !== nodeId) {
        out.add(node.id);
        queue.push(node.id);
      }
    }
  }

  return out;
}

/** Fiche (personnage ou lieu) présente dans les éléments contenus. */
export interface InsideMention {
  id: string;
  /** Éléments contenus où elle figure, dans l'ordre du plan. */
  nodeIds: string[];
}

/**
 * Personnages et lieux d'un élément : ceux qui lui sont liés directement,
 * puis ceux des éléments qu'il contient (un chapitre montre les
 * personnages de ses scènes), sans doublon avec les premiers.
 */
export function nodeLinks(
  nodes: StructureNode[],
  links: { characters: NodeCharacterLink[]; locations: NodeLocationLink[] },
  nodeId: string,
) {
  const inside = descendantIdsOf(nodes, nodeId);
  const order = new Map(
    flattenVisible(buildStructureTree(nodes), new Set()).map((node, index) => [node.id, index]),
  );

  const gather = <L extends { nodeId: string }>(all: L[], idOf: (link: L) => string) => {
    const direct = all.filter((link) => link.nodeId === nodeId);
    const directIds = new Set(direct.map(idOf));
    const byItem = new Map<string, string[]>();

    for (const link of all) {
      const id = idOf(link);
      if (!inside.has(link.nodeId) || directIds.has(id)) continue;
      byItem.set(id, [...(byItem.get(id) ?? []), link.nodeId]);
    }

    const indirect: InsideMention[] = [...byItem.entries()]
      .map(([id, nodeIds]) => ({
        id,
        nodeIds: nodeIds.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)),
      }))
      .sort((a, b) => (order.get(a.nodeIds[0]) ?? 0) - (order.get(b.nodeIds[0]) ?? 0));

    return { direct, indirect };
  };

  return {
    characters: gather(links.characters, (link) => link.characterId),
    locations: gather(links.locations, (link) => link.locationId),
  };
}
