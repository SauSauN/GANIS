/*
 * Lecture complète de l'histoire (bouton ▶ de la barre de titre).
 *
 * Fonctions pures (testées), sans état. Rien n'est stocké : la lecture est
 * compilée à la demande à partir du découpage, dans l'ordre du plan.
 *
 * - Roman : le manuscrit continu (`manuscript.read`).
 * - Manga / BD : l'histoire chapitre par chapitre (`script.read`), à
 *   l'image du roman : l'explication de chaque chapitre, puis ce que
 *   montrent ses pages, sans les détails de case (cadrage, bulles…).
 * - Film, série, jeu vidéo, JDR, projet libre : `structure.read`, compilé
 *   ici. Chaque élément du découpage donne son titre (« Acte I »,
 *   « Épisode 3 — Le retour »…), son résumé, son texte (fiche, sinon
 *   documents texte) et, à défaut de texte, ce qui s'y passe d'après la
 *   trame (événements rattachés à cet élément, dans l'ordre des moments).
 */

import type { NodeText } from "@/lib/novel";
import type { PlotEvent } from "@/lib/plot";
import { buildStructureTree, type StructureTreeNode } from "@/lib/structure";
import type { ProjectType, StructureNode } from "@/types";

/** Onglet de lecture complète propre à chaque type de projet. */
export function readingFeatureFor(type: ProjectType | string | null | undefined): string {
  if (type === "novel") return "manuscript.read";
  if (type === "manga") return "script.read";
  return "structure.read";
}

/** Onglets qui sont une lecture complète (bouton ▶ enfoncé). */
export const READING_FEATURES = new Set(["manuscript.read", "script.read", "structure.read"]);

export type StoryEntry =
  | {
      kind: "heading";
      node: StructureNode;
      /** Profondeur dans le plan (0 = racine). */
      depth: number;
      label: string;
    }
  | { kind: "summary"; node: StructureNode; text: string }
  /** Ce que montre une scène (page de manga) : un paragraphe du récit. */
  | { kind: "scene"; node: StructureNode; text: string; breakBefore: boolean }
  | { kind: "text"; node: StructureNode; html: string; source: NodeText["source"]; words: number }
  | { kind: "event"; node: StructureNode; event: PlotEvent };

/** Événements racontés dans chaque élément, dans l'ordre des moments. */
export function eventsByNode(events: readonly PlotEvent[]): Map<string, PlotEvent[]> {
  const map = new Map<string, PlotEvent[]>();
  for (const event of events) {
    if (!event.nodeId) continue;
    const list = map.get(event.nodeId) ?? [];
    list.push(event);
    map.set(event.nodeId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.row - b.row || a.title.localeCompare(b.title));
  return map;
}

/** Vrai si l'élément ou l'un de ses descendants a quelque chose à lire. */
function hasContent(node: StructureTreeNode, own: (node: StructureTreeNode) => boolean): boolean {
  return own(node) || node.children.some((child) => hasContent(child, own));
}

/**
 * Compile la lecture dans l'ordre du plan. Les éléments sans rien à lire
 * (ni résumé, ni texte, ni événement, eux et leurs contenus) sont omis :
 * la lecture ne montre que l'histoire, pas les cases vides du plan.
 */
export function assembleStory(
  nodes: StructureNode[],
  texts: ReadonlyMap<string, NodeText>,
  events: ReadonlyMap<string, PlotEvent[]>,
  labelOf: (node: StructureNode) => string,
  options: {
    /**
     * Niveau à partir duquel les éléments se lisent comme des scènes de
     * roman : pas de titre, leur résumé devient un paragraphe du récit
     * (pages d'un manga). Absent : tous les éléments ont leur titre.
     */
    sceneLevel?: number;
  } = {},
): StoryEntry[] {
  const out: StoryEntry[] = [];
  const textOf = (node: StructureNode) => {
    const text = texts.get(node.id);
    return text && text.words > 0 ? text : null;
  };
  const own = (node: StructureNode) =>
    Boolean(node.summary.trim()) || textOf(node) !== null || (events.get(node.id)?.length ?? 0) > 0;

  const walk = (list: StructureTreeNode[], depth: number) => {
    let previousScene = false;
    for (const node of list) {
      if (!hasContent(node, own)) continue;
      const scene = options.sceneLevel !== undefined && node.level >= options.sceneLevel;
      const summary = node.summary.trim();
      if (scene) {
        if (summary) out.push({ kind: "scene", node, text: summary, breakBefore: previousScene });
        previousScene = true;
      } else {
        out.push({ kind: "heading", node, depth, label: labelOf(node) });
        if (summary) out.push({ kind: "summary", node, text: summary });
        previousScene = false;
      }
      const text = textOf(node);
      if (text) {
        out.push({ kind: "text", node, html: text.html, source: text.source, words: text.words });
      } else {
        // Pas encore écrit : ce qui s'y passe d'après la trame.
        for (const event of events.get(node.id) ?? []) out.push({ kind: "event", node, event });
      }
      if (node.children.length) walk(node.children, depth + 1);
    }
  };

  walk(buildStructureTree(nodes), 0);
  return out;
}

/** Événements de la trame qui ne sont rattachés à aucun élément existant. */
export function unplacedEvents(events: readonly PlotEvent[], nodes: readonly StructureNode[]): number {
  const ids = new Set(nodes.map((node) => node.id));
  return events.filter((event) => !event.nodeId || !ids.has(event.nodeId)).length;
}
