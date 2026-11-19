import { buildStructureTree, flattenVisible } from "@/lib/structure";
import type { NodeCharacterLink, NodeCharacterRole, StructureLinks, StructureNode } from "@/types";

/*
 * Continuité de tous les types de projet (le manga a la sienne, case par
 * case : voir `ContinuityView`). Elle repose sur les personnages liés aux
 * éléments du découpage (rôle et état), les lieux liés, et ce que le type
 * de projet sait en plus (série : répliques et lieu de l'en-tête de scène).
 */

/**
 * Présences d'un manga : une paire page ↔ personnage pour chaque personnage
 * présent dans une case de la page ou qui y parle.
 */
export function panelPresences(panels: Array<{ pageId: string; characters: Array<{ characterId: string }>; texts: Array<{ characterId: string | null }> }>) {
  const seen = new Set<string>();
  const characters: Array<Pick<NodeCharacterLink, "nodeId" | "characterId">> = [];
  for (const panel of panels) {
    const ids = [...panel.characters.map((c) => c.characterId), ...panel.texts.map((x) => x.characterId)];
    for (const characterId of ids) {
      if (!characterId || seen.has(`${panel.pageId}|${characterId}`)) continue;
      seen.add(`${panel.pageId}|${characterId}`);
      characters.push({ nodeId: panel.pageId, characterId });
    }
  }
  return { characters };
}

/** Ce que le type de projet ajoute aux liens. */
export interface ContinuityExtra {
  /** Répliques par élément, puis par personnage (série). */
  lines?: Map<string, Map<string, number>>;
  /** Lieux propres à un élément en plus des lieux liés (série : en-tête). */
  places?: Map<string, string[]>;
}

export interface Appearance {
  node: StructureNode;
  /** Éléments au-dessus, du plus large au plus proche. */
  path: StructureNode[];
  /** Rôle du lien ; `null` : pas lié, mais il parle (série). */
  role: NodeCharacterRole | null;
  state: string;
  /** L'état a changé depuis le dernier état noté. */
  changed: boolean;
  /** Dernier état noté avant celui-ci (vide s'il n'y en a pas). */
  previousState: string;
  lines: number;
  /** Lieux de l'élément (les siens, sinon ceux de l'élément au-dessus). */
  places: string[];
}

/** Éléments dans l'ordre du plan. */
function inOrder(nodes: StructureNode[]): StructureNode[] {
  return flattenVisible(buildStructureTree(nodes), new Set());
}

/** Lieux de chaque élément : liés comme décor, puis ceux du type de projet. */
function placesByNode(links: Pick<StructureLinks, "locations">, extra: ContinuityExtra): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const add = (nodeId: string, id: string) => {
    const list = map.get(nodeId) ?? [];
    if (!list.includes(id)) list.push(id);
    map.set(nodeId, list);
  };
  for (const link of links.locations) if (link.role === "setting") add(link.nodeId, link.locationId);
  for (const [nodeId, ids] of extra.places ?? []) ids.forEach((id) => add(nodeId, id));
  return map;
}

/** Nombre d'éléments où apparaît chaque personnage (présent, point de vue, cité ou qui parle). */
export function appearanceCounts(links: Pick<StructureLinks, "characters">, extra: ContinuityExtra = {}): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  const add = (characterId: string, nodeId: string) => {
    const set = seen.get(characterId) ?? new Set<string>();
    set.add(nodeId);
    seen.set(characterId, set);
  };
  for (const link of links.characters) add(link.characterId, link.nodeId);
  for (const [nodeId, byCharacter] of extra.lines ?? []) for (const [characterId, n] of byCharacter) if (n > 0) add(characterId, nodeId);
  return new Map([...seen].map(([id, set]) => [id, set.size]));
}

/**
 * Parcours d'un personnage : chaque élément où il apparaît, dans l'ordre du
 * plan, avec son rôle, son état et le lieu. `locationId` : seulement les
 * éléments qui se passent dans ce lieu.
 */
