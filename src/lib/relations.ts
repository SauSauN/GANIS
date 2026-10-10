import { buildStructureTree, flattenVisible } from "@/lib/structure";
import type {
  Relation,
  RelationInput,
  RelationSentiment,
  RelationType,
  StructureNode,
} from "@/types";

/*
 * Relations entre personnages : types, période, dispositions du graphe.
 *
 * Toutes les fonctions sont pures (elles ne touchent ni au DOM ni au store),
 * ce qui les rend faciles à tester.
 */

// ----------------------------------------------------------------------------
// Types et tonalités
// ----------------------------------------------------------------------------

export const RELATION_TYPES: RelationType[] = [
  "family",
  "love",
  "friendship",
  "alliance",
  "professional",
  "mentor",
  "political",
  "rivalry",
  "enmity",
  "betrayal",
  "secret",
  "other",
];

/**
 * Couleur de chaque type : lisible sur fond clair comme sur fond sombre.
 * Le nom du type est toujours affiché à côté (jamais la couleur seule).
 */
export const RELATION_COLORS: Record<RelationType, string> = {
  family: "#d97706",
  love: "#e11d48",
  friendship: "#16a34a",
  alliance: "#0891b2",
  professional: "#64748b",
  mentor: "#7c3aed",
  political: "#2563eb",
  rivalry: "#ea580c",
  enmity: "#dc2626",
  betrayal: "#9f1239",
  secret: "#a21caf",
  other: "#78716c",
};

export const SENTIMENTS: RelationSentiment[] = ["positive", "neutral", "negative"];

export function emptyRelation(sourceId = "", targetId = ""): RelationInput {
  return {
    sourceId,
    targetId,
    type: "friendship",
    label: "",
    description: "",
    directed: false,
    intensity: 3,
    sentiment: "neutral",
    sinceNode: null,
    untilNode: null,
  };
}

export function inputFromRelation(relation: Relation): RelationInput {
  const { id: _id, createdAt: _c, updatedAt: _u, ...input } = relation;
  return input;
}

/** L'autre personnage d'une relation, vu depuis `characterId`. */
export function otherEnd(relation: Relation, characterId: string): string {
  return relation.sourceId === characterId ? relation.targetId : relation.sourceId;
}

/** Relations d'un personnage. */
export function relationsOf(relations: Relation[], characterId: string): Relation[] {
  return relations.filter((r) => r.sourceId === characterId || r.targetId === characterId);
}

// ----------------------------------------------------------------------------
// Période : relations à un moment de l'histoire
// ----------------------------------------------------------------------------

/** Éléments du découpage dans l'ordre du récit (parties, chapitres, scènes…). */
export function storyOrder(nodes: StructureNode[]): StructureNode[] {
  return flattenVisible(buildStructureTree(nodes), new Set());
}

/**
 * Vrai si la relation existe au moment `index` de l'histoire (position dans
 * `storyOrder`). `index === null` : toute l'histoire. Une borne inconnue
 * (élément supprimé) est ignorée.
 */
export function isActiveAt(
  relation: Relation,
  index: number | null,
  positionOf: Map<string, number>,
): boolean {
  if (index === null) return true;

  const since = relation.sinceNode ? positionOf.get(relation.sinceNode) : undefined;
  const until = relation.untilNode ? positionOf.get(relation.untilNode) : undefined;

  return (since === undefined || since <= index) && (until === undefined || index <= until);
}

// ----------------------------------------------------------------------------
// Dispositions du graphe
// ----------------------------------------------------------------------------

export type GraphLayout = "force" | "circle" | "groups" | "ego" | "free";

export const GRAPH_LAYOUTS: GraphLayout[] = ["force", "circle", "groups", "ego", "free"];

export interface Point {
  x: number;
  y: number;
}

export type Positions = Record<string, Point>;

/** Écart minimal entre deux personnages (px). */
const SPACING = 240;

/** Personnages répartis régulièrement sur un cercle. */
export function circleLayout(ids: string[], center: Point = { x: 0, y: 0 }, minRadius = 0): Positions {
  const positions: Positions = {};
  const n = ids.length;

  if (n === 0) return positions;
  if (n === 1) {
    // Seul sur son cercle : en haut (ou au centre s'il n'y a pas de rayon).
    return { [ids[0]]: { x: center.x, y: center.y - minRadius } };
  }

  // Rayon tel que deux voisins soient espacés d'au moins SPACING.
  const radius = Math.max(minRadius, (SPACING * n) / (2 * Math.PI), SPACING * 0.75);

  ids.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    positions[id] = { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
  });

  return positions;
}

