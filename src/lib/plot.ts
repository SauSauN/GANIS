/*
 * Trame du projet : plateau vertical des intrigues parallèles.
 *
 * - une colonne par trame (intrigue principale, intrigues parallèles,
 *   trame d'un personnage, passé…) ;
 * - une ligne par moment de l'histoire, le temps s'écoule vers le bas ;
 *   le moment 0 est le début de l'histoire principale, les moments
 *   négatifs forment le passé narratif (flash-back, souvenirs, événements
 *   antérieurs), affiché au-dessus du début ;
 * - des événements dans les cases, reliés par des liens de cause à effet
 *   (impact, influence, croisement) ;
 * - des actes, une courbe de tension, un ordre de lecture, des questions
 *   à régler, des mystères et leurs indices.
 *
 * Les événements sont reliés aux autres tables du projet : personnages
 * présents et point de vue, lieu, élément du découpage (chapitre, scène…),
 * notes. Ces liens sont des identifiants : un élément supprimé est ignoré
 * tant qu'il n'existe pas (il revient s'il est restauré depuis la corbeille).
 *
 * Ce fichier ne contient que des fonctions pures (testées) ; l'état et
 * l'enregistrement sont dans `stores/plotStore.ts`.
 */

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type PlotStatus = "idea" | "draft" | "written" | "revised";
export type PlotLinkKind = "impact" | "influence" | "meeting";
export type MysteryStatus = "open" | "solved" | "dropped";

export interface PlotLane {
  id: string;
  name: string;
  /** « #rrggbb » ; se change dans Paramètres du projet › Trame. */
  color: string;
  main: boolean;
  hidden: boolean;
  /** Trame qui suit un personnage du projet (facultatif). */
  characterId: string | null;
}

export interface PlotEvent {
  id: string;
  laneId: string;
  /**
   * Moment, la ligne du plateau : 0 = début de l'histoire principale,
   * 1, 2… la suite ; -1, -2… le passé narratif (-1 juste avant le début).
   */
  row: number;
  title: string;
  /** Ce qui se passe. */
  note: string;
  pivot: boolean;
  status: PlotStatus;
  /** Étiquettes libres (thèmes, « flash-back »…). */
  tags: string[];
  /** Personnages présents (fiches du projet). */
  characterIds: string[];
  /** Point de vue (personnage du projet). */
  povId: string | null;
  locationId: string | null;
  /** Élément du découpage où l'événement est raconté (chapitre, scène…) : il fixe sa place dans la lecture. */
  nodeId: string | null;
  /** Autres scènes où l'événement est raconté à nouveau (souvenir, autre point de vue…). */
  alsoNodeIds: string[];
  noteIds: string[];
  /** Date dans l'histoire (libre), pour la chronologie. */
  date: string;
  words: number;
}

export interface PlotLink {
  id: string;
  from: string;
  to: string;
  kind: PlotLinkKind;
  label: string;
  /** Conséquence sur la trame visée. */
  note: string;
}

export interface PlotQuestion {
  id: string;
  text: string;
  done: boolean;
  eventId: string | null;
}

export interface PlotMystery {
  id: string;
  question: string;
  status: MysteryStatus;
  answer: string;
  /** Comment et quand la réponse est révélée. */
  payoff: string;
  /** Événement de la révélation. */
  payoffEventId: string | null;
}

export interface PlotClue {
  id: string;
  text: string;
  /** Événement où l'indice est planté. */
  eventId: string | null;
  mysteryId: string | null;
}

export interface PlotData {
  version: 1;
  lanes: PlotLane[];
  events: PlotEvent[];
  links: PlotLink[];
  /** Étiquette d'un moment (« Chapitre 3, lundi soir »). */
  rowLabels: Record<number, string>;
  /** Un acte commence à ce moment. */
  acts: Record<number, string>;
  /** Tension de 0 (calme) à 10 (à bout de souffle). */
  tension: Record<number, number>;
  /** Ordre de lecture choisi à la main (les événements absents suivent l'ordre du plan). */
  readingOrder: string[];
  /** Vrai : l'ordre de lecture suit le découpage du projet. */
  readingFollowsStructure: boolean;
  questions: PlotQuestion[];
  mysteries: PlotMystery[];
  clues: PlotClue[];
  /** Objectif de mots (0 : aucun). */
  goal: number;
  /** Modèles de structure créés par l'auteur. */
  templates: PlotCustomTemplate[];
  /** Ordre des événements à l'intérieur d'un élément du découpage (élément → événements). */
  sceneOrder: Record<string, string[]>;
}

/** Modèle de structure de l'auteur : ses étapes, réparties du début à la fin. */
export interface PlotCustomTemplate {
  id: string;
  name: string;
  steps: string[];
}

// ----------------------------------------------------------------------------
// Constantes
// ----------------------------------------------------------------------------

/** Couleurs des trames, attribuées à la création (modifiables dans les paramètres). */
export const PLOT_PALETTE = ["#e0483d", "#2b7de9", "#e3a21a", "#1fa37a", "#8e5bd6", "#e2599c", "#0fa3b8", "#7a8a99"];

