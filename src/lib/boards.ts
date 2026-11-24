/*
 * Planche d'inspiration : une surface libre où l'auteur dispose des images
 * de la galerie du projet (désignées par leur identifiant, jamais copiées),
 * des palettes de couleurs, des citations, des notes et des titres.
 *
 * Ce n'est pas la galerie (qui range les images en dossiers) : c'est une
 * mise en scène de l'ambiance, d'un personnage, d'un lieu ou du récit.
 *
 * Fonctions pures (testées) ; l'enregistrement est dans `stores/boardStore.ts`.
 */

/** Onglet d'une planche : `board:<id>`. */
export const BOARD_TAB_PREFIX = "board:";

export function boardTabId(boardId: string): string {
  return `${BOARD_TAB_PREFIX}${boardId}`;
}

/** Identifiant de la planche d'un onglet (sinon `null`). */
export function boardIdOfTab(tabId: string | null | undefined): string | null {
  return tabId?.startsWith(BOARD_TAB_PREFIX) ? tabId.slice(BOARD_TAB_PREFIX.length) || null : null;
}

export type BoardItemKind = "image" | "palette" | "quote" | "note" | "label";
export const BOARD_ITEM_KINDS: BoardItemKind[] = ["image", "palette", "quote", "note", "label"];

/** Taille de la surface (px). */
export const BOARD_WIDTH = 2400;
export const BOARD_HEIGHT = 1600;

export const MIN_ITEM_WIDTH = 80;
export const MAX_ITEM_WIDTH = 640;
const MAX_ITEMS = 300;
const MAX_TEXT = 2000;
/** Couleurs d'une palette, au plus. */
export const MAX_COLORS = 4;

const COLOR = /^#[0-9a-f]{6}$/i;

/** Palette d'une nouvelle planche : cendre et braise. */
const DEFAULT_COLORS = ["#2b2d3a", "#a7a9b4", "#e07a3f", "#f2c14e"];

export interface BoardItem {
  id: string;
  kind: BoardItemKind;
  x: number;
  y: number;
  /** Largeur (px) ; la hauteur suit le contenu. */
  w: number;
  /** Ordre d'empilement : le plus grand est devant. */
  z: number;
  /** Légère inclinaison, en degrés (-6 à 6). */
  rot: number;
  /** Image de la galerie du projet. */
  imageId: string | null;
  /** Légende (image, palette), texte (citation, note, titre). */
  text: string;
  /** Source d'une citation. */
  by: string;
  colors: string[];
}

/** Sortes d'éléments du projet auxquels une planche peut être liée. */
export type BoardLinkKind = "character" | "location" | "item" | "species" | "faction" | "people" | "magic" | "node" | "note";
export const BOARD_LINK_KINDS: BoardLinkKind[] = ["character", "location", "item", "species", "faction", "people", "magic", "node", "note"];
export const MAX_BOARD_LINKS = 50;

/** Élément du projet lié à la planche (un élément supprimé depuis est ignoré). */
export interface BoardLink {
  kind: BoardLinkKind;
  id: string;
}

export interface BoardData {
  version: 1;
  items: BoardItem[];
  links: BoardLink[];
}

