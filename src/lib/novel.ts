/*
 * Outils du romancier : fonctions pures (testées), sans état.
 *
 * Ces fonctions ne servent qu'aux projets de type « Roman » (l'interface ne
 * les propose qu'à eux). Le manuscrit n'est jamais stocké : il est assemblé
 * à la demande à partir des textes des éléments du découpage, dans l'ordre
 * du plan. Le texte d'un élément est celui écrit dans sa fiche ; à défaut,
 * celui de ses documents texte (Word, Markdown, texte brut).
 */

import type {
  NarrativePerson,
  NarrativeTense,
  Project,
  StructureNode,
  WritingStatus,
} from "@/types";
import { buildStructureTree, type StructureTreeNode } from "@/lib/structure";

/** Vrai pour un projet de roman : seuls ceux-là voient les outils du romancier. */
export function isNovelProject(project: Pick<Project, "type"> | null | undefined): boolean {
  return project?.type === "novel";
}

// ----------------------------------------------------------------------------
// Niveaux : scènes et chapitres
// ----------------------------------------------------------------------------

/**
 * Niveau des scènes : le plus fin du découpage (Partie › Chapitre › Scène
 * pour le modèle Roman). C'est là que s'écrit le texte.
 */
export function sceneLevel(levelCount: number): number {
  return Math.max(0, levelCount - 1);
}

/**
 * Niveau des chapitres : celui juste au-dessus des scènes (le seul niveau
 * s'il n'y en a qu'un). C'est là que se suit l'état de rédaction.
 */
export function chapterLevel(levelCount: number): number {
  return Math.max(0, levelCount - 2);
}

/**
 * Un élément peut recevoir du texte s'il est au niveau des scènes, ou s'il
 * ne contient rien (un chapitre pas encore découpé en scènes).
 */
export function canHoldText(node: Pick<StructureNode, "id" | "level">, nodes: StructureNode[], levelCount: number): boolean {
  return node.level >= sceneLevel(levelCount) || !nodes.some((other) => other.parentId === node.id);
}

// ----------------------------------------------------------------------------
// Texte et mots
// ----------------------------------------------------------------------------

const BLOCK_TAGS = /^(p|br|div|li|ul|ol|h[1-6]|blockquote|td|th|tr|hr)$/i;