export const STATUS_ORDER: PlotStatus[] = ["idea", "draft", "written", "revised"];
export const STATUS_COLORS: Record<PlotStatus, string> = {
  idea: "#8a97a5",
  draft: "#e3a21a",
  written: "#1fa37a",
  revised: "#2b7de9",
};

export const LINK_KINDS: PlotLinkKind[] = ["impact", "influence", "meeting"];
export const MYSTERY_STATUSES: MysteryStatus[] = ["open", "solved", "dropped"];

/** Modèles de structure : place relative de chaque étape (0 = début, 1 = fin). */
export const PLOT_TEMPLATES: Array<{ id: string; beats: number[] }> = [
  { id: "three", beats: [0, 0.25, 0.5, 0.75, 0.9] },
  { id: "hero", beats: [0, 0.08, 0.15, 0.22, 0.3, 0.4, 0.5, 0.58, 0.66, 0.78, 0.88, 0.96] },
  { id: "stc", beats: [0, 0.05, 0.12, 0.22, 0.28, 0.35, 0.5, 0.62, 0.75, 0.85] },
  { id: "circle", beats: [0, 0.12, 0.25, 0.4, 0.55, 0.68, 0.82, 0.94] },
  { id: "five", beats: [0, 0.2, 0.5, 0.7, 0.9] },
  { id: "seven", beats: [0, 0.15, 0.3, 0.5, 0.65, 0.8, 0.95] },
  { id: "kishotenketsu", beats: [0, 0.25, 0.5, 0.75] },
  { id: "fichtean", beats: [0, 0.2, 0.4, 0.6, 0.8, 0.92] },
  { id: "spine", beats: [0, 0.1, 0.2, 0.35, 0.55, 0.8, 0.95] },
  { id: "mystery", beats: [0, 0.1, 0.3, 0.5, 0.7, 0.88, 0.97] },
  { id: "romance", beats: [0, 0.1, 0.25, 0.5, 0.6, 0.75, 0.88, 0.97] },
];

/** Moments possibles : du passé le plus lointain au dernier moment. */
export const MIN_ROW = -9_999;
export const MAX_ROW = 9_999;

/** Lignes de passé toujours proposées au-dessus du début de l'histoire. */
export const PAST_MIN_ROWS = 4;

const MAX_TEXT = 20_000;
const MAX_TITLE = 200;
const COLOR = /^#[0-9a-f]{6}$/i;

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// ----------------------------------------------------------------------------
// Création et lecture
// ----------------------------------------------------------------------------

/** Trame vide : une seule trame, principale. */
export function blankPlot(mainName: string): PlotData {
  return {
    version: 1,
    lanes: [{ id: newId(), name: mainName, color: PLOT_PALETTE[0], main: true, hidden: false, characterId: null }],
    events: [],
    links: [],
    rowLabels: {},
    acts: {},
    tension: {},
    readingOrder: [],
    readingFollowsStructure: true,
    questions: [],
    mysteries: [],
    clues: [],
    goal: 0,
    templates: [],
    sceneOrder: {},
  };
}

const str = (value: unknown, max = MAX_TEXT) => (typeof value === "string" ? value.slice(0, max) : "");
const idOrNull = (value: unknown) => (typeof value === "string" && value ? value : null);
const ids = (value: unknown) =>
  Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string" && v.length > 0))] : [];

/** Étiquettes : sans doublon (accents et majuscules ignorés), sans vide. */
export function cleanTags(values: unknown): string[] {
  const list = Array.isArray(values) ? values : typeof values === "string" ? values.split(",") : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of list) {
    if (typeof value !== "string") continue;
    const tag = value.trim().slice(0, 60);
    const key = fold(tag);
    if (tag && !seen.has(key)) {
      seen.add(key);
      out.push(tag);
    }
  }
  return out;
}

function dict<T>(value: unknown, read: (v: unknown) => T | undefined): Record<number, T> {
  const out: Record<number, T> = {};
  if (value && typeof value === "object") {
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const row = Number.parseInt(key, 10);
      const v = read(raw);
      if (Number.isFinite(row) && row >= MIN_ROW && row <= MAX_ROW && v !== undefined) out[row] = v;
    }
  }
  return out;
}

/**
 * Trame lisible et cohérente à partir de n'importe quel JSON (document
 * enregistré, version restaurée…). Un document vide donne une trame vide.
 */
