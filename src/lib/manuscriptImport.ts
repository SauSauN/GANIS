import { chapterLevel, countWords, sceneLevel } from "@/lib/novel";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import type { ImportNode } from "@/types";

/*
 * Import d'un manuscrit existant (roman) : lecture du fichier, repérage des
 * titres (parties, chapitres) et des séparateurs de scène, puis plan à
 * créer dans le découpage.
 *
 * Repérage, dans l'ordre :
 * - « Partie 2 », « Première partie », « Livre I », « Part One »… : partie ;
 * - « Chapitre 3 », « CHAPITRE III », « Chapter 12 », un numéro seul
 *   (« 12 », « XII. ») : chapitre ;
 * - « Prologue », « Épilogue », « Interlude », « Préface »… : chapitre hors
 *   numérotation ;
 * - les titres Word (Titre 1, Titre 2…) ou Markdown (#, ##) sans mot clé :
 *   le plus haut niveau utilisé devient partie s'il y en a deux, sinon
 *   chapitre ;
 * - « * * * », « *** », « # », « ⁂ », une ligne horizontale : changement
 *   de scène.
 * L'auteur peut ensuite changer la nature de chaque titre dans l'aperçu.
 */

export type HeadingKind = "part" | "chapter" | "text";

/** Titre repéré, suivi du texte jusqu'au titre suivant. */
export interface ImportSection {
  id: string;
  /** Texte du titre tel qu'il est dans le fichier (vide : texte d'ouverture). */
  heading: string;
  kind: HeadingKind;
  /** Titre gardé (« Chapitre 3 — Le départ » → « Le départ »). */
  title: string;
  numbered: boolean;
  /** Blocs de texte (HTML) ; `null` : séparateur de scène. */
  blocks: Array<string | null>;
}

/** Numéro écrit en chiffres, en chiffres romains ou en toutes lettres. */
const NUM = String.raw`(?:[0-9]{1,3}|[ivxlcdm]{1,7}|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|premier|premi[eè]re|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`;
const ORDINAL = String.raw`(?:premi[eè]re|deuxi[eè]me|seconde|troisi[eè]me|quatri[eè]me|cinqui[eè]me|sixi[eè]me|septi[eè]me|huiti[eè]me|neuvi[eè]me|dixi[eè]me|derni[eè]re|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|final|last)`;
/** Suite possible d'un titre : « — Le départ », « : Les registres », « . ». */
const REST = String.raw`(?:\s*[.:—–-].*)?`;
const PART = new RegExp(String.raw`^(?:(?:partie|part|livre|book|tome|volume)\s+${NUM}|${ORDINAL}\s+(?:partie|part))\b${REST}$`, "i");
const CHAPTER = new RegExp(String.raw`^(?:chapitre|chapter|chap\.)\s*${NUM}\b${REST}$`, "i");
const NUMBER_ONLY = /^(?:[0-9]{1,3}|[IVXLCDM]{1,7})\.?$/;
const UNNUMBERED = new RegExp(String.raw`^(?:prologue|[ée]pilogue|interlude|interm[eè]de|avant-propos|pr[ée]face|postface|introduction|foreword|afterword)\b${REST}$`, "i");
const KEYWORD = new RegExp(String.raw`^(?:${ORDINAL}\s+(?:partie|part)|(?:partie|part|livre|book|tome|volume|chapitre|chapter)\b\.?\s*${NUM}?\b|chap\.\s*${NUM}?)`, "i");
/** Séparateur de scène : symboles seuls, sans lettre ni chiffre. */
const SEPARATOR = /^[\s*#~•·⁂◊§_—–-]{1,24}$/;

/** Longueur maximale d'un titre repéré dans un paragraphe ordinaire. */
const MAX_HEADING_CHARS = 120;

/** Retire le mot clé et le numéro d'un titre : « Chapitre 3 — Le départ » → « Le départ ». */
export function cleanTitle(text: string): string {
  const trimmed = text.trim();
  if (NUMBER_ONLY.test(trimmed)) return "";
  return trimmed.replace(KEYWORD, "").replace(/^[\s.:—–-]+/, "").trim();
}

function classify(text: string, tag: string): { kind: HeadingKind; numbered: boolean; keyword: boolean } | null {
  const plain = text.replace(/\s+/g, " ").trim();
  if (!plain) return null;
  const isHeadingTag = /^h[1-6]$/.test(tag);
  if (!isHeadingTag && plain.length > MAX_HEADING_CHARS) return null;
  if (UNNUMBERED.test(plain)) return { kind: "chapter", numbered: false, keyword: false };
  if (PART.test(plain)) return { kind: "part", numbered: true, keyword: true };
  if (CHAPTER.test(plain) || NUMBER_ONLY.test(plain)) return { kind: "chapter", numbered: true, keyword: true };
  return null;
}

/** Blocs de premier niveau d'un HTML (les conteneurs sans sens sont ouverts). */
function blocksOf(html: string): Element[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const out: Element[] = [];
  const walk = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      if (["DIV", "SECTION", "ARTICLE"].includes(child.tagName)) walk(child);
      else out.push(child);
    }
  };
  walk(doc.body);
  return out;
}

