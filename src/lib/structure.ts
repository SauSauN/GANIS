import type {
  ProjectType,
  StructureNode,
  StructureTemplateId,
} from "@/types";

/**
 * Découpage du récit : modèles et arbre des éléments.
 *
 * Mêmes règles que Rust (`src-tauri/src/services/structure_service.rs`) :
 * trois niveaux (0, 1, 2), nommés par le modèle. Les noms sont traduits
 * dans `structure.json` (`templates.<modèle>.levels.<niveau>`).
 */

/** Nombre de niveaux de découpage. */
export const STRUCTURE_LEVELS = 3;

/** Niveaux, du plus large au plus fin. */
export const LEVEL_KEYS = ["0", "1", "2"] as const;

export type LevelKey = (typeof LEVEL_KEYS)[number];

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

/** Clé d'un niveau, pour les traductions. */
export function levelKey(level: number): LevelKey {
  const index = Math.min(Math.max(level, 0), STRUCTURE_LEVELS - 1);

  return LEVEL_KEYS[index];
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

/**
 * Nombre d'éléments d'un niveau sous un parent : sert à proposer un titre
 * numéroté pour un nouvel élément (« Chapitre 3 »).
 */
export function countAtLevel(
  nodes: StructureNode[],
  parentId: string | null,
  level: number,
): number {
  return nodes.filter((node) => node.parentId === parentId && node.level === level).length;
}

/** Nombre d'éléments de chaque niveau dans tout le projet. */
export function countByLevel(nodes: StructureNode[]): number[] {
  const counts = Array.from({ length: STRUCTURE_LEVELS }, () => 0);

  for (const node of nodes) {
    counts[Math.min(Math.max(node.level, 0), STRUCTURE_LEVELS - 1)] += 1;
  }

  return counts;
}