export function normalizePlot(raw: unknown, mainName: string): PlotData {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // Jamais enregistrée : une trame principale pour commencer. Une liste vide
  // enregistrée est respectée (l'auteur a supprimé toutes les trames).
  if (!Array.isArray(o.lanes)) return { ...blankPlot(mainName), ...keepExtras(o) };
  const rawLanes: unknown[] = o.lanes;

  const seenLanes = new Set<string>();
  const lanes: PlotLane[] = [];
  rawLanes.forEach((value, index) => {
    const l = (value ?? {}) as Record<string, unknown>;
    let id = idOrNull(l.id) ?? newId();
    if (seenLanes.has(id)) id = newId();
    seenLanes.add(id);
    lanes.push({
      id,
      name: str(l.name, 80) || mainName,
      color: typeof l.color === "string" && COLOR.test(l.color) ? l.color : PLOT_PALETTE[index % PLOT_PALETTE.length],
      main: l.main === true,
      hidden: l.hidden === true,
      characterId: idOrNull(l.characterId),
    });
  });
  // Une seule trame principale, au moins une trame visible.
  let found = false;
  for (const lane of lanes) {
    if (lane.main && found) lane.main = false;
    if (lane.main) found = true;
  }
  if (!found && lanes.length) lanes[0].main = true;
  if (lanes.length && lanes.every((lane) => lane.hidden)) lanes[0].hidden = false;

  const laneIds = new Set(lanes.map((lane) => lane.id));
  const occupied = new Set<string>();
  const seenEvents = new Set<string>();
  const events: PlotEvent[] = [];
  for (const value of Array.isArray(o.events) ? o.events : []) {
    const e = (value ?? {}) as Record<string, unknown>;
    const laneId = typeof e.laneId === "string" ? e.laneId : "";
    if (!laneIds.has(laneId)) continue;
    let id = idOrNull(e.id) ?? newId();
    if (seenEvents.has(id)) id = newId();
    seenEvents.add(id);
    let row = clamp(Number.parseInt(String(e.row), 10) || 0, MIN_ROW, MAX_ROW);
    // Case déjà prise (document abîmé) : on s'éloigne du début de l'histoire.
    while (occupied.has(`${laneId}:${row}`)) row += row < 0 ? -1 : 1;
    occupied.add(`${laneId}:${row}`);
    events.push({
      id,
      laneId,
      row,
      title: str(e.title, MAX_TITLE),
      note: str(e.note),
      pivot: e.pivot === true,
      status: STATUS_ORDER.includes(e.status as PlotStatus) ? (e.status as PlotStatus) : "idea",
      tags: cleanTags(e.tags),
      characterIds: ids(e.characterIds),
      povId: idOrNull(e.povId),
      locationId: idOrNull(e.locationId),
      nodeId: idOrNull(e.nodeId),
      alsoNodeIds: ids(e.alsoNodeIds)
        .filter((x) => x !== idOrNull(e.nodeId))
        .slice(0, 20),
      noteIds: ids(e.noteIds),
      date: str(e.date, 80),
      words: clamp(Number.parseInt(String(e.words), 10) || 0, 0, 10_000_000),
    });
  }
  const eventIds = new Set(events.map((e) => e.id));

  const links: PlotLink[] = [];
  const seenPairs = new Set<string>();
  for (const value of Array.isArray(o.links) ? o.links : []) {
    const k = (value ?? {}) as Record<string, unknown>;
    const from = String(k.from ?? "");
    const to = String(k.to ?? "");
    if (!eventIds.has(from) || !eventIds.has(to) || from === to || seenPairs.has(`${from}>${to}`)) continue;
    seenPairs.add(`${from}>${to}`);
    links.push({
      id: idOrNull(k.id) ?? newId(),
      from,
      to,
      kind: LINK_KINDS.includes(k.kind as PlotLinkKind) ? (k.kind as PlotLinkKind) : "impact",
      label: str(k.label, 80),
      note: str(k.note),
    });
  }

  return {
    version: 1,
    lanes,
    events,
    links,
    rowLabels: dict(o.rowLabels, (v) => (typeof v === "string" && v.trim() ? v.slice(0, 60) : undefined)),
    acts: dict(o.acts, (v) => (typeof v === "string" && v.trim() ? v.slice(0, 80) : undefined)),
    tension: dict(o.tension, (v) => (typeof v === "number" && Number.isFinite(v) ? clamp(Math.round(v), 0, 10) : undefined)),
    readingOrder: ids(o.readingOrder).filter((id) => eventIds.has(id)),
    readingFollowsStructure: o.readingFollowsStructure !== false,
    questions: (Array.isArray(o.questions) ? o.questions : [])
      .map((value) => {
        const q = (value ?? {}) as Record<string, unknown>;
        const eventId = idOrNull(q.eventId);
        return {
          id: idOrNull(q.id) ?? newId(),
          text: str(q.text, 500),
          done: q.done === true,
          eventId: eventId && eventIds.has(eventId) ? eventId : null,
        };
      })
      .filter((q) => q.text.trim()),
    mysteries: (Array.isArray(o.mysteries) ? o.mysteries : []).map((value) => {
      const m = (value ?? {}) as Record<string, unknown>;
      const payoffEventId = idOrNull(m.payoffEventId);
      return {
        id: idOrNull(m.id) ?? newId(),
        question: str(m.question, 500),
        status: MYSTERY_STATUSES.includes(m.status as MysteryStatus) ? (m.status as MysteryStatus) : "open",
        answer: str(m.answer, 2000),
        payoff: str(m.payoff),
        payoffEventId: payoffEventId && eventIds.has(payoffEventId) ? payoffEventId : null,
      };
    }),
    goal: clamp(Number.parseInt(String(o.goal), 10) || 0, 0, 100_000_000),
    templates: templatesOf(o),
    sceneOrder: sceneOrderOf(o, events),
    ...cluesOf(o, eventIds),
  };
}

