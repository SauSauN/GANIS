import type { NoteFolder, NoteSummary, StickyColor } from "@/types";

/*
 * Notes du projet : onglets, arborescence des dossiers, post-it.
 *
 * Le contenu d'une note est le document de l'éditeur en JSON (jamais du
 * HTML) : il est relu par l'éditeur, qui ne garde que les éléments de son
 * schéma. Rust vérifie seulement que c'est un objet JSON de taille limitée.
 */

// ----------------------------------------------------------------------------
// Onglets
// ----------------------------------------------------------------------------

/** Préfixe de l'onglet d'une note : `note:<id>`. */
export const NOTE_TAB_PREFIX = "note:";

export function noteTabId(noteId: string): string {
  return `${NOTE_TAB_PREFIX}${noteId}`;
}

/** Identifiant de la note d'un onglet (sinon `null`). */
export function noteIdOfTab(tabId: string): string | null {
  return tabId.startsWith(NOTE_TAB_PREFIX) ? tabId.slice(NOTE_TAB_PREFIX.length) || null : null;
}

// ----------------------------------------------------------------------------
// Limites (les mêmes que `note_service.rs`)
// ----------------------------------------------------------------------------

export const MAX_FOLDER_NAME = 100;
export const MAX_NOTE_TITLE = 200;
export const MAX_EXCERPT = 300;
export const MAX_STICKY_TEXT = 2000;
export const STICKY_MIN_WIDTH = 120;
export const STICKY_MIN_HEIGHT = 100;
export const STICKY_MAX_SIZE = 2000;

// ----------------------------------------------------------------------------
// Arborescence
// ----------------------------------------------------------------------------

export interface FolderNode {
  folder: NoteFolder;
  depth: number;
  children: FolderNode[];
}

const byName = (a: NoteFolder, b: NoteFolder) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) ||
  a.createdAt.localeCompare(b.createdAt);

/**
 * Dossiers en arbre, triés par nom. Un dossier dont le parent n'existe plus
 * (ou pris dans une boucle, ce que Rust empêche) est rattaché à la racine.
 */
export function buildFolderTree(folders: NoteFolder[]): FolderNode[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const children = new Map<string | null, NoteFolder[]>();

  for (const folder of folders) {
    const parent = folder.parentId && byId.has(folder.parentId) ? folder.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), folder]);
  }

  const placed = new Set<string>();

  function build(parent: string | null, depth: number): FolderNode[] {
    return (children.get(parent) ?? [])
      .filter((folder) => !placed.has(folder.id))
      .sort(byName)
      .map((folder) => {
        placed.add(folder.id);
        return { folder, depth, children: build(folder.id, depth + 1) };
      });
  }

  const roots = build(null, 0);

  for (const folder of [...folders].sort(byName)) {
    if (!placed.has(folder.id)) {
      placed.add(folder.id);
      roots.push({ folder, depth: 0, children: build(folder.id, 1) });
    }
  }

  return roots;
}

/** Identifiants d'un dossier et de tous ses sous-dossiers. */
export function folderAndDescendants(folders: NoteFolder[], id: string): Set<string> {
  const result = new Set<string>([id]);
  let grew = true;

  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentId && result.has(folder.parentId) && !result.has(folder.id)) {
        result.add(folder.id);
        grew = true;
      }
    }
  }

  return result;
}

/** Chemin d'un dossier (« Recherches / Époque »), du plus haut au plus proche. */
export function folderPath(folders: NoteFolder[], id: string | null): NoteFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: NoteFolder[] = [];
  const seen = new Set<string>();
  let current = id;

  while (current && !seen.has(current)) {
    const folder = byId.get(current);
    if (!folder) break;
    seen.add(current);
    path.unshift(folder);
    current = folder.parentId;
  }

  return path;
}

