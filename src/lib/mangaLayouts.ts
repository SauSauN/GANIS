import { create } from "zustand";

/*
 * Modèles de page d'un manga : de vraies planches (diagonales, colonnes,
 * fonds perdus, cases incrustées), intégrées à l'application (ni IA, ni
 * réseau) et choisies selon le nombre de cases.
 *
 * Une planche est un arbre de découpes : chaque découpe partage une zone en
 * deux par une droite, et les feuilles sont les cases. Les modèles sont écrits
 * pour une lecture de gauche à droite, puis retournés pour un manga.
 *
 * Le modèle choisi et le sens de lecture sont des préférences locales : ils
 * ne suivent pas le `.ganix`.
 */

export type ReadingDirection = "rtl" | "ltr";

type Point = readonly [x: number, y: number];

/** Dimensions de la page (format 5:7), marge extérieure et espace entre les cases. */
export const PAGE_WIDTH = 100;
export const PAGE_HEIGHT = 140;
const MARGIN = 4;
const GUTTER = 2;

export type PageLayout =
  /** Une case ; `bleed` : elle déborde jusqu'au bord de la page (fond perdu). */
  | { kind: "panel"; bleed: boolean }
  /** Une droite de `from` à `to` : la zone `first` d'un côté, `second` de l'autre. */
  | { kind: "cut"; from: Point; to: Point; side: 1 | -1; first: PageLayout; second: PageLayout }
  /** Une case incrustée par-dessus le contenu de `base`, lue juste après lui. */
  | { kind: "inset"; base: PageLayout; points: Point[] };

/** Une case dans la page, dans l'ordre de lecture. */
export interface PanelShape {
  points: Point[];
  /** Où poser son numéro : dans la partie visible de la case. */
  center: Point;
  /** Case posée par-dessus une autre : à dessiner après les autres. */
  inset: boolean;
}

const P: PageLayout = { kind: "panel", bleed: false };
const B: PageLayout = { kind: "panel", bleed: true };

/** Découpe de gauche à droite (de y1 à y2) : `above` au-dessus, `below` en dessous. */
const H = (y1: number, y2: number, above: PageLayout, below: PageLayout): PageLayout => ({
  kind: "cut",
  from: [0, y1],
  to: [PAGE_WIDTH, y2],
  side: -1,
  first: above,
  second: below,
});

/** Découpe de haut en bas, de (x1, y1) à (x2, y2) : `left` à gauche, `right` à droite. */
const V = (x1: number, y1: number, x2: number, y2: number, left: PageLayout, right: PageLayout): PageLayout => ({
  kind: "cut",
  from: [x1, y1],
  to: [x2, y2],
  side: 1,
  first: left,
  second: right,
});

const inset = (base: PageLayout, ...points: Point[]): PageLayout => ({ kind: "inset", base, points });