let counter = 0;

/**
 * Découpe un HTML (déjà nettoyé) en sections : chaque titre repéré, avec le
 * texte qui le suit. Le texte placé avant le premier titre forme une section
 * sans titre.
 */
export function splitSections(html: string): ImportSection[] {
  const blocks = blocksOf(html);
  const headingTags = new Set(blocks.map((b) => b.tagName.toLowerCase()).filter((tag) => /^h[1-6]$/.test(tag)));
  const ranks = [...headingTags].sort();
  const sections: ImportSection[] = [];
  let current: ImportSection = { id: `s${++counter}`, heading: "", kind: "chapter", title: "", numbered: false, blocks: [] };

  for (const block of blocks) {
    const tag = block.tagName.toLowerCase();
    const text = (block.textContent ?? "").replace(/ /g, " ").trim();
    if (tag === "hr" || (text && SEPARATOR.test(text) && !/[\p{L}\p{N}]/u.test(text))) {
      current.blocks.push(null);
      continue;
    }
    if (!text && !block.querySelector("img")) continue;

    let found = classify(text, tag);
    if (!found && /^h[1-6]$/.test(tag)) {
      // Titre Word ou Markdown sans mot clé : partie s'il y a un niveau en dessous.
      found = { kind: ranks.length >= 2 && tag === ranks[0] ? "part" : "chapter", numbered: true, keyword: false };
    }
    if (found) {
      sections.push(current);
      current = { id: `s${++counter}`, heading: text, kind: found.kind, title: found.keyword ? cleanTitle(text) : text, numbered: found.numbered, blocks: [] };
      continue;
    }
    current.blocks.push(tag === "p" || /^h[1-6]$/.test(tag) ? `<p>${block.innerHTML}</p>` : block.outerHTML);
  }
  sections.push(current);
  // La section d'ouverture n'est gardée que si elle a du texte.
  return sections.filter((s, index) => index > 0 || s.blocks.some((b) => b !== null));
}

/** Mots du texte d'une section. */
export function sectionWords(section: ImportSection): number {
  return section.blocks.reduce((sum, block) => sum + (block ? countWords(block) : 0), 0);
}

/** Scènes d'une section : texte coupé aux séparateurs (ou d'un seul tenant). */
export function scenesOf(blocks: Array<string | null>, split: boolean): string[] {
  const scenes: string[] = [];
  let current: string[] = [];
  for (const block of blocks) {
    if (block === null) {
      if (split) {
        if (current.length) scenes.push(current.join(""));
        current = [];
      }
      continue;
    }
    current.push(block);
  }
  if (current.length) scenes.push(current.join(""));
  return scenes.filter((scene) => countWords(scene) > 0);
}