/**
 * Disposition « force » (Fruchterman-Reingold) : les personnages liés se
 * rapprochent, les autres se repoussent. Déterministe : le même graphe
 * donne toujours le même dessin.
 */
export function forceLayout(
  ids: string[],
  links: Array<{ source: string; target: string; weight?: number }>,
  iterations = 300,
): Positions {
  const n = ids.length;
  if (n <= 1) return circleLayout(ids);

  const start = circleLayout(ids);
  const pos = ids.map((id) => ({ ...start[id] }));
  const index = new Map(ids.map((id, i) => [id, i]));
  const edges = links
    .map((l) => [index.get(l.source), index.get(l.target), l.weight ?? 1] as const)
    .filter((e): e is readonly [number, number, number] => e[0] !== undefined && e[1] !== undefined);

  const k = SPACING; // distance idéale
  let temperature = k * 2;

  for (let step = 0; step < iterations; step++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));

    // Répulsion entre toutes les paires.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let dist = Math.hypot(dx, dy);

        if (dist < 0.01) {
          // Points confondus : petit écart déterministe.
          dx = 0.01 * (i - j);
          dy = 0.01;
          dist = Math.hypot(dx, dy);
        }

        const force = (k * k) / dist;
        disp[i].x += (dx / dist) * force;
        disp[i].y += (dy / dist) * force;
        disp[j].x -= (dx / dist) * force;
        disp[j].y -= (dy / dist) * force;
      }
    }

    // Attraction le long des relations (plus forte si la relation l'est).
    for (const [a, b, weight] of edges) {
      const dx = pos[a].x - pos[b].x;
      const dy = pos[a].y - pos[b].y;
      const dist = Math.max(Math.hypot(dx, dy), 0.01);
      const force = ((dist * dist) / k) * (0.6 + weight * 0.1);

      disp[a].x -= (dx / dist) * force;
      disp[a].y -= (dy / dist) * force;
      disp[b].x += (dx / dist) * force;
      disp[b].y += (dy / dist) * force;
    }

    // Légère gravité vers le centre : les groupes isolés ne s'éloignent pas.
    for (let i = 0; i < n; i++) {
      disp[i].x -= pos[i].x * 0.02;
      disp[i].y -= pos[i].y * 0.02;
    }

    for (let i = 0; i < n; i++) {
      const length = Math.max(Math.hypot(disp[i].x, disp[i].y), 0.01);
      const move = Math.min(length, temperature);
      pos[i].x += (disp[i].x / length) * move;
      pos[i].y += (disp[i].y / length) * move;
    }

    temperature = Math.max(temperature * 0.97, 1);
  }

  return Object.fromEntries(ids.map((id, i) => [id, { x: Math.round(pos[i].x), y: Math.round(pos[i].y) }]));
}

/**
 * Groupes (par rôle, par exemple) : chaque groupe forme un petit cercle,
 * les groupes sont répartis côte à côte, en lignes.
 */
export function groupLayout(groups: Array<{ key: string; ids: string[] }>): {
  positions: Positions;
  centers: Record<string, Point & { radius: number }>;
} {
  const positions: Positions = {};
  const centers: Record<string, Point & { radius: number }> = {};
  const columns = Math.ceil(Math.sqrt(groups.length));

  const radiusOf = (count: number) =>
    count <= 1 ? 0 : Math.max((SPACING * count) / (2 * Math.PI), SPACING * 0.6);

  let x = 0;
  let y = 0;
  let rowHeight = 0;

  groups.forEach((group, i) => {
    const radius = radiusOf(group.ids.length);
    const size = 2 * radius + SPACING * 1.6;

    if (i > 0 && i % columns === 0) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }

    const center = { x: x + size / 2, y: y + size / 2 };
    centers[group.key] = { ...center, radius: radius + SPACING * 0.5 };
    Object.assign(positions, circleLayout(group.ids, center, radius));

    x += size;
    rowHeight = Math.max(rowHeight, size);
  });

  return { positions, centers };
}

/**
 * Ordre des personnages autour d'un cercle : chacun est suivi, autant que
 * possible, de celui avec qui il a le plus de relations. Les liens restent
 * courts et se croisent moins.
 */