/** Modèles proposés pour chaque nombre de cases. */
export const PAGE_LAYOUTS: Record<number, PageLayout[]> = {
  1: [B, P],
  2: [
    H(58, 84, P, P),
    V(64, 0, 38, 140, P, P),
    H(100, 92, B, P),
  ],
  3: [
    H(46, 36, P, V(60, 40, 44, 140, P, P)),
    V(66, 0, 54, 140, H(66, 84, P, P), P),
    H(28, 50, B, H(96, 76, P, P)),
  ],
  4: [
    H(32, 44, P, H(94, 84, V(64, 40, 54, 90, P, P), B)),
    H(52, 42, V(40, 0, 32, 48, P, P), V(72, 46, 58, 140, P, P)),
    H(92, 104, inset(B, [8, 58], [44, 53], [48, 80], [10, 85]), V(52, 96, 40, 140, P, P)),
  ],
  5: [
    H(30, 40, P, H(78, 66, V(44, 34, 56, 74, P, P), V(64, 72, 50, 140, P, P))),
    V(38, 0, 48, 140, H(58, 76, P, P), H(44, 34, P, H(92, 102, P, P))),
    H(54, 40, V(62, 0, 48, 48, P, P), H(98, 90, V(28, 46, 44, 94, P, P), B)),
  ],
  6: [
    H(36, 28, V(62, 0, 54, 32, P, P), H(78, 86, V(32, 30, 44, 82, P, P), V(68, 82, 60, 140, P, P))),
    H(40, 50, B, H(98, 86, V(32, 46, 38, 92, P, V(68, 46, 60, 92, P, P)), V(56, 92, 48, 140, P, P))),
    V(60, 0, 46, 140, H(46, 58, P, H(102, 92, P, P)), H(72, 60, P, inset(P, [60, 108], [93, 103], [96, 130], [62, 134]))),
  ],
  7: [
    H(24, 34, B, H(66, 58, V(60, 30, 50, 62, P, P), H(106, 96, V(34, 60, 42, 100, P, V(68, 60, 60, 100, P, P)), P))),
    H(38, 30, V(52, 0, 42, 34, P, P), H(86, 94, V(34, 32, 42, 90, P, V(68, 32, 60, 90, P, P)), V(48, 90, 58, 140, P, P))),
    V(36, 0, 26, 140, H(74, 60, P, P), H(30, 40, P, H(90, 80, V(64, 36, 56, 84, P, P), V(58, 84, 68, 140, P, P)))),
  ],
  8: [
    H(36, 28, V(36, 0, 44, 32, P, V(70, 0, 62, 32, P, P)), H(80, 88, V(60, 30, 50, 84, P, P), V(40, 84, 32, 140, P, V(72, 84, 64, 140, P, P)))),
    H(30, 38, V(62, 0, 54, 34, P, P), H(68, 60, V(36, 34, 44, 64, P, P), H(104, 96, V(66, 62, 58, 100, P, P), V(40, 100, 48, 140, P, P)))),
    H(46, 36, V(50, 0, 42, 40, P, P), H(92, 84, V(32, 40, 38, 88, P, V(68, 40, 60, 88, P, P)), V(40, 88, 48, 140, P, V(74, 88, 66, 140, P, P)))),
  ],
  9: [
    H(34, 44, V(30, 0, 36, 39, P, V(66, 0, 60, 39, P, P)), H(88, 80, V(38, 41, 30, 84, P, V(70, 41, 62, 84, P, P)), V(32, 84, 38, 140, P, V(68, 84, 62, 140, P, P)))),
    H(26, 36, V(36, 0, 42, 31, P, V(70, 0, 64, 31, P, P)), H(66, 58, V(58, 34, 50, 62, P, P), H(102, 94, V(36, 60, 44, 98, P, P), V(62, 98, 54, 140, P, P)))),
    H(36, 28, V(56, 0, 48, 32, P, P), H(70, 78, V(36, 30, 44, 74, P, P), H(108, 100, V(32, 76, 38, 104, P, V(68, 76, 62, 104, P, P)), V(50, 104, 58, 140, P, P)))),
  ],
  10: [
    H(26, 34, V(30, 0, 36, 30, P, V(66, 0, 60, 30, P, P)), H(62, 54, V(56, 32, 48, 58, P, P), H(100, 106, V(30, 56, 36, 102, P, V(70, 56, 62, 102, P, P)), V(48, 104, 56, 140, P, P)))),
    H(30, 22, V(58, 0, 50, 26, P, P), H(60, 68, V(34, 24, 40, 64, P, V(68, 24, 62, 64, P, P)), H(100, 92, V(44, 66, 52, 96, P, P), V(34, 96, 28, 140, P, V(68, 96, 62, 140, P, P))))),
    H(34, 26, V(34, 0, 40, 30, P, V(68, 0, 62, 30, P, P)), H(68, 76, V(36, 28, 30, 72, P, V(70, 28, 64, 72, P, P)), H(110, 102, V(58, 74, 50, 106, P, P), V(44, 106, 52, 140, P, P)))),
  ],
};

/** Au-delà des modèles : des rangées de trois cases, aux coupes en biais. */
function denseLayout(count: number): PageLayout {
  const rowCount = Math.ceil(count / 3);
  const rowHeight = PAGE_HEIGHT / rowCount;

  const row = (cells: number, top: number, bottom: number, tilt: number): PageLayout => {
    let layout = P;
    for (let cut = cells - 1; cut >= 1; cut--) {
      const x = (cut / cells) * PAGE_WIDTH;
      layout = V(x + tilt, top, x - tilt, bottom, P, layout);
    }
    return layout;
  };

  let layout: PageLayout | null = null;
  for (let index = rowCount - 1; index >= 0; index--) {
    const top = index * rowHeight;
    const cells = index === rowCount - 1 ? count - (rowCount - 1) * 3 : 3;
    const tilt = index % 2 === 0 ? 2 : -2;
    const current = row(cells, top, top + rowHeight, tilt);
    layout = layout ? H(top + rowHeight + tilt, top + rowHeight - tilt, current, layout) : current;
  }
  return layout ?? P;
}