/** Notes d'un dossier (`null` : racine) : épinglées d'abord, puis par titre. */
export function notesIn(notes: NoteSummary[], folderId: string | null, untitled: string): NoteSummary[] {
  return notes
    .filter((note) => (note.folderId ?? null) === folderId)
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        (a.title || untitled).localeCompare(b.title || untitled, undefined, {
          sensitivity: "base",
          numeric: true,
        }),
    );
}

/** Recherche sans tenir compte de la casse ni des accents. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function matchesNote(note: NoteSummary, query: string): boolean {
  const q = normalizeSearch(query);
  return !q || normalizeSearch(`${note.title} ${note.excerpt}`).includes(q);
}

/** Extrait enregistré avec la note : texte brut, espaces réduits, 300 caractères. */
export function makeExcerpt(text: string): string {
  return Array.from(text.replace(/\s+/g, " ").trim()).slice(0, MAX_EXCERPT).join("");
}

/**
 * Document JSON enregistré → contenu de l'éditeur. Un contenu vide ou
 * illisible donne une note vide plutôt qu'une erreur.
 */
export function parseNoteContent(content: string): Record<string, unknown> | null {
  if (!content.trim()) return null;

  try {
    const value: unknown = JSON.parse(content);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Couleurs (post-it du mur et encadrés « post-it » dans une note)
// ----------------------------------------------------------------------------

export const STICKY_COLORS: StickyColor[] = ["yellow", "pink", "green", "blue", "purple", "orange"];

export function isStickyColor(value: unknown): value is StickyColor {
  return STICKY_COLORS.includes(value as StickyColor);
}

/** Fond, bordure et pastille de chaque couleur (lisibles en thème clair et sombre). */
export const STICKY_STYLES: Record<StickyColor, { paper: string; border: string; swatch: string }> = {
  yellow: { paper: "#fef3a3", border: "#e8d56a", swatch: "#facc15" },
  pink: { paper: "#fbd3e4", border: "#eba8c5", swatch: "#ec4899" },
  green: { paper: "#ccefc9", border: "#9ed69a", swatch: "#22c55e" },
  blue: { paper: "#cfe6fb", border: "#9cc8ef", swatch: "#3b82f6" },
  purple: { paper: "#e3d6fb", border: "#c2aaf0", swatch: "#a855f7" },
  orange: { paper: "#fddcbf", border: "#f2b98a", swatch: "#f97316" },
};

// ----------------------------------------------------------------------------
// Typographie
// ----------------------------------------------------------------------------

/**
 * Polices proposées : polices installées avec le système (aucun
 * téléchargement, l'application reste hors ligne). Chaque valeur prévoit
 * des polices de secours si la première manque.
 */
export const NOTE_FONTS: Array<{ id: string; label: string; value: string }> = [
  { id: "sans", label: "Sans serif", value: "Geist Variable, Segoe UI, Arial, sans-serif" },
  { id: "serif", label: "Serif", value: "Georgia, Cambria, Times New Roman, serif" },
  { id: "times", label: "Times New Roman", value: "Times New Roman, Times, serif" },
  { id: "garamond", label: "Garamond", value: "Garamond, EB Garamond, Georgia, serif" },
  { id: "palatino", label: "Palatino", value: "Palatino Linotype, Palatino, Book Antiqua, serif" },
  { id: "arial", label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { id: "verdana", label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { id: "trebuchet", label: "Trebuchet MS", value: "Trebuchet MS, Segoe UI, sans-serif" },
  { id: "comic", label: "Comic Sans MS", value: "Comic Sans MS, Comic Neue, cursive" },
  { id: "mono", label: "Monospace", value: "Consolas, Courier New, monospace" },
];

export const NOTE_FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48];

/** Couleurs du texte et du surlignage proposées dans la barre d'outils. */
export const TEXT_COLORS = [
  "#111827", "#6b7280", "#dc2626", "#ea580c", "#ca8a04",
  "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#db2777",
];

export const HIGHLIGHT_COLORS = [
  "#fef08a", "#bbf7d0", "#bae6fd", "#ddd6fe", "#fbcfe8", "#fed7aa",
];
