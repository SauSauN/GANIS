/*
 * Géométrie du plateau de la trame : tailles (selon le zoom), position
 * des cartes, tracé des liens, courbe de tension.
 */

export const BASE = { lane: 236, node: 170, nodeHeight: 86, row: 116, tension: 120 };
export const GUTTER = 64;
export const HEAD = 54;
/** Largeur de la colonne de tension (fixe, collée à gauche). */
export const TENSION_W = 76;
export const ZOOM_MIN = 0.35;
export const ZOOM_MAX = 1.6;

export interface Metrics {
  zoom: number;
  lane: number;
  node: number;
  nodeHeight: number;
  row: number;
  tension: number;
  /**
   * Lignes de passé narratif affichées au-dessus du début de l'histoire :
   * le moment `row` est dessiné à la ligne `row + past` depuis le haut.
   */
  past: number;
}

export function metrics(zoom: number, past = 0): Metrics {
  return {
    zoom,
    past,
    lane: Math.round(BASE.lane * zoom),
    node: Math.round(BASE.node * zoom),
    nodeHeight: Math.round(BASE.nodeHeight * zoom),
    row: Math.round(BASE.row * zoom),
    tension: Math.max(84, Math.round(BASE.tension * zoom)),
  };
}

export const clampZoom = (zoom: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100));

/** Haut de la ligne d'un moment (le passé est au-dessus du moment 0). */
export function rowTop(m: Metrics, row: number) {
  return (row + m.past) * m.row;
}

/** Moment sous une ordonnée du plateau ; `total` : lignes affichées (passé compris). */
export function rowAt(m: Metrics, y: number, total: number) {
  return Math.min(total - 1, Math.max(0, Math.floor(y / m.row))) - m.past;
}

/** Centre d'une case. */
export function cellCenter(m: Metrics, column: number, row: number) {
  return { cx: column * m.lane + m.lane / 2, cy: rowTop(m, row) + m.row / 2 };
}

/** Coin haut-gauche d'une carte dans sa case. */
export function cardOrigin(m: Metrics, column: number, row: number) {
  return { left: column * m.lane + (m.lane - m.node) / 2, top: rowTop(m, row) + (m.row - m.nodeHeight) / 2 };
}

/** Case sous un point du plateau ; `total` : lignes affichées (passé compris). */
export function slotAt(m: Metrics, x: number, y: number, columns: number, total: number) {
  return {
    column: Math.min(columns - 1, Math.max(0, Math.floor(x / m.lane))),
    row: rowAt(m, y, total),
  };
}

export interface LinkPath {
  d: string;
  /** Milieu, pour l'étiquette. */
  mx: number;
  my: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  sameColumn: boolean;
}

/** Courbe d'un lien entre deux centres de carte. */
export function linkPath(m: Metrics, a: { cx: number; cy: number; column: number }, b: { cx: number; cy: number; column: number }): LinkPath {
  if (a.column === b.column) {
    const x = a.cx + m.node / 2;
    const off = Math.max(18, 30 * m.zoom);
    return {
      d: `M${x},${a.cy} C${x + off},${a.cy} ${x + off},${b.cy} ${x},${b.cy}`,
      mx: x + off * 0.75 + 4,
      my: (a.cy + b.cy) / 2,
      x1: x,
      y1: a.cy,
      x2: x,
      y2: b.cy,
      sameColumn: true,
    };
  }
  const dir = b.cx > a.cx ? 1 : -1;
  const x1 = a.cx + (dir * m.node) / 2;
  const x2 = b.cx - (dir * m.node) / 2;
  const dx = Math.abs(x2 - x1) * 0.5;
  return {
    d: `M${x1},${a.cy} C${x1 + dir * dx},${a.cy} ${x2 - dir * dx},${b.cy} ${x2},${b.cy}`,
    mx: (x1 + x2) / 2,
    my: (a.cy + b.cy) / 2,
    x1,
    y1: a.cy,
    x2,
    y2: b.cy,
    sameColumn: false,
  };
}

const f1 = (n: number) => Math.round(n * 10) / 10;

/** Courbe lissée passant par des points (tension). */
export function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return "";
  let d = `M${f1(points[0].x)},${f1(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const t = 0.17;
    d += ` C${f1(p1.x + (p2.x - p0.x) * t)},${f1(p1.y + (p2.y - p0.y) * t)} ${f1(p2.x - (p3.x - p1.x) * t)},${f1(p2.y - (p3.y - p1.y) * t)} ${f1(p2.x)},${f1(p2.y)}`;
  }
  return d;
}