/** Texte brut d'un HTML de l'éditeur (même règle que Rust : `novel_service::plain_text`). */
export function plainText(html: string): string {
  const withoutTags = html.replace(/<\/?([a-zA-Z0-9]+)[^>]*>/g, (_, name: string) => (BLOCK_TAGS.test(name) ? " " : ""));
  return withoutTags
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Mots d'un texte brut : suites sans espace contenant au moins une lettre
 * ou un chiffre (« l'homme », « peut-être » : un mot ; « — » : aucun).
 */
export function countWordsPlain(text: string): number {
  let count = 0;
  for (const token of text.split(/\s+/)) {
    if (/[\p{L}\p{N}]/u.test(token)) count++;
  }
  return count;
}

export function countWords(html: string): number {
  return countWordsPlain(plainText(html));
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Texte brut → paragraphes HTML (un paragraphe par ligne vide, sauts de ligne gardés). */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Markdown simple → HTML : titres et listes deviennent des paragraphes,
 * *italique* et **gras** sont gardés. Suffit pour le texte d'une scène.
 */
export function markdownToHtml(markdown: string): string {
  const inline = (line: string) =>
    escapeHtml(line)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>")
      .replace(/(^|\W)_(?!\s)(.+?)_(?=\W|$)/g, "$1<em>$2</em>");
  return markdown
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.replace(/^\s{0,3}(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/, "").trim())
        .filter(Boolean)
        .map(inline)
        .join("<br>"),
    )
    .filter(Boolean)
    .map((block) => `<p>${block}</p>`)
    .join("");
}

// ----------------------------------------------------------------------------
// Manuscrit
// ----------------------------------------------------------------------------

/** D'où vient le texte d'un élément. */
export type TextSource = "sheet" | "documents";

export interface NodeText {
  html: string;
  source: TextSource;
  words: number;
}

export type ManuscriptEntry =
  /** Titre d'une partie, d'un chapitre… (pas des scènes). */
  | { kind: "heading"; node: StructureNode; depth: number; label: string }
  /** Texte d'un élément ; `breakBefore` : séparateur de scène (* * *). */
  | { kind: "text"; node: StructureNode; html: string; source: TextSource; words: number; breakBefore: boolean };

/**
 * Assemble le manuscrit dans l'ordre du plan : titres des parties et des
 * chapitres, puis le texte de chaque élément qui en a un. Deux scènes qui
 * se suivent dans un même chapitre sont séparées par un séparateur. Les
 * titres des scènes ne sont pas repris (ce ne sont pas des titres du livre).
 */
export function assembleManuscript(
  nodes: StructureNode[],
  levelCount: number,
  texts: ReadonlyMap<string, NodeText>,
  labelOf: (node: StructureNode) => string,
): ManuscriptEntry[] {
  const scenes = sceneLevel(levelCount);
  const out: ManuscriptEntry[] = [];

  const walk = (list: StructureTreeNode[], depth: number) => {
    let previousWasText = false;
    for (const node of list) {
      if (node.level < scenes) {
        out.push({ kind: "heading", node, depth, label: labelOf(node) });
        previousWasText = false;
      }
      const text = texts.get(node.id);
      if (text && text.words > 0) {
        out.push({ kind: "text", node, html: text.html, source: text.source, words: text.words, breakBefore: previousWasText });
        previousWasText = node.level >= scenes;
      }
      if (node.children.length) {
        walk(node.children, depth + 1);
        previousWasText = false;
      }
    }
  };

  walk(buildStructureTree(nodes), 0);
  return out;
}

/** Mots de chaque élément, contenus compris (scène, chapitre, partie). */
export function wordTotals(nodes: StructureNode[], ownWords: (node: StructureNode) => number): Map<string, number> {
  const totals = new Map<string, number>();
  const visit = (node: StructureTreeNode): number => {
    let total = ownWords(node);
    for (const child of node.children) total += visit(child);
    totals.set(node.id, total);
    return total;
  };
  for (const root of buildStructureTree(nodes)) visit(root);
  return totals;
}

/** Total du manuscrit. */
export function manuscriptWords(nodes: StructureNode[], ownWords: (node: StructureNode) => number): number {
  return nodes.reduce((sum, node) => sum + ownWords(node), 0);
}

/** Avancement vers un objectif, en pour cent (arrondi, peut dépasser 100). */
export function goalPercent(words: number, goal: number | null | undefined): number | null {
  if (!goal || goal <= 0) return null;
  return Math.round((words / goal) * 100);
}

/** Durée de lecture estimée, en minutes (250 mots par minute). */
export function readingMinutes(words: number): number {
  return Math.max(words > 0 ? 1 : 0, Math.round(words / 250));
}

// ----------------------------------------------------------------------------
// État de rédaction
// ----------------------------------------------------------------------------

/** État effectif : « À écrire » quand rien n'est enregistré. */
export const statusOf = (node: Pick<StructureNode, "writingStatus">): WritingStatus => node.writingStatus ?? "todo";

/** Couleurs des états, du gris (à écrire) au vert (corrigé). */
export const STATUS_COLORS: Record<WritingStatus, string> = {
  todo: "#94a3b8",
  draft: "#e3a21a",
  revision: "#e0483d",
  proofread: "#2b7de9",
  corrected: "#1fa37a",
};

// ----------------------------------------------------------------------------
// Narration
// ----------------------------------------------------------------------------

export interface NarrationReport {
  /** Personne la plus fréquente parmi les scènes renseignées. */
  person: NarrativePerson | null;
  /** Temps le plus fréquent parmi les scènes renseignées. */
  tense: NarrativeTense | null;
  /** Scènes dont la personne diffère de la plus fréquente. */
  personChanges: Set<string>;
  /** Scènes dont le temps diffère du plus fréquent. */
  tenseChanges: Set<string>;
}

function mostFrequent<T extends string>(values: Array<T | null>): T | null {
  const counts = new Map<T, number>();
  for (const value of values) if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: T | null = null;
  let max = 0;
  for (const [value, count] of counts) {
    if (count > max) {
      best = value;
      max = count;
    }
  }
  return best;
}

/**
 * Repère les scènes dont la personne ou le temps diffère du choix le plus
 * fréquent du roman : un signal, jamais une correction (un changement peut
 * être voulu).
 */
export function narrationReport(scenes: Array<Pick<StructureNode, "id" | "narrativePerson" | "narrativeTense">>): NarrationReport {
  const person = mostFrequent(scenes.map((s) => s.narrativePerson));
  const tense = mostFrequent(scenes.map((s) => s.narrativeTense));
  return {
    person,
    tense,
    personChanges: new Set(scenes.filter((s) => person && s.narrativePerson && s.narrativePerson !== person).map((s) => s.id)),
    tenseChanges: new Set(scenes.filter((s) => tense && s.narrativeTense && s.narrativeTense !== tense).map((s) => s.id)),
  };
}

// ----------------------------------------------------------------------------
// Noms de fichiers
// ----------------------------------------------------------------------------

/** Nom de fichier sûr à partir d'un titre (« Mon roman — pitch.docx »). */
export function exportFileName(base: string, extension: string): string {
  const clean = base
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${clean || "GANIS"}.${extension}`;
}