/** Ordre dans chaque scène : seulement des événements qui y sont racontés (scène principale). */
function sceneOrderOf(o: Record<string, unknown>, events: PlotEvent[]): Record<string, string[]> {
  const raw = (o.sceneOrder && typeof o.sceneOrder === "object" ? o.sceneOrder : {}) as Record<string, unknown>;
  const nodeOf = new Map(events.map((e) => [e.id, e.nodeId]));
  const out: Record<string, string[]> = {};
  for (const [nodeId, list] of Object.entries(raw)) {
    const kept = ids(list).filter((id) => nodeOf.get(id) === nodeId);
    if (kept.length) out[nodeId] = kept;
  }
  return out;
}

const MAX_TEMPLATES = 30;
const MAX_STEPS = 24;

function templatesOf(o: Record<string, unknown>): PlotCustomTemplate[] {
  return (Array.isArray(o.templates) ? o.templates : [])
    .map((value) => {
      const t = (value ?? {}) as Record<string, unknown>;
      return {
        id: idOrNull(t.id) ?? newId(),
        name: str(t.name, 80).trim(),
        steps: (Array.isArray(t.steps) ? t.steps : [])
          .map((step) => str(step, 80).trim())
          .filter(Boolean)
          .slice(0, MAX_STEPS),
      };
    })
    .filter((t) => t.name && t.steps.length)
    .slice(0, MAX_TEMPLATES);
}

/** Étapes d'un modèle de l'auteur, réparties régulièrement du début à la fin. */
export function customBeats(steps: string[]): number[] {
  const n = steps.length;
  return steps.map((_, index) => (n <= 1 ? 0 : index / (n - 1)));
}

/** Étapes saisies (une par ligne) : nettoyées, sans doublon vide. */
export function parseSteps(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, MAX_STEPS);
}

/** Actes actuels du plateau, dans l'ordre (pour en faire un modèle). */
export function actsInOrder(data: PlotData): string[] {
  return Object.entries(data.acts)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([, name]) => name);
}

function cluesOf(o: Record<string, unknown>, eventIds: Set<string>): Pick<PlotData, "clues"> {
  const mysteryIds = new Set(
    (Array.isArray(o.mysteries) ? o.mysteries : []).map((m) => (m as Record<string, unknown>)?.id).filter(Boolean),
  );
  return {
    clues: (Array.isArray(o.clues) ? o.clues : [])
      .map((value) => {
        const c = (value ?? {}) as Record<string, unknown>;
        const eventId = idOrNull(c.eventId);
        const mysteryId = idOrNull(c.mysteryId);
        return {
          id: idOrNull(c.id) ?? newId(),
          text: str(c.text, 500),
          eventId: eventId && eventIds.has(eventId) ? eventId : null,
          mysteryId: mysteryId && mysteryIds.has(mysteryId) ? mysteryId : null,
        };
      })
      .filter((c) => c.text.trim()),
  };
}

/** Réglages gardés même quand la trame n'a encore aucune colonne. */
function keepExtras(o: Record<string, unknown>): Partial<PlotData> {
  return { goal: clamp(Number.parseInt(String(o.goal), 10) || 0, 0, 100_000_000), templates: templatesOf(o) };
}

// ----------------------------------------------------------------------------
// Plateau
// ----------------------------------------------------------------------------

export const visibleLanes = (data: PlotData) => data.lanes.filter((lane) => !lane.hidden);
export const laneOf = (data: PlotData, id: string) => data.lanes.find((lane) => lane.id === id);
export const eventOf = (data: PlotData, id: string) => data.events.find((event) => event.id === id);
export const linkOf = (data: PlotData, id: string) => data.links.find((link) => link.id === id);
export const laneIndex = (data: PlotData, id: string) => data.lanes.findIndex((lane) => lane.id === id);

/** Nombre de lignes affichées : au moins 8, et deux de marge sous le dernier moment utilisé. */
export function rowsCount(data: PlotData): number {
  let max = 8;
  for (const event of data.events) max = Math.max(max, event.row + 1);
  for (const dict of [data.acts, data.tension, data.rowLabels]) {
    for (const key of Object.keys(dict)) max = Math.max(max, Number(key) + 1);
  }
  return max + 2;
}

/**
 * Nombre de lignes de passé affichées au-dessus du début de l'histoire :
 * au moins `PAST_MIN_ROWS`, et deux de marge au-dessus du moment le plus
 * ancien utilisé.
 */
export function pastRowsCount(data: PlotData): number {
  let min = 0;
  for (const event of data.events) min = Math.min(min, event.row);
  for (const dict of [data.acts, data.tension, data.rowLabels]) {
    for (const key of Object.keys(dict)) min = Math.min(min, Number(key));
  }
  return Math.max(PAST_MIN_ROWS, -min + 2);
}

/** Vrai pour un moment du passé narratif (avant le début de l'histoire). */
export const isPast = (row: number) => row < 0;

/**
 * Numéro affiché d'un moment : 1, 2, 3… pour l'histoire principale,
 * −1, −2… pour le passé narratif (−1 juste avant le début).
 */
export function momentNumber(row: number): string {
  return row >= 0 ? String(row + 1) : `\u2212${-row}`;
}

