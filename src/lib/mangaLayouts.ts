import { create } from "zustand";

/*
 * Modèles de page d'un manga : la disposition des cases, intégrée à
 * l'application (ni IA, ni réseau), choisie selon le nombre de cases.
 *
 * Le modèle choisi et le sens de lecture sont des préférences locales : ils
 * ne suivent pas le `.ganix`.
 */

/** Une rangée de cases : sa hauteur relative, puis la largeur relative de chaque case. */
type LayoutRow = [height: number, ...widths: number[]];
export type PageLayout = LayoutRow[];

export type ReadingDirection = "rtl" | "ltr";

/** Une case dans la page, en fractions de la page (0 à 1). */
export interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Modèles proposés pour chaque nombre de cases. */
export const PAGE_LAYOUTS: Record<number, PageLayout[]> = {
  1: [[[1, 1]]],
  2: [
    [[1, 1], [1, 1]],
    [[2, 1], [1, 1]],
    [[1, 1, 1]],
  ],
  3: [
    [[1, 1], [1, 1], [1, 1]],
    [[3, 1], [2, 1, 1]],
    [[2, 2, 1], [3, 1]],
  ],
  4: [
    [[1, 1], [1, 1, 1], [1, 1]],
    [[1, 1, 1], [1, 1, 1]],
    [[2, 1], [1, 1, 1, 1]],
  ],
  5: [
    [[1, 1], [1, 2, 1], [1, 1, 2]],
    [[1, 1, 1], [1, 1], [1, 1, 1]],
    [[1, 1, 2], [1, 2, 1], [1, 1]],
  ],
  6: [
    [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
    [[1, 1, 1, 1], [1, 1, 1, 1]],
    [[1, 1], [1, 2, 1], [1, 1, 1, 1]],
  ],
  7: [
    [[1, 2, 1], [1, 1, 1, 1], [1, 1, 2]],
    [[1, 1], [1, 1, 1, 1], [1, 1, 1, 1]],
    [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1]],
  ],
  8: [
    [[1, 1, 1, 1], [1, 1, 1], [1, 1, 1, 1]],
    [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]],
    [[1, 1, 1], [1, 1, 1, 1], [1, 1, 1], [1, 1]],
  ],
  9: [
    [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]],
    [[1, 1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]],
    [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1, 1]],
  ],
  10: [
    [[1, 1, 1, 1], [1, 1, 1], [1, 1, 1, 1], [1, 1, 1]],
    [[1, 1, 1], [1, 1, 1, 1], [1, 1, 1], [1, 1, 1, 1]],
    [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1], [1, 1, 1]],
  ],
};

/** Au-delà des modèles : une grille régulière de trois cases par rangée. */
const GRID_COLUMNS = 3;

function gridLayout(count: number): PageLayout {
  const rows: PageLayout = [];
  for (let left = count; left > 0; left -= GRID_COLUMNS) {
    rows.push([1, ...Array<number>(Math.min(left, GRID_COLUMNS)).fill(1)]);
  }
  return rows;
}

/** Modèles disponibles pour ce nombre de cases (aucun pour une page vide). */
export function layoutsFor(count: number): PageLayout[] {
  if (count <= 0) return [];
  return PAGE_LAYOUTS[count] ?? [gridLayout(count)];
}

/** Espace entre deux cases, et marge de la page, en fraction de la page. */
const GUTTER = 0.02;

/**
 * Cases d'un modèle, dans l'ordre de lecture : les rangées de haut en bas,
 * et dans chaque rangée de droite à gauche pour un manga (`rtl`).
 */
export function panelRects(layout: PageLayout, direction: ReadingDirection): PanelRect[] {
  const totalHeight = layout.reduce((sum, [height]) => sum + height, 0);
  const usableHeight = 1 - GUTTER * (layout.length + 1);
  const rects: PanelRect[] = [];
  let y = GUTTER;

  for (const [rowHeight, ...widths] of layout) {
    const height = (rowHeight / totalHeight) * usableHeight;
    const totalWidth = widths.reduce((sum, width) => sum + width, 0);
    const usableWidth = 1 - GUTTER * (widths.length + 1);
    let x = GUTTER;

    for (const cell of widths) {
      const width = (cell / totalWidth) * usableWidth;
      rects.push({ x: direction === "rtl" ? 1 - x - width : x, y, width, height });
      x += width + GUTTER;
    }
    y += height + GUTTER;
  }

  return rects;
}

// ----------------------------------------------------------------------------
// Préférences locales
// ----------------------------------------------------------------------------

const VARIANTS_KEY = "ganis.pageLayouts";
const directionKey = (projectId: string) => `ganis.flatplan.direction.${projectId}`;

function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Préférence gardée pour cette séance seulement.
  }
}

function storedVariants(): Record<string, number> {
  try {
    const value: unknown = JSON.parse(recall(VARIANTS_KEY) ?? "{}");
    return value && typeof value === "object" ? (value as Record<string, number>) : {};
  } catch {
    return {};
  }
}

interface LayoutPrefsState {
  /** Modèle choisi pour chaque page. */
  variants: Record<string, number>;
  /** Sens de lecture de chaque projet. */
  directions: Record<string, ReadingDirection>;
  setVariant: (pageId: string, variant: number) => void;
  setDirection: (projectId: string, direction: ReadingDirection) => void;
}

export const useLayoutPrefs = create<LayoutPrefsState>((set, get) => ({
  variants: storedVariants(),
  directions: {},
  setVariant: (pageId, variant) => {
    const variants = { ...get().variants, [pageId]: variant };
    set({ variants });
    remember(VARIANTS_KEY, JSON.stringify(variants));
  },
  setDirection: (projectId, direction) => {
    set({ directions: { ...get().directions, [projectId]: direction } });
    remember(directionKey(projectId), direction);
  },
}));

/** Sens de lecture du projet : de droite à gauche, sauf choix contraire. */
export function useReadingDirection(projectId: string): ReadingDirection {
  const chosen = useLayoutPrefs((state) => state.directions[projectId]);
  return chosen ?? (recall(directionKey(projectId)) === "ltr" ? "ltr" : "rtl");
}

/**
 * Numéro du modèle d'une page. Le choix est gardé quand le nombre de cases
 * change : il retombe simplement dans les modèles de ce nombre.
 */
export function layoutVariant(variants: Record<string, number>, pageId: string, available: number): number {
  return available > 0 ? (variants[pageId] ?? 0) % available : 0;
}