export function circularOrder(ids: string[], links: Array<{ source: string; target: string }>): string[] {
  if (ids.length <= 2) return [...ids];

  const weight = new Map<string, number>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const degree = new Map(ids.map((id) => [id, 0]));

  for (const { source, target } of links) {
    if (!degree.has(source) || !degree.has(target)) continue;
    weight.set(key(source, target), (weight.get(key(source, target)) ?? 0) + 1);
    degree.set(source, degree.get(source)! + 1);
    degree.set(target, degree.get(target)! + 1);
  }

  // Départ : le personnage le plus relié (à égalité, l'ordre d'origine).
  const remaining = [...ids];
  remaining.sort((a, b) => degree.get(b)! - degree.get(a)!);
  const order = [remaining.shift()!];

  while (remaining.length > 0) {
    const last = order[order.length - 1];
    let best = 0;

    for (let i = 1; i < remaining.length; i++) {
      const w = weight.get(key(last, remaining[i])) ?? 0;
      const bestW = weight.get(key(last, remaining[best])) ?? 0;
      if (w > bestW) best = i;
    }

    order.push(remaining.splice(best, 1)[0]);
  }

  return order;
}

/** Distance (en nombre de relations) de chaque personnage à `centerId`. */
export function distancesFrom(
  centerId: string,
  links: Array<{ source: string; target: string }>,
): Map<string, number> {
  const neighbours = new Map<string, Set<string>>();

  for (const { source, target } of links) {
    if (!neighbours.has(source)) neighbours.set(source, new Set());
    if (!neighbours.has(target)) neighbours.set(target, new Set());
    neighbours.get(source)!.add(target);
    neighbours.get(target)!.add(source);
  }

  const distance = new Map([[centerId, 0]]);
  const queue = [centerId];

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const next of neighbours.get(current) ?? []) {
      if (!distance.has(next)) {
        distance.set(next, distance.get(current)! + 1);
        queue.push(next);
      }
    }
  }

  return distance;
}

/**
 * Centré sur un personnage : lui au milieu, ses proches sur un premier
 * cercle, les proches de ses proches sur le suivant, les autres à
 * l'extérieur.
 */
export function egoLayout(
  centerId: string,
  ids: string[],
  links: Array<{ source: string; target: string }>,
): { positions: Positions; distance: Map<string, number> } {
  const distance = distancesFrom(centerId, links);
  const maxDistance = Math.max(0, ...ids.map((id) => distance.get(id) ?? 0));
  const ring = (id: string) => distance.get(id) ?? maxDistance + 1;

  const rings = new Map<number, string[]>();
  for (const id of ids) {
    if (id === centerId) continue;
    const r = ring(id);
    rings.set(r, [...(rings.get(r) ?? []), id]);
  }

  const positions: Positions = { [centerId]: { x: 0, y: 0 } };
  let previousRadius = 0;

  for (const r of [...rings.keys()].sort((a, b) => a - b)) {
    const members = circularOrder(rings.get(r)!, links);
    const radius = Math.max(previousRadius + SPACING * 1.2, (SPACING * members.length) / (2 * Math.PI));
    Object.assign(positions, circleLayout(members, { x: 0, y: 0 }, radius));
    previousRadius = radius;
  }

  return { positions, distance };
}

/**
 * Courbure de chaque relation : quand deux personnages ont plusieurs
 * relations, elles sont dessinées en arcs écartés au lieu de se superposer.
 * Renvoie, par relation, un décalage (0 pour une relation seule).
 */
export function parallelOffsets(relations: Array<Pick<Relation, "id" | "sourceId" | "targetId">>): Map<string, number> {
  const byPair = new Map<string, string[]>();

  for (const r of relations) {
    const key = [r.sourceId, r.targetId].sort().join("|");
    byPair.set(key, [...(byPair.get(key) ?? []), r.id]);
  }

  const offsets = new Map<string, number>();

  for (const [key, ids] of byPair) {
    const [first] = key.split("|");

    ids.forEach((id, i) => {
      // 1 relation : 0 ; 2 : -0.5, +0.5 ; 3 : -1, 0, +1…
      let offset = i - (ids.length - 1) / 2;
      // Même sens de courbure quel que soit le sens de la relation.
      const relation = relations.find((r) => r.id === id)!;
      if (relation.sourceId !== first) offset = -offset;
      offsets.set(id, offset);
    });
  }

  return offsets;
}