/** Moment saisi par l'auteur (1, 2… ou -1, -2…) ; `null` si invalide (0, vide). */
export function rowFromMoment(value: string): number | null {
  const n = Number.parseInt(value.replace("\u2212", "-"), 10);
  if (!Number.isFinite(n) || n === 0) return null;
  return clamp(n > 0 ? n - 1 : n, MIN_ROW, MAX_ROW);
}

export function occupant(data: PlotData, laneId: string, row: number, exceptId?: string): PlotEvent | undefined {
  return data.events.find((event) => event.laneId === laneId && event.row === row && event.id !== exceptId);
}

/**
 * Place un événement dans une case ; ceux qui l'occupaient s'écartent d'un
 * moment, en cascade, en s'éloignant du début de l'histoire : vers le bas
 * dans l'histoire principale, vers le haut (plus loin dans le passé) dans
 * le passé narratif. Le début de l'histoire ne bouge donc jamais. Modifie
 * `data`.
 */
export function placeEvent(data: PlotData, event: PlotEvent, laneId: string, row: number) {
  row = clamp(Math.round(row), MIN_ROW, MAX_ROW);
  const step = row < 0 ? -1 : 1;
  const bump = (r: number) => {
    const other = occupant(data, laneId, r, event.id);
    if (other) {
      bump(r + step);
      other.row = r + step;
    }
  };
  bump(row);
  event.laneId = laneId;
  event.row = row;
}

function shiftDict<T>(dict: Record<number, T>, from: number, delta: number): Record<number, T> {
  const out: Record<number, T> = {};
  for (const [key, value] of Object.entries(dict)) {
    const row = Number(key);
    out[row >= from ? row + delta : row] = value;
  }
  return out;
}

/** Insère (`delta` = 1) ou retire (`delta` = -1) un moment à partir de `from`. Modifie `data`. */
export function shiftRows(data: PlotData, from: number, delta: number) {
  for (const event of data.events) if (event.row >= from) event.row += delta;
  data.rowLabels = shiftDict(data.rowLabels, from, delta);
  data.acts = shiftDict(data.acts, from, delta);
  data.tension = shiftDict(data.tension, from, delta);
}

/** Décale de `delta` les moments du passé jusqu'à `upTo` inclus. Modifie `data`. */
function shiftPast(data: PlotData, upTo: number, delta: number) {
  const move = <T>(dict: Record<number, T>) => {
    const out: Record<number, T> = {};
    for (const [key, value] of Object.entries(dict)) {
      const row = Number(key);
      out[row <= upTo ? row + delta : row] = value;
    }
    return out;
  };
  for (const event of data.events) if (event.row <= upTo) event.row += delta;
  data.rowLabels = move(data.rowLabels);
  data.acts = move(data.acts);
  data.tension = move(data.tension);
}

/**
 * Insère un moment vide juste avant ou juste après `row` et renvoie sa
 * place. Dans l'histoire principale, ce qui suit descend ; dans le passé,
 * ce qui précède remonte : le début de l'histoire (moment 0) reste fixe.
 * Modifie `data`.
 */
export function insertMoment(data: PlotData, row: number, side: "before" | "after"): number {
  if (side === "before") {
    if (row >= 0) {
      shiftRows(data, row, 1);
      return row;
    }
    // Dans le passé : nouveau moment juste au-dessus, plus ancien.
    shiftPast(data, row - 1, -1);
    return row - 1;
  }
  if (row >= 0) {
    shiftRows(data, row + 1, 1);
    return row + 1;
  }
  shiftPast(data, row, -1);
  return row;
}

/**
 * Retire un moment (vide) : dans l'histoire principale, ce qui suit
 * remonte ; dans le passé, ce qui précède se rapproche du début. Modifie
 * `data`.
 */
export function removeMoment(data: PlotData, row: number) {
  delete data.rowLabels[row];
  delete data.acts[row];
  delete data.tension[row];
  if (row >= 0) shiftRows(data, row + 1, -1);
  else shiftPast(data, row - 1, 1);
}

/** Événements atteints en suivant les liens (vers l'aval ou vers l'amont). */
export function reach(data: PlotData, id: string, direction: "out" | "in"): string[] {
  const seen = new Set<string>([id]);
  const stack = [id];
  const out: string[] = [];
  while (stack.length) {
    const current = stack.pop()!;
    for (const link of data.links) {
      const a = direction === "out" ? link.from : link.to;
      const b = direction === "out" ? link.to : link.from;
      if (a === current && !seen.has(b)) {
        seen.add(b);
        out.push(b);
        stack.push(b);
      }
    }
  }
  return out;
}

export type PlotSelection =
  | { type: "event"; id: string }
  | { type: "link"; id: string }
  | { type: "lane"; id: string }
  | { type: "row"; id: number }
  | null;

/** Ce qui reste net quand un événement ou un lien est choisi (le reste s'estompe). */
export function computeFocus(data: PlotData, selection: PlotSelection): { nodes: Set<string>; links: Set<string> } | null {
  if (!selection) return null;
  if (selection.type === "event") {
    const nodes = new Set<string>([selection.id]);
    const links = new Set<string>();
    for (const direction of ["out", "in"] as const) {
      const seen = new Set<string>([selection.id]);
      const stack = [selection.id];
      while (stack.length) {
        const current = stack.pop()!;
        for (const link of data.links) {
          const a = direction === "out" ? link.from : link.to;
          const b = direction === "out" ? link.to : link.from;
          if (a === current) {
            links.add(link.id);
            nodes.add(b);
            if (!seen.has(b)) {
              seen.add(b);
              stack.push(b);
            }
          }
        }
      }
    }
    return { nodes, links };
  }
  if (selection.type === "link") {
    const link = linkOf(data, selection.id);
    if (!link) return null;
    return { nodes: new Set([link.from, link.to]), links: new Set([link.id]) };
  }
  return null;
}

