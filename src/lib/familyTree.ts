import type { Relation } from "@/types";

/*
 * Arbre généalogique : calculé à partir des relations « family » qui
 * précisent leur lien (`familyLink`) :
 * - `parent` : la source est le parent de la cible ;
 * - `partner` : couple ; `sibling` : frères et sœurs (même génération) ;
 * - sans les personnes d'entre eux : `grandparent` (deux générations plus
 *   haut), `auntUncle` (une génération plus haut), `cousin` (même ligne).
 *
 * Les relations de famille sans lien précis (cousin, oncle…) ne placent
 * personne : elles sont listées à part.
 */

export interface FamilyNode {
  id: string;
  /** Génération : 0 en haut (les plus anciens). */
  generation: number;
  /** Rang dans sa génération, de gauche à droite. */
  order: number;
}

export interface FamilyTree {
  /** Générations, de la plus ancienne à la plus récente : identifiants dans l'ordre. */
  generations: string[][];
  nodes: Map<string, FamilyNode>;
  /** Parents de chaque enfant présent dans l'arbre. */
  parentsOf: Map<string, string[]>;
  partners: Array<[string, string]>;
  siblings: Array<[string, string]>;
  /** Liens sans intermédiaire : [aîné, cadet] pour grand-parent, oncle ou tante. */
  grandparents: Array<[string, string]>;
  auntsUncles: Array<[string, string]>;
  cousins: Array<[string, string]>;
  /** Relations de famille sans lien précis. */
  others: Relation[];
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function buildFamilyTree(relations: Relation[], nameOf: (id: string) => string = (id) => id): FamilyTree {
  const family = relations.filter((r) => r.type === "family");
  const linked = family.filter((r) => r.familyLink);
  const others = family.filter((r) => !r.familyLink);

  const parentsOf = new Map<string, string[]>();
  const partnerKeys = new Set<string>();
  const siblingKeys = new Set<string>();
  const partners: Array<[string, string]> = [];
  const siblings: Array<[string, string]> = [];
  const grandparents: Array<[string, string]> = [];
  const auntsUncles: Array<[string, string]> = [];
  const cousins: Array<[string, string]> = [];
  const cousinKeys = new Set<string>();
  const members = new Set<string>();

  for (const r of linked) {
    members.add(r.sourceId);
    members.add(r.targetId);
    if (r.familyLink === "grandparent") {
      grandparents.push([r.sourceId, r.targetId]);
    } else if (r.familyLink === "auntUncle") {
      auntsUncles.push([r.sourceId, r.targetId]);
    } else if (r.familyLink === "cousin") {
      const key = pairKey(r.sourceId, r.targetId);
      if (!cousinKeys.has(key)) {
        cousinKeys.add(key);
        cousins.push([r.sourceId, r.targetId]);
      }
    } else if (r.familyLink === "parent") {
      const list = parentsOf.get(r.targetId) ?? [];
      if (!list.includes(r.sourceId)) list.push(r.sourceId);
      parentsOf.set(r.targetId, list);
    } else {
      const key = pairKey(r.sourceId, r.targetId);
      const [keys, list] = r.familyLink === "partner" ? [partnerKeys, partners] : [siblingKeys, siblings];
      if (!keys.has(key)) {
        keys.add(key);
        list.push([r.sourceId, r.targetId]);
      }
    }
  }

  // Générations : un enfant est sous ses parents ; un couple et des frères
  // et sœurs sont sur la même ligne. Itérations bornées : une boucle (un
  // personnage parent de son propre ancêtre) ne bloque rien.
  const generation = new Map<string, number>([...members].map((id) => [id, 0]));
  for (let pass = 0; pass <= members.size; pass++) {
    let changed = false;
    const raise = (id: string, value: number) => {
      if (value > (generation.get(id) ?? 0) && value <= members.size) {
        generation.set(id, value);
        changed = true;
      }
    };
    for (const [child, parents] of parentsOf) {
      for (const parent of parents) raise(child, (generation.get(parent) ?? 0) + 1);
    }
    for (const [elder, young] of grandparents) raise(young, (generation.get(elder) ?? 0) + 2);
    for (const [elder, young] of auntsUncles) raise(young, (generation.get(elder) ?? 0) + 1);
    for (const [a, b] of [...partners, ...siblings, ...cousins]) {
      const top = Math.max(generation.get(a) ?? 0, generation.get(b) ?? 0);
      raise(a, top);
      raise(b, top);
    }
    if (!changed) break;
  }

  // Ordre dans chaque génération : sous ses parents (moyenne de leur rang),
  // les couples côte à côte, puis par nom.
  const depth = Math.max(0, ...generation.values());
  const generations: string[][] = [];
  const rank = new Map<string, number>();
  for (let g = 0; g <= depth; g++) {
    const row = [...members].filter((id) => generation.get(id) === g);
    const key = (id: string) => {
      const ranks = (parentsOf.get(id) ?? []).map((p) => rank.get(p)).filter((v): v is number => v !== undefined);
      if (ranks.length) return ranks.reduce((a, b) => a + b, 0) / ranks.length;
      // Sans parent connu : à côté de ses frères et sœurs qui en ont.
      for (const [a, b] of siblings) {
        const other = a === id ? b : b === id ? a : null;
        const otherRanks = other ? (parentsOf.get(other) ?? []).map((p) => rank.get(p)).filter((v): v is number => v !== undefined) : [];
        if (otherRanks.length) return otherRanks.reduce((x, y) => x + y, 0) / otherRanks.length;
      }
      // Sinon, près de son grand-parent, de son oncle ou de sa tante.
      const elders = [...grandparents, ...auntsUncles]
        .filter(([, young]) => young === id)
        .map(([elder]) => rank.get(elder))
        .filter((v): v is number => v !== undefined);
      if (elders.length) return elders.reduce((x, y) => x + y, 0) / elders.length + 0.5;
      return Number.POSITIVE_INFINITY;
    };
    row.sort((a, b) => key(a) - key(b) || nameOf(a).localeCompare(nameOf(b)));
    // Rapprocher chaque couple.
    for (const [a, b] of partners) {
      const ia = row.indexOf(a);
      const ib = row.indexOf(b);
      if (ia === -1 || ib === -1 || Math.abs(ia - ib) === 1) continue;
      const [first, second] = ia < ib ? [a, b] : [b, a];
      row.splice(row.indexOf(second), 1);
      row.splice(row.indexOf(first) + 1, 0, second);
    }
    row.forEach((id, i) => rank.set(id, i));
    generations.push(row);
  }

  const nodes = new Map<string, FamilyNode>();
  generations.forEach((row, g) => row.forEach((id, order) => nodes.set(id, { id, generation: g, order })));

  return {
    generations: generations.filter((row) => row.length > 0),
    nodes,
    parentsOf,
    partners,
    siblings,
    grandparents,
    auntsUncles,
    cousins,
    others,
  };
}