/** Modèles disponibles pour ce nombre de cases (aucun pour une page vide). */
export function layoutsFor(count: number): PageLayout[] {
  if (count <= 0) return [];
  return PAGE_LAYOUTS[count] ?? [denseLayout(count)];
}

/**
 * Garde d'un polygone convexe le côté de la droite demandé, à `offset` de
 * celle-ci (Sutherland-Hodgman, pour un seul bord).
 */
function clip(points: Point[], from: Point, to: Point, side: 1 | -1, offset: number): Point[] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  const distance = ([x, y]: Point) => (side * (dx * (y - from[1]) - dy * (x - from[0]))) / length - offset;

  const kept: Point[] = [];
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const a = distance(point);
    const b = distance(next);
    if (a >= 0) kept.push(point);
    if (a >= 0 !== b >= 0) {
      const t = a / (a - b);
      kept.push([point[0] + (next[0] - point[0]) * t, point[1] + (next[1] - point[1]) * t]);
    }
  });
  return kept;
}

/** Retire la marge de la page d'une case qui ne déborde pas. */
function withinMargins(points: Point[]): Point[] {
  const top: Point = [0, MARGIN];
  const bottom: Point = [0, PAGE_HEIGHT - MARGIN];
  const left: Point = [MARGIN, 0];
  const right: Point = [PAGE_WIDTH - MARGIN, 0];
  let kept = clip(points, top, [PAGE_WIDTH, MARGIN], 1, 0);
  kept = clip(kept, bottom, [PAGE_WIDTH, PAGE_HEIGHT - MARGIN], -1, 0);
  kept = clip(kept, left, [MARGIN, PAGE_HEIGHT], -1, 0);
  return clip(kept, right, [PAGE_WIDTH - MARGIN, PAGE_HEIGHT], 1, 0);
}

function collect(layout: PageLayout, area: Point[], shapes: PanelShape[]) {
  if (layout.kind === "panel") {
    const points = layout.bleed ? area : withinMargins(area);
    shapes.push({ points, center: panelCenter(points), inset: false });
  } else if (layout.kind === "inset") {
    collect(layout.base, area, shapes);
    // La case incrustée recouvre le bas de la précédente : le numéro passe au-dessus.
    const covered = shapes[shapes.length - 1];
    const top = Math.min(...layout.points.map(([, y]) => y));
    covered.center = panelCenter(clip(covered.points, [0, top], [PAGE_WIDTH, top], -1, 0));
    shapes.push({ points: layout.points, center: panelCenter(layout.points), inset: true });
  } else {
    collect(layout.first, clip(area, layout.from, layout.to, layout.side, GUTTER / 2), shapes);
    collect(layout.second, clip(area, layout.from, layout.to, -layout.side as 1 | -1, GUTTER / 2), shapes);
  }
}

/** Cases d'un modèle dans l'ordre de lecture, retournées pour un manga (`rtl`). */
export function panelShapes(layout: PageLayout, direction: ReadingDirection): PanelShape[] {
  const page: Point[] = [[0, 0], [PAGE_WIDTH, 0], [PAGE_WIDTH, PAGE_HEIGHT], [0, PAGE_HEIGHT]];
  const shapes: PanelShape[] = [];
  collect(layout, page, shapes);
  if (direction === "ltr") return shapes;
  return shapes.map((shape) => ({
    ...shape,
    points: shape.points.map(([x, y]) => [PAGE_WIDTH - x, y] as Point),
    center: [PAGE_WIDTH - shape.center[0], shape.center[1]],
  }));
}

/** Centre de gravité d'une case. */
function panelCenter(points: Point[]): Point {
  let area = 0;
  let x = 0;
  let y = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const cross = point[0] * next[1] - next[0] * point[1];
    area += cross;
    x += (point[0] + next[0]) * cross;
    y += (point[1] + next[1]) * cross;
  });
  return [x / (3 * area), y / (3 * area)];
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