/** Liens lus d'un document : sortes connues, sans doublon, 50 au plus. */
function linksOf(value: unknown): BoardLink[] {
  const seen = new Set<string>();
  const out: BoardLink[] = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const link = (raw ?? {}) as Record<string, unknown>;
    if (!BOARD_LINK_KINDS.includes(link.kind as BoardLinkKind) || typeof link.id !== "string" || !link.id) continue;
    const key = `${link.kind}:${link.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: link.kind as BoardLinkKind, id: link.id });
    if (out.length >= MAX_BOARD_LINKS) break;
  }
  return out;
}

/** La planche est-elle liée à cet élément ? */
export function boardLinksTo(data: BoardData, kind: BoardLinkKind, id: string): boolean {
  return data.links.some((link) => link.kind === kind && link.id === id);
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const num = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const str = (value: unknown, max = MAX_TEXT) => (typeof value === "string" ? value.slice(0, max) : "");

export function newBoardId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

/** Largeur par défaut d'un élément selon sa sorte. */
export function defaultWidth(kind: BoardItemKind): number {
  return { image: 240, palette: 250, quote: 260, note: 210, label: 200 }[kind];
}

/** Planche lisible et cohérente à partir de n'importe quel JSON enregistré. */
export function normalizeBoard(raw: unknown): BoardData {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const items: BoardItem[] = [];
  for (const value of Array.isArray(o.items) ? o.items : []) {
    const it = (value ?? {}) as Record<string, unknown>;
    if (!BOARD_ITEM_KINDS.includes(it.kind as BoardItemKind)) continue;
    const kind = it.kind as BoardItemKind;
    const imageId = typeof it.imageId === "string" && it.imageId ? it.imageId : null;
    if (kind === "image" && !imageId) continue;
    let id = typeof it.id === "string" && it.id ? it.id : newBoardId();
    if (seen.has(id)) id = newBoardId();
    seen.add(id);
    const colors = (Array.isArray(it.colors) ? it.colors : []).filter((c): c is string => typeof c === "string" && COLOR.test(c)).slice(0, MAX_COLORS);
    items.push({
      id,
      kind,
      x: Math.round(clamp(num(it.x, 40), 0, BOARD_WIDTH - MIN_ITEM_WIDTH)),
      y: Math.round(clamp(num(it.y, 40), 0, BOARD_HEIGHT - 40)),
      w: Math.round(clamp(num(it.w, defaultWidth(kind)), MIN_ITEM_WIDTH, MAX_ITEM_WIDTH)),
      z: Math.round(clamp(num(it.z, 0), 0, 1_000_000)),
      rot: Math.round(clamp(num(it.rot, 0), -6, 6) * 10) / 10,
      imageId: kind === "image" ? imageId : null,
      text: str(it.text),
      by: kind === "quote" ? str(it.by, 200) : "",
      colors: kind === "palette" ? (colors.length ? colors : [...DEFAULT_COLORS]) : [],
    });
    if (items.length >= MAX_ITEMS) break;
  }
  return { version: 1, items, links: linksOf(o.links) };
}

/** Plus grand ordre d'empilement (0 pour une planche vide). */
export function topZ(data: BoardData): number {
  return data.items.reduce((max, item) => Math.max(max, item.z), 0);
}

/**
 * Place libre pour un nouvel élément : en cascade depuis le coin haut
 * gauche de la partie visible, décalée tant qu'un élément occupe déjà
 * exactement cette place.
 */
export function freeSpot(data: BoardData, origin: { x: number; y: number }): { x: number; y: number } {
  let x = Math.round(origin.x + 40);
  let y = Math.round(origin.y + 40);
  for (let i = 0; i < 50 && data.items.some((item) => Math.abs(item.x - x) < 8 && Math.abs(item.y - y) < 8); i++) {
    x += 28;
    y += 28;
  }
  return { x: clamp(x, 0, BOARD_WIDTH - MIN_ITEM_WIDTH), y: clamp(y, 0, BOARD_HEIGHT - 40) };
}

/** Nouvel élément, devant les autres. */
export function newItem(data: BoardData, kind: BoardItemKind, at: { x: number; y: number }, fields: Partial<BoardItem> = {}): BoardItem {
  return {
    id: newBoardId(),
    kind,
    ...freeSpot(data, at),
    w: defaultWidth(kind),
    z: topZ(data) + 1,
    rot: kind === "image" || kind === "note" ? Math.round((Math.random() * 4 - 2) * 10) / 10 : 0,
    imageId: null,
    text: "",
    by: "",
    colors: kind === "palette" ? [...DEFAULT_COLORS] : [],
    ...fields,
  };
}