// ----------------------------------------------------------------------------
// Mise en avant (filtres)
// ----------------------------------------------------------------------------

export function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export interface PlotFilter {
  q: string;
  status: PlotStatus | "";
  characterId: string;
  tag: string;
  locationId: string;
  /** Seulement les événements racontés dans aucune scène. */
  unplaced?: boolean;
}

export const EMPTY_FILTER: PlotFilter = { q: "", status: "", characterId: "", tag: "", locationId: "" };

export const filterActive = (filter: PlotFilter) =>
  Boolean(filter.q || filter.status || filter.characterId || filter.tag || filter.locationId || filter.unplaced);

/** L'événement correspond-il à la mise en avant ? `text` : textes liés (noms des personnages, du lieu…). */
export function matchesFilter(event: PlotEvent, filter: PlotFilter, text = ""): boolean {
  if (filter.status && event.status !== filter.status) return false;
  if (filter.unplaced && event.nodeId) return false;
  if (filter.characterId && !event.characterIds.includes(filter.characterId) && event.povId !== filter.characterId) return false;
  if (filter.locationId && event.locationId !== filter.locationId) return false;
  if (filter.tag && !event.tags.some((tag) => fold(tag) === fold(filter.tag))) return false;
  if (filter.q) {
    const hay = fold([event.title, event.note, event.date, event.tags.join(" "), text].join(" "));
    if (!hay.includes(fold(filter.q))) return false;
  }
  return true;
}

