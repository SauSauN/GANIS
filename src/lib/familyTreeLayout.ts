import type { FamilyTree } from "@/lib/familyTree";

/*
 * Mise en place de l'arbre généalogique sur la toile : position de chaque
 * carte et tracé des traits. Les coordonnées sont celles de la toile
 * (avant zoom) ; la carte est repérée par son coin haut gauche.
 */

export const CARD_W = 168;
export const CARD_H = 136;
export const GAP_X = 32;
export const GAP_Y = 88;
/** Marge à gauche réservée au nom des générations. */
export const GUTTER = 132;
export const PAD = 32;

export type FamilyLineKind = "parent" | "partner" | "sibling" | "direct" | "cousin";

export interface FamilyLine {
  key: string;
  kind: FamilyLineKind;
  d: string;
  /** Personnes reliées par ce trait (l'enfant d'abord pour « parent »). */
  ids: string[];
}

export interface FamilyLayout {
  pos: Map<string, { x: number; y: number }>;
  /** Haut de chaque génération. */
  rows: number[];
  width: number;
  height: number;
  lines: FamilyLine[];
}

type P = { x: number; y: number };
const isP = (p: P | undefined): p is P => Boolean(p);

export function layoutFamilyTree(tree: FamilyTree): FamilyLayout {
  // Positions : la première génération côte à côte ; ensuite, chaque groupe
  // de frères et sœurs centré sous ses parents (à défaut, sous son
  // grand-parent, son oncle ou sa tante), décalé vers la droite seulement
  // s'il chevaucherait son voisin.
  const pos = new Map<string, P>();
  const STEP = CARD_W + GAP_X;
  const rows: number[] = [];
  tree.generations.forEach((row, g) => {
    const y = PAD + g * (CARD_H + GAP_Y);
    rows.push(y);
    const parentKey = (id: string) => [...(tree.parentsOf.get(id) ?? [])].sort().join("|");
    const groups: string[][] = [];
    for (const id of row) {
      const last = groups[groups.length - 1];
      if (last && parentKey(id) !== "" && parentKey(last[0]) === parentKey(id)) last.push(id);
      else groups.push([id]);
    }
    let next = Number.NEGATIVE_INFINITY;
    for (const group of groups) {
      const parentIds = tree.parentsOf.get(group[0]) ?? [];
      const elderIds = [...tree.grandparents, ...tree.auntsUncles].filter(([, young]) => young === group[0]).map(([elder]) => elder);
      const above = (parentIds.length ? parentIds : elderIds).map((p) => pos.get(p)).filter(isP);
      const groupWidth = group.length * CARD_W + (group.length - 1) * GAP_X;
      const center = above.length ? above.reduce((sum, p) => sum + p.x + CARD_W / 2, 0) / above.length : null;
      const wanted = center !== null ? center - groupWidth / 2 : next === Number.NEGATIVE_INFINITY ? 0 : next;
      let x = Math.max(wanted, next);
      for (const id of group) {
        pos.set(id, { x, y });
        x += STEP;
      }
      next = x;
    }
  });

  // Tout décaler : la carte la plus à gauche juste après la marge des générations.
  const minX = Math.min(...[...pos.values()].map((p) => p.x), 0);
  for (const p of pos.values()) p.x += GUTTER + PAD - minX;
  const width = Math.max(GUTTER + PAD * 2 + CARD_W, ...[...pos.values()].map((p) => p.x + CARD_W + PAD));
  const height = PAD * 2 + rows.length * CARD_H + Math.max(0, rows.length - 1) * GAP_Y;

  const lines: FamilyLine[] = [];
  const pair = (a: string, b: string) => [pos.get(a), pos.get(b)] as const;

  // Parents → enfant : du milieu des parents (ou du parent seul) à l'enfant, en équerre.
  for (const [child, parents] of tree.parentsOf) {
    const c = pos.get(child);
    const ps = parents.map((p) => pos.get(p)).filter(isP);
    if (!c || ps.length === 0) continue;
    const fromX = ps.reduce((sum, p) => sum + p.x + CARD_W / 2, 0) / ps.length;
    const fromY = Math.max(...ps.map((p) => p.y)) + (ps.length > 1 ? CARD_H / 2 : CARD_H);
    const toX = c.x + CARD_W / 2;
    const midY = c.y - GAP_Y / 2;
    lines.push({ key: `p:${child}`, kind: "parent", d: `M ${fromX} ${fromY} V ${midY} H ${toX} V ${c.y}`, ids: [child, ...parents] });
  }
  for (const [a, b] of tree.partners) {
    const [pa, pb] = pair(a, b);
    if (!pa || !pb) continue;
    const [left, right] = pa.x < pb.x ? [pa, pb] : [pb, pa];
    const y = left.y + CARD_H / 2;
    const d =
      left.y === right.y
        ? `M ${left.x + CARD_W} ${y} H ${right.x}`
        : `M ${left.x + CARD_W} ${y} H ${(left.x + CARD_W + right.x) / 2} V ${right.y + CARD_H / 2} H ${right.x}`;
    lines.push({ key: `c:${a}|${b}`, kind: "partner", d, ids: [a, b] });
  }
  // Grand-parent, oncle ou tante sans intermédiaire : pointillés, décalés
  // pour ne pas se confondre avec les traits parent → enfant.
  for (const [elder, young] of [...tree.grandparents, ...tree.auntsUncles]) {
    const [e, y] = pair(elder, young);
    if (!e || !y) continue;
    const fromX = e.x + CARD_W / 2 + 18;
    const toX = y.x + CARD_W / 2 + 18;
    const midY = y.y - GAP_Y / 2 + 12;
    lines.push({ key: `d:${elder}|${young}`, kind: "direct", d: `M ${fromX} ${e.y + CARD_H} V ${midY} H ${toX} V ${y.y}`, ids: [young, elder] });
  }
  for (const [a, b] of tree.cousins) {
    const [pa, pb] = pair(a, b);
    if (!pa || !pb) continue;
    const [left, right] = pa.x < pb.x ? [pa, pb] : [pb, pa];
    const y = Math.max(left.y, right.y) + CARD_H + 14;
    lines.push({
      key: `k:${a}|${b}`,
      kind: "cousin",
      d: `M ${left.x + CARD_W / 2} ${left.y + CARD_H} V ${y} H ${right.x + CARD_W / 2} V ${right.y + CARD_H}`,
      ids: [a, b],
    });
  }
  // Frères et sœurs déjà reliés par leurs parents : pas de trait en plus.
  for (const [a, b] of tree.siblings) {
    if (tree.parentsOf.get(a)?.length && tree.parentsOf.get(b)?.length) continue;
    const [pa, pb] = pair(a, b);
    if (!pa || !pb) continue;
    const [left, right] = pa.x < pb.x ? [pa, pb] : [pb, pa];
    const y = Math.min(left.y, right.y) - 14;
    lines.push({
      key: `s:${a}|${b}`,
      kind: "sibling",
      d: `M ${left.x + CARD_W / 2} ${left.y} V ${y} H ${right.x + CARD_W / 2} V ${right.y}`,
      ids: [a, b],
    });
  }

  return { pos, rows, width, height, lines };
}

