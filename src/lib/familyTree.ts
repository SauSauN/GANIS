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

// ----------------------------------------------------------------------------
// Arbre d'un personnage
// ----------------------------------------------------------------------------

/** Préfixe des membres « fantômes » : de la famille, mais jamais mentionnés. */
export const GHOST_PREFIX = "ghost:";

export const isGhost = (id: string) => id.startsWith(GHOST_PREFIX);

/** Fantôme parent de `childId` (lui-même éventuellement fantôme). */
const ghostParentId = (childId: string) => `${GHOST_PREFIX}${childId}`;

/** Personne réelle sous un fantôme, et nombre de générations qui les séparent. */
export function ghostAnchor(id: string): { childId: string; depth: number } {
  let depth = 0;
  let current = id;
  while (isGhost(current)) {
    current = current.slice(GHOST_PREFIX.length);
    depth += 1;
  }
  return { childId: current, depth };
}

/** Toute la famille de `rootId` : les personnes reliées par un lien familial précis, de proche en proche. */
export function familyOf(relations: Relation[], rootId: string): Set<string> {
  const linked = relations.filter((r) => r.type === "family" && r.familyLink);
  const family = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const r of linked) {
      const other = r.sourceId === id ? r.targetId : r.targetId === id ? r.sourceId : null;
      if (other && !family.has(other)) {
        family.add(other);
        queue.push(other);
      }
    }
  }
  return family;
}

/**
 * Complète les liens sans intermédiaire par des membres « fantômes » : un
 * grand-père sans parent connu entre lui et son petit-fils devient le père
 * d'un parent fantôme ; un oncle, le frère d'un parent fantôme ; deux
 * cousins, les enfants de deux fantômes frères et sœurs.
 *
 * Un fantôme n'est créé que lorsqu'il n'y a pas d'ambiguïté (aucun parent
 * connu) ; sinon le lien reste dessiné en pointillés. Les relations rendues
 * sont prêtes pour `buildFamilyTree` : les liens « parent » ajoutés ont un
 * identifiant qui commence par `ghost:`.
 */
export function withGhosts(relations: Relation[]): Relation[] {
  const family = relations.filter((r) => r.type === "family");
  const parents = new Map<string, string[]>();
  const parentsOf = (id: string) => parents.get(id) ?? [];
  const addParent = (child: string, parent: string) => {
    const list = parents.get(child) ?? [];
    if (!list.includes(parent)) list.push(parent);
    parents.set(child, list);
  };
  for (const r of family) if (r.familyLink === "parent") addParent(r.targetId, r.sourceId);

  const siblingKeys = new Set(family.filter((r) => r.familyLink === "sibling").map((r) => pairKey(r.sourceId, r.targetId)));
  const areSiblings = (a: string, b: string) =>
    a !== b && (siblingKeys.has(pairKey(a, b)) || parentsOf(a).some((p) => parentsOf(b).includes(p)));

  /** Un parent sans ambiguïté pour y rattacher un ancêtre : un fantôme, existant ou à créer. */
  const anchor = (id: string): string | null => {
    const known = parentsOf(id);
    if (known.length === 0) {
      const ghost = ghostParentId(id);
      addParent(id, ghost);
      return ghost;
    }
    return known.find(isGhost) ?? null;
  };

  /** Rend `a` et `b` frères et sœurs ; seuls les fantômes reçoivent des parents d'office. */
  const makeSiblings = (a: string, b: string): boolean => {
    if (areSiblings(a, b)) return true;
    const pa = parentsOf(a);
    const pb = parentsOf(b);
    if (pa.length && !pb.length && isGhost(b)) pa.forEach((p) => addParent(b, p));
    else if (pb.length && !pa.length && isGhost(a)) pb.forEach((p) => addParent(a, p));
    else if (!pa.length && !pb.length) {
      const common = ghostParentId(isGhost(a) ? b : a);
      addParent(a, common);
      addParent(b, common);
    } else return false;
    return true;
  };

  const resolved = new Set<string>();
  const indirect = (link: FamilyLinkName) => family.filter((r) => r.familyLink === link);

  for (const r of indirect("grandparent")) {
    const [elder, young] = [r.sourceId, r.targetId];
    if (parentsOf(young).some((p) => parentsOf(p).includes(elder))) {
      resolved.add(r.id);
      continue;
    }
    const parent = anchor(young);
    if (parent) {
      addParent(parent, elder);
      resolved.add(r.id);
    }
  }
  for (const r of indirect("auntUncle")) {
    const [elder, young] = [r.sourceId, r.targetId];
    if (parentsOf(young).some((p) => areSiblings(p, elder))) {
      resolved.add(r.id);
      continue;
    }
    const parent = anchor(young);
    if (parent && makeSiblings(parent, elder)) resolved.add(r.id);
  }
  for (const r of indirect("cousin")) {
    const [a, b] = [r.sourceId, r.targetId];
    if (parentsOf(a).some((p) => parentsOf(b).some((q) => areSiblings(p, q)))) {
      resolved.add(r.id);
      continue;
    }
    // Pas de fantôme si l'un des deux a déjà des parents connus : on ne sait pas lequel.
    const free = (id: string) => parentsOf(id).length === 0 || parentsOf(id).some(isGhost);
    if (!free(a) || !free(b)) continue;
    const pa = anchor(a);
    const pb = anchor(b);
    if (pa && pb && makeSiblings(pa, pb)) resolved.add(r.id);
  }

  // Liens « parent » ajoutés : ceux qui touchent un fantôme.
  const template = family[0];
  const ghostLinks: Relation[] = [];
  for (const [child, list] of parents) {
    for (const parent of list) {
      if (!isGhost(parent) && !isGhost(child)) continue;
      ghostLinks.push({
        ...template,
        id: `${GHOST_PREFIX}${parent}>${child}`,
        sourceId: parent,
        targetId: child,
        type: "family",
        label: "",
        description: "",
        directed: true,
        familyLink: "parent",
      });
    }
  }
  return [...relations.filter((r) => !resolved.has(r.id)), ...ghostLinks];
}

type FamilyLinkName = NonNullable<Relation["familyLink"]>;