/** Étiquettes utilisées, les plus fréquentes d'abord. */
export function allTags(data: PlotData): Array<{ tag: string; count: number }> {
  const map = new Map<string, { tag: string; count: number }>();
  for (const event of data.events) {
    for (const tag of event.tags) {
      const key = fold(tag);
      const entry = map.get(key) ?? { tag, count: 0 };
      entry.count++;
      map.set(key, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

// ----------------------------------------------------------------------------
// Ordre de lecture et parcours
// ----------------------------------------------------------------------------

/** Ordre du plan : moment par moment, puis de gauche à droite. */
export function planOrder(data: PlotData): PlotEvent[] {
  return [...data.events].sort((a, b) => a.row - b.row || laneIndex(data, a.laneId) - laneIndex(data, b.laneId));
}

/**
 * Ordre dans lequel le lecteur découvre les événements.
 * - Si l'ordre suit le découpage : les événements rangés dans un élément du
 *   découpage suivent l'ordre du plan du récit (`structureOrder` : position
 *   de chaque élément) ; ceux qui n'y sont pas rangés gardent leur place
 *   relative dans l'ordre du plan, juste après l'événement qui les précède.
 * - Sinon : l'ordre choisi à la main, complété par l'ordre du plan.
 */
export function readingOrder(data: PlotData, structureOrder: Map<string, number>): PlotEvent[] {
  const plan = planOrder(data);
  if (data.readingFollowsStructure && structureOrder.size) {
    // Rang de chaque événement : celui de son élément, sinon celui du
    // dernier événement rangé qui le précède dans le plan.
    let last = -1;
    const rank = new Map<string, number>();
    plan.forEach((event) => {
      const position = event.nodeId ? structureOrder.get(event.nodeId) : undefined;
      if (position !== undefined) last = position;
      rank.set(event.id, position ?? last + 0.5);
    });
    const inScene = (event: PlotEvent) => {
      const list = event.nodeId ? data.sceneOrder[event.nodeId] : undefined;
      const index = list ? list.indexOf(event.id) : -1;
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    return plan
      .map((event, index) => ({ event, index }))
      .sort(
        (a, b) =>
          rank.get(a.event.id)! - rank.get(b.event.id)! ||
          (a.event.nodeId && a.event.nodeId === b.event.nodeId ? inScene(a.event) - inScene(b.event) : 0) ||
          a.index - b.index,
      )
      .map((item) => item.event);
  }
  const seen = new Set<string>();
  const out: PlotEvent[] = [];
  for (const id of data.readingOrder) {
    const event = eventOf(data, id);
    if (event && !seen.has(id)) {
      seen.add(id);
      out.push(event);
    }
  }
  for (const event of plan) if (!seen.has(event.id)) out.push(event);
  return out;
}

/** Déplace un événement dans l'ordre de lecture manuel. Renvoie le nouvel ordre. */
export function moveInReadingOrder(order: string[], id: string, delta: number): string[] {
  const index = order.indexOf(id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= order.length) return order;
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export type TourMode = "structure" | "reading" | "lane";

export function tourList(data: PlotData, mode: TourMode, laneId: string | null, structureOrder: Map<string, number>): PlotEvent[] {
  if (mode === "reading") return readingOrder(data, structureOrder);
  if (mode === "lane") return data.events.filter((event) => event.laneId === laneId).sort((a, b) => a.row - b.row);
  return planOrder(data);
}

/** Chronologie : les événements datés, du plus ancien au plus récent. */
export function chronology(data: PlotData): { dated: PlotEvent[]; undated: PlotEvent[] } {
  const dated: Array<{ event: PlotEvent; time: number }> = [];
  const undated: PlotEvent[] = [];
  for (const event of data.events) {
    const time = event.date ? Date.parse(event.date) : Number.NaN;
    if (Number.isNaN(time)) undated.push(event);
    else dated.push({ event, time });
  }
  dated.sort((a, b) => a.time - b.time);
  return { dated: dated.map((item) => item.event), undated };
}

// ----------------------------------------------------------------------------
// Repères automatiques
// ----------------------------------------------------------------------------

export interface PlotIssue {
  /** Élément à montrer (absent : remarque générale). */
  target: { type: "event" | "lane" | "link"; id: string } | null;
  /** Clé de traduction (`plot:issues.*`) et valeurs. */
  key: string;
  params: Record<string, string | number>;
  severity: "info" | "warning";
}

export function computeIssues(data: PlotData, untitled: string): PlotIssue[] {
  const out: PlotIssue[] = [];
  const title = (event: PlotEvent | undefined) => event?.title.trim() || untitled;
  const main = data.lanes.find((lane) => lane.main);

  for (const event of data.events) {
    if (!event.title.trim()) {
      out.push({
        target: { type: "event", id: event.id },
        key: "untitled",
        params: { lane: laneOf(data, event.laneId)?.name ?? "", moment: momentNumber(event.row) },
        severity: "warning",
      });
    }
  }

  if (main) {
    const rows = data.events.filter((e) => e.laneId === main.id).sort((a, b) => a.row - b.row);
    for (let i = 1; i < rows.length; i++) {
      const gap = rows[i].row - rows[i - 1].row - 1;
      if (gap >= 3) {
        out.push({ target: { type: "event", id: rows[i].id }, key: "mainGap", params: { count: gap, title: title(rows[i]) }, severity: "info" });
      }
    }
  }

  for (const lane of data.lanes) {
    if (lane.main) continue;
    const events = data.events.filter((e) => e.laneId === lane.id);
    if (!events.length) continue;
    const mine = new Set(events.map((e) => e.id));
    const touching = data.links.filter((link) => mine.has(link.from) || mine.has(link.to));
    if (!touching.length) {
      out.push({ target: { type: "lane", id: lane.id }, key: "laneIsolated", params: { lane: lane.name }, severity: "warning" });
      continue;
    }
    if (!main) continue;
    let reaches = events.some((e) => reach(data, e.id, "out").some((id) => eventOf(data, id)?.laneId === main.id));
    if (!reaches) {
      reaches = touching.some((link) => {
        if (link.kind !== "meeting") return false;
        const other = eventOf(data, mine.has(link.from) ? link.to : link.from);
        return other?.laneId === main.id;
      });
    }
    if (!reaches) out.push({ target: { type: "lane", id: lane.id }, key: "laneUnreached", params: { lane: lane.name }, severity: "info" });
  }

  for (const link of data.links) {
    if (link.kind === "meeting") continue;
    const a = eventOf(data, link.from);
    const b = eventOf(data, link.to);
    if (a && b && b.row < a.row) {
      out.push({ target: { type: "link", id: link.id }, key: "backInTime", params: { title: link.label || title(a) }, severity: "info" });
    }
  }

  for (const event of data.events) {
    if (event.date && Number.isNaN(Date.parse(event.date)) && !/[a-zA-Zà-ÿ]/.test(event.date)) {
      out.push({ target: { type: "event", id: event.id }, key: "badDate", params: { title: title(event), date: event.date }, severity: "warning" });
    }
  }

  for (const mystery of data.mysteries) {
    if (!data.clues.some((clue) => clue.mysteryId === mystery.id)) {
      out.push({ target: null, key: "mysteryNoClue", params: { question: mystery.question || untitled }, severity: "info" });
    }
    if (mystery.status === "solved" && !mystery.answer.trim()) {
      out.push({ target: null, key: "mysteryNoAnswer", params: { question: mystery.question || untitled }, severity: "warning" });
    }
  }

  if (data.events.length >= 5 && !data.events.some((e) => e.pivot)) {
    out.push({ target: null, key: "noPivot", params: {}, severity: "warning" });
  }
  return out;
}

// ----------------------------------------------------------------------------
// Liens avec les autres tables du projet
// ----------------------------------------------------------------------------

/** Événements où un personnage est présent ou porte le point de vue, dans l'ordre du plan. */
export function eventsOfCharacter(data: PlotData, characterId: string): PlotEvent[] {
  return planOrder(data).filter((e) => e.characterIds.includes(characterId) || e.povId === characterId);
}

export function eventsOfLocation(data: PlotData, locationId: string): PlotEvent[] {
  return planOrder(data).filter((e) => e.locationId === locationId);
}

/** Événements racontés dans un élément (scène principale), dans l'ordre de la scène. */
export function eventsOfNode(data: PlotData, nodeId: string): PlotEvent[] {
  const plan = planOrder(data).filter((e) => e.nodeId === nodeId);
  const order = data.sceneOrder[nodeId] ?? [];
  const rank = (e: PlotEvent) => {
    const i = order.indexOf(e.id);
    return i < 0 ? order.length + plan.indexOf(e) : i;
  };
  return [...plan].sort((a, b) => rank(a) - rank(b));
}

/** Événements racontés à nouveau dans un élément (« Raconté aussi dans »). */
export function eventsRetoldIn(data: PlotData, nodeId: string): PlotEvent[] {
  return planOrder(data).filter((e) => e.alsoNodeIds.includes(nodeId));
}

/** Relie un événement à une scène (scène principale), à la fin de l'ordre de la scène. Modifie `data`. */
export function attachToNode(data: PlotData, eventId: string, nodeId: string | null) {
  const event = eventOf(data, eventId);
  if (!event) return;
  if (event.nodeId) {
    const list = data.sceneOrder[event.nodeId];
    if (list) data.sceneOrder[event.nodeId] = list.filter((x) => x !== eventId);
  }
  event.nodeId = nodeId;
  event.alsoNodeIds = event.alsoNodeIds.filter((x) => x !== nodeId);
  if (nodeId) {
    const current = eventsOfNode(data, nodeId).map((e) => e.id).filter((x) => x !== eventId);
    data.sceneOrder[nodeId] = [...current, eventId];
  }
}

/** Déplace un événement dans l'ordre de sa scène (`delta` : -1 plus tôt, +1 plus tard). Modifie `data`. */
export function moveInScene(data: PlotData, nodeId: string, eventId: string, delta: number) {
  const order = eventsOfNode(data, nodeId).map((e) => e.id);
  data.sceneOrder[nodeId] = moveInReadingOrder(order, eventId, delta);
}

export function eventsOfNote(data: PlotData, noteId: string): PlotEvent[] {
  return planOrder(data).filter((e) => e.noteIds.includes(noteId));
}

/** Retire les liens vers des éléments qui n'existent plus (nettoyage volontaire). Modifie `data`. */
export function dropMissing(
  data: PlotData,
  exists: { character: (id: string) => boolean; location: (id: string) => boolean; node: (id: string) => boolean; note: (id: string) => boolean },
): number {
  let removed = 0;
  for (const event of data.events) {
    const characters = event.characterIds.filter(exists.character);
    removed += event.characterIds.length - characters.length;
    event.characterIds = characters;
    const notes = event.noteIds.filter(exists.note);
    removed += event.noteIds.length - notes.length;
    event.noteIds = notes;
    if (event.povId && !exists.character(event.povId)) {
      event.povId = null;
      removed++;
    }
    if (event.locationId && !exists.location(event.locationId)) {
      event.locationId = null;
      removed++;
    }
    if (event.nodeId && !exists.node(event.nodeId)) {
      event.nodeId = null;
      removed++;
    }
    const also = event.alsoNodeIds.filter(exists.node);
    removed += event.alsoNodeIds.length - also.length;
    event.alsoNodeIds = also;
  }
  for (const lane of data.lanes) {
    if (lane.characterId && !exists.character(lane.characterId)) {
      lane.characterId = null;
      removed++;
    }
  }
  return removed;
}

// ----------------------------------------------------------------------------
// Texte
// ----------------------------------------------------------------------------

/** Résumé lisible pour comparer deux versions de la trame. */
export function plotSummary(raw: unknown, untitled: string): string {
  let data: PlotData;
  try {
    data = normalizePlot(typeof raw === "string" ? (raw ? JSON.parse(raw) : {}) : raw, "—");
  } catch {
    return "";
  }
  const lines: string[] = [];
  for (const lane of data.lanes) lines.push(`▥ ${lane.name}`);
  for (const event of planOrder(data)) {
    lines.push(`${momentNumber(event.row)}. [${laneOf(data, event.laneId)?.name ?? ""}] ${event.title || untitled}${event.note ? ` — ${event.note}` : ""}`);
  }
  for (const [row, act] of Object.entries(data.acts)) lines.push(`§ ${momentNumber(Number(row))} ${act}`);
  return lines.join("\n");
}

/** Applique un modèle : un acte au début de chaque étape, sur `rows` moments. Modifie `data`. */
export function applyTemplate(data: PlotData, beats: number[], names: string[], rows: number, replace: boolean) {
  if (replace) data.acts = {};
  const n = Math.max(4, rows);
  beats.forEach((fraction, index) => {
    const row = clamp(Math.round(fraction * (n - 1)), 0, n - 1);
    if (names[index]) data.acts[row] = names[index];
  });
}

/** Couleur libre pour une nouvelle trame. */
export function nextColor(data: PlotData): string {
  const used = new Set(data.lanes.map((lane) => lane.color.toLowerCase()));
  return PLOT_PALETTE.find((color) => !used.has(color)) ?? PLOT_PALETTE[data.lanes.length % PLOT_PALETTE.length];
}

/** Total des mots renseignés sur les événements. */
export const sumWords = (data: PlotData) => data.events.reduce((sum, event) => sum + event.words, 0);