export function characterAppearances(
  nodes: StructureNode[],
  links: Pick<StructureLinks, "characters" | "locations">,
  characterId: string,
  extra: ContinuityExtra = {},
  locationId = "",
): Appearance[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pathOf = (node: StructureNode) => {
    const path: StructureNode[] = [];
    let current = node.parentId ? byId.get(node.parentId) : undefined;
    while (current) {
      path.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return path;
  };
  const own = new Map(links.characters.filter((l) => l.characterId === characterId).map((l) => [l.nodeId, l]));
  const places = placesByNode(links, extra);
  const placesOf = (node: StructureNode): string[] => {
    for (let current: StructureNode | undefined = node; current; current = current.parentId ? byId.get(current.parentId) : undefined) {
      const list = places.get(current.id);
      if (list?.length) return list;
    }
    return [];
  };

  const out: Appearance[] = [];
  let previous = "";
  for (const node of inOrder(nodes)) {
    const link = own.get(node.id);
    const lines = extra.lines?.get(node.id)?.get(characterId) ?? 0;
    if (!link && lines === 0) continue;
    const nodePlaces = placesOf(node);
    // Le filtre ne coupe pas le suivi de l'état : un changement reste visible.
    const state = link?.state.trim() ?? "";
    const changed = Boolean(state) && Boolean(previous) && state !== previous;
    const previousState = previous;
    if (state) previous = state;
    if (locationId && !nodePlaces.includes(locationId)) continue;
    out.push({ node, path: pathOf(node), role: link?.role ?? null, state, changed, previousState, lines, places: nodePlaces });
  }
  return out;
}

export interface PresenceColumn {
  node: StructureNode;
}

export interface PresenceRow {
  characterId: string;
  /** Par colonne : 0 absent, sinon nombre d'éléments où il apparaît (elle et son contenu). */
  cells: number[];
  total: number;
}

/**
 * Tableau des présences : une colonne par élément du niveau `level`
 * (chapitres, épisodes…), une ligne par personnage. Une présence dans une
 * scène compte pour son chapitre.
 */
export function presenceTable(
  nodes: StructureNode[],
  /** Présences : les liens du découpage, ou des paires élément ↔ personnage (cases d'un manga). */
  links: { characters: Array<Pick<NodeCharacterLink, "nodeId" | "characterId">> },
  level: number,
  extra: ContinuityExtra = {},
): { columns: PresenceColumn[]; rows: PresenceRow[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const columns = inOrder(nodes).filter((n) => n.level === level);
  const index = new Map(columns.map((c, i) => [c.id, i]));
  const columnOf = (nodeId: string): number | undefined => {
    for (let current = byId.get(nodeId); current; current = current.parentId ? byId.get(current.parentId) : undefined) {
      const found = index.get(current.id);
      if (found !== undefined) return found;
    }
    return undefined;
  };

  const seen = new Map<string, Set<string>>();
  const add = (characterId: string, nodeId: string) => {
    if (!byId.has(nodeId)) return;
    const set = seen.get(characterId) ?? new Set<string>();
    set.add(nodeId);
    seen.set(characterId, set);
  };
  for (const link of links.characters) add(link.characterId, link.nodeId);
  for (const [nodeId, byCharacter] of extra.lines ?? []) for (const [characterId, n] of byCharacter) if (n > 0) add(characterId, nodeId);

  const rows: PresenceRow[] = [];
  for (const [characterId, nodeIds] of seen) {
    const cells = columns.map(() => 0);
    for (const nodeId of nodeIds) {
      const column = columnOf(nodeId);
      if (column !== undefined) cells[column] += 1;
    }
    const total = cells.filter((n) => n > 0).length;
    // Lié seulement au-dessus de ce niveau (une partie, une saison) : rien à montrer.
    if (total > 0) rows.push({ characterId, cells, total });
  }
  rows.sort((a, b) => b.total - a.total || a.cells.findIndex((n) => n > 0) - b.cells.findIndex((n) => n > 0));
  return { columns: columns.map((node) => ({ node })), rows };
}