/** Famille proche d'une personne, d'après l'arbre. */
export interface Kin {
  parents: string[];
  children: string[];
  partners: string[];
  siblings: string[];
  grandparents: string[];
  grandchildren: string[];
  auntsUncles: string[];
  nephews: string[];
  cousins: string[];
}

export function kinOf(tree: FamilyTree, id: string): Kin {
  const uniq = (list: string[]) => [...new Set(list)].filter((x) => x !== id);
  const other = (pairs: Array<[string, string]>) => pairs.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : []));
  const parents = tree.parentsOf.get(id) ?? [];
  const children = [...tree.parentsOf].filter(([, ps]) => ps.includes(id)).map(([child]) => child);
  // Mêmes parents : frères et sœurs, même sans lien « frères et sœurs » créé.
  const sameParents = [...tree.parentsOf].filter(([child, ps]) => child !== id && ps.some((p) => parents.includes(p))).map(([child]) => child);
  return {
    parents: uniq(parents),
    children: uniq(children),
    partners: uniq(other(tree.partners)),
    siblings: uniq([...other(tree.siblings), ...sameParents]),
    grandparents: uniq(tree.grandparents.filter(([, y]) => y === id).map(([e]) => e)),
    grandchildren: uniq(tree.grandparents.filter(([e]) => e === id).map(([, y]) => y)),
    auntsUncles: uniq(tree.auntsUncles.filter(([, y]) => y === id).map(([e]) => e)),
    nephews: uniq(tree.auntsUncles.filter(([e]) => e === id).map(([, y]) => y)),
    cousins: uniq(other(tree.cousins)),
  };
}