/**
 * Plan à créer. `levelCount` : niveaux du découpage (3 pour un roman :
 * partie, chapitre, scène). Un titre classé « texte » rejoint le texte qui
 * le précède ; du texte sans chapitre (avant le premier, ou juste après une
 * partie) va dans un chapitre hors numérotation nommé `openingTitle`.
 */
export function buildPlan(sections: ImportSection[], levelCount: number, split: boolean, openingTitle: string): ImportNode[] {
  const scene = sceneLevel(levelCount);
  const chapter = chapterLevel(levelCount);
  const part = levelCount >= 3 ? 0 : null;

  // Les titres « texte » sont rendus au texte de la section précédente.
  const merged: ImportSection[] = [];
  for (const section of sections) {
    const previous = merged[merged.length - 1];
    if (section.kind === "text" && previous) {
      previous.blocks = [...previous.blocks, `<p>${escape(section.heading)}</p>`, ...section.blocks];
    } else {
      merged.push({ ...section, blocks: [...section.blocks], kind: section.kind === "text" ? "chapter" : section.kind });
    }
  }

  const roots: ImportNode[] = [];
  let currentPart: ImportNode | null = null;
  let currentChapter: ImportNode | null = null;
  const node = (level: number, title: string, numbered: boolean): ImportNode => ({ level, title, numbered, content: "", children: [] });
  const place = (item: ImportNode) => (currentPart && item.level > currentPart.level ? currentPart.children : roots).push(item);
  const addScenes = (target: ImportNode, blocks: Array<string | null>) => {
    for (const html of scenesOf(blocks, split)) {
      if (scene === target.level) target.content += html;
      else target.children.push({ ...node(scene, "", true), content: html });
    }
  };

  for (const section of merged) {
    if (section.kind === "part" && part !== null) {
      currentPart = node(part, section.title, section.numbered);
      roots.push(currentPart);
      currentChapter = null;
      if (scenesOf(section.blocks, split).length) {
        currentChapter = node(chapter, openingTitle, false);
        currentPart.children.push(currentChapter);
        addScenes(currentChapter, section.blocks);
      }
      continue;
    }
    const isOpening = !section.heading;
    currentChapter = node(chapter, isOpening ? openingTitle : section.title, isOpening ? false : section.numbered);
    place(currentChapter);
    addScenes(currentChapter, section.blocks);
  }
  return roots;
}

function escape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Nombre d'éléments de chaque niveau d'un plan. */
export function planCounts(plan: ImportNode[]): Map<number, number> {
  const counts = new Map<number, number>();
  const walk = (list: ImportNode[]) =>
    list.forEach((item) => {
      counts.set(item.level, (counts.get(item.level) ?? 0) + 1);
      walk(item.children);
    });
  walk(plan);
  return counts;
}

// ----------------------------------------------------------------------------
// Lecture du fichier
// ----------------------------------------------------------------------------

const htmlEscape = escape;

/** Markdown → HTML pour l'import : les titres (#) restent des titres. */
export function markdownForImport(markdown: string): string {
  const inline = (line: string) =>
    htmlEscape(line)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>")
      .replace(/(^|\W)_(?!\s)(.+?)_(?=\W|$)/g, "$1<em>$2</em>");
  const out: string[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(inline).join("<br>")}</p>`);
    paragraph = [];
  };
  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!line) flush();
    else if (heading) {
      flush();
      out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    } else if (/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(line)) {
      flush();
      out.push("<hr>");
    } else paragraph.push(line.replace(/^>\s?/, ""));
  }
  flush();
  return out.join("");
}

/** Texte brut → HTML pour l'import : une ligne = un paragraphe. */
export function textForImport(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${htmlEscape(line)}</p>`)
    .join("");
}

/** Extensions acceptées. */
export const IMPORT_EXTENSIONS = [".docx", ".md", ".markdown", ".txt"];

/** Lit un fichier choisi par l'auteur et renvoie son texte en HTML nettoyé. */
export async function readManuscriptFile(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    return sanitizeHtml(result.value);
  }
  const text = await file.text();
  return extension === "md" || extension === "markdown" ? markdownForImport(text) : textForImport(text);
}
