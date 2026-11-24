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
  /**
   * Fiches du monde présentes dans l'événement (objets, faune et flore,
   * factions, peuples, magie). Une fiche supprimée depuis est ignorée.
   */
  entries: PlotEntryRef[];
  /** Élément du découpage où l'événement est raconté (chapitre, scène…) : il fixe sa place dans la lecture. */
  nodeId: string | null;
  /** Autres scènes où l'événement est raconté à nouveau (souvenir, autre point de vue…). */
  alsoNodeIds: string[];
  noteIds: string[];
  /** Date dans l'histoire, telle que l'auteur l'écrit (« 3e lune, an 312 »). */
  date: string;
  /** Année dans le calendrier de l'histoire : place l'événement sur la frise chronologique. */
  year: number | null;
  /** Fin d'une période (même calendrier) ; `null` : événement ponctuel. */
  yearEnd: number | null;
  /** Mois, jour, heure du début (selon la précision de la frise choisie pour le projet). */
  yearDetail: YearDetail | null;
  /** Mois, jour, heure de la fin d'une période. */
  yearEndDetail: YearDetail | null;
  words: number;
}

/** Précision de la frise chronologique, réglée dans les paramètres du projet. */
export type TimePrecision = "year" | "month" | "day" | "hour";
export const TIME_PRECISIONS: TimePrecision[] = ["year", "month", "day", "hour"];

/** Date dans l'année : mois (1-12), jour du mois, heure (0-23). Un jour suppose un mois, une heure un jour. */
export interface YearDetail {
  month: number;
  day: number | null;
  hour: number | null;
}

/** Époque de la frise chronologique (« Guerre des Cendres », an 301 à 318). */
export interface PlotEra {
  id: string;
  name: string;
  from: number;
  to: number;
  color: string;
}

/** Fiche du monde citée par un événement. */
export interface PlotEntryRef {
  kind: "item" | "species" | "faction" | "people" | "magic";
  id: string;
}

const ENTRY_KINDS: ReadonlySet<string> = new Set(["item", "species", "faction", "people", "magic"]);

/** Fiches du monde d'un événement enregistré : sortes connues, sans doublon, 50 au plus. */
function cleanEntries(value: unknown): PlotEntryRef[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: PlotEntryRef[] = [];
  for (const item of value) {
    const ref = (item ?? {}) as Record<string, unknown>;
    if (typeof ref.kind !== "string" || !ENTRY_KINDS.has(ref.kind) || typeof ref.id !== "string" || !ref.id) continue;
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: ref.kind as PlotEntryRef["kind"], id: ref.id });
    if (out.length >= 50) break;
  }
  return out;
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
  /** Frise chronologique : époques, dans l'ordre. */
  eras: PlotEra[];
  /** Nom des années dans l'histoire (« an », « EC »…), affiché sur la frise. */
  yearLabel: string;
  /** Jusqu'où la frise descend : l'année (par défaut), le mois, le jour ou l'heure. */
  timePrecision: TimePrecision;
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
    eras: [],
    yearLabel: "",
    timePrecision: "year",
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
      entries: cleanEntries(e.entries),
      nodeId: idOrNull(e.nodeId),
      alsoNodeIds: ids(e.alsoNodeIds)
        .filter((x) => x !== idOrNull(e.nodeId))
        .slice(0, 20),
      noteIds: ids(e.noteIds),
      date: str(e.date, 80),
      ...yearsOf(e),
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
    ...timelineOf(o),
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
  return { goal: clamp(Number.parseInt(String(o.goal), 10) || 0, 0, 100_000_000), templates: templatesOf(o), ...timelineOf(o) };
}

// ----------------------------------------------------------------------------
// Frise chronologique (années, époques, naissances)
// ----------------------------------------------------------------------------

/** Années admises sur la frise (calendrier inventé : négatives comprises). */
export const MIN_YEAR = -1_000_000;
export const MAX_YEAR = 1_000_000;

/** Année d'un nouvel événement, et place sur la frise d'un événement sans année. */
export const DEFAULT_YEAR = 2000;

/** Année lue (nombre entier dans les bornes), sinon `null`. */
export function readYear(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isInteger(n) && n >= MIN_YEAR && n <= MAX_YEAR ? n : null;
}

// --- Calendrier (12 mois, années bissextiles, 24 heures) ---------------------

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : MONTH_DAYS[month - 1];
}

function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/** Jours écoulés depuis le début de l'année jusqu'au premier jour du mois. */
function daysBeforeMonth(year: number, month: number): number {
  let days = 0;
  for (let m = 1; m < month; m++) days += daysInMonth(year, m);
  return days;
}

/** Durée approximative de chaque unité, en années (choix des graduations). */
export const UNIT_YEARS: Record<TimePrecision, number> = { year: 1, month: 1 / 12, day: 1 / 365.25, hour: 1 / 8766 };

/** Les niveaux de précision jusqu'à celui donné compris (« jour » : année, mois, jour). */
export function precisionAllows(precision: TimePrecision, level: TimePrecision): boolean {
  return TIME_PRECISIONS.indexOf(level) <= TIME_PRECISIONS.indexOf(precision);
}

/** Mois, jour, heure lus d'un document enregistré : chacun suppose le précédent, et reste dans le calendrier. */
function detailOf(value: unknown, year: number | null): YearDetail | null {
  if (year === null || !value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const month = Number(v.month);
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  const day = Number(v.day);
  const okDay = Number.isInteger(day) && day >= 1 && day <= daysInMonth(year, month);
  const hour = Number(v.hour);
  const okHour = okDay && v.hour !== null && v.hour !== undefined && Number.isInteger(hour) && hour >= 0 && hour <= 23;
  return { month, day: okDay ? day : null, hour: okHour ? hour : null };
}

/**
 * Instant sur la frise, en années (fraction comprise : 1850,5 = mi-1850),
 * en ne gardant du mois, du jour et de l'heure que ce que la précision permet.
 */
export function instantOf(year: number, detail: YearDetail | null, precision: TimePrecision = "hour"): number {
  if (!detail || precision === "year") return year;
  let days = daysBeforeMonth(year, detail.month);
  let hours = 0;
  if (precision !== "month" && detail.day !== null) {
    days += detail.day - 1;
    if (precision === "hour" && detail.hour !== null) hours = detail.hour;
  }
  return year + (days + hours / 24) / daysInYear(year);
}

/** Date d'un instant de la frise (année, mois, jour, heure), pour l'afficher. */
export function datePartsOf(instant: number): { year: number; month: number; day: number; hour: number } {
  const year = Math.floor(instant + 1e-9);
  let hours = Math.max(0, Math.round((instant - year) * daysInYear(year) * 24));
  let month = 1;
  while (month < 12 && hours >= daysInMonth(year, month) * 24) hours -= daysInMonth(year, month++) * 24;
  const day = Math.min(daysInMonth(year, month), Math.floor(hours / 24) + 1);
  return { year, month, day, hour: Math.min(23, hours % 24) };
}

/** Une fin est gardée si elle vient après le début (la même année seulement avec un mois). */
function endIsValid(year: number, detail: YearDetail | null, yearEnd: number, endDetail: YearDetail | null): boolean {
  if (yearEnd > year) return true;
  return yearEnd === year && endDetail !== null && instantOf(yearEnd, endDetail) >= instantOf(year, detail);
}

/** Années (et mois, jour, heure) d'un événement : une fin seulement après un début, et jamais avant lui. */
function yearsOf(e: Record<string, unknown>): Pick<PlotEvent, "year" | "yearEnd" | "yearDetail" | "yearEndDetail"> {
  const year = readYear(e.year);
  const yearDetail = detailOf(e.yearDetail, year);
  const end = year === null ? null : readYear(e.yearEnd);
  const endDetail = detailOf(e.yearEndDetail, end);
  if (year === null || end === null || !endIsValid(year, yearDetail, end, endDetail)) return { year, yearEnd: null, yearDetail, yearEndDetail: null };
  return { year, yearEnd: end, yearDetail, yearEndDetail: endDetail };
}

/** Changement d'une partie de la date d'un événement (début ou fin). */
export interface WhenPatch {
  year?: number | null;
  month?: number | null;
  day?: number | null;
  hour?: number | null;
}

/**
 * Change le début ou la fin d'un événement en gardant une date cohérente :
 * un jour suppose un mois, une heure un jour, le jour reste dans le mois,
 * et une fin qui ne vient plus après le début est retirée. Choisir le mois
 * de fin sans année de fin la place la même année que le début.
 */
export function updateWhen(event: PlotEvent, which: "start" | "end", patch: WhenPatch): void {
  const start = which === "start";
  let year = start ? event.year : event.yearEnd;
  let detail: YearDetail | null = start ? event.yearDetail : event.yearEndDetail;
  if (patch.year !== undefined) year = patch.year;
  if (!start && year === null && patch.month !== undefined && patch.month !== null) year = event.year;
  if (year === null) detail = null;
  else {
    let month = patch.month !== undefined ? patch.month : (detail?.month ?? null);
    let day = patch.day !== undefined ? patch.day : (detail?.day ?? null);
    let hour = patch.hour !== undefined ? patch.hour : (detail?.hour ?? null);
    if (month === null) month = day = hour = null;
    else {
      if (day !== null) day = Math.min(Math.max(1, day), daysInMonth(year, month));
      if (day === null) hour = null;
    }
    detail = month === null ? null : { month, day, hour: hour === null ? null : Math.min(23, Math.max(0, hour)) };
  }

  if (start) {
    event.year = year;
    event.yearDetail = detail;
  } else {
    event.yearEnd = year;
    event.yearEndDetail = detail;
  }
  if (event.year === null || event.yearEnd === null || !endIsValid(event.year, event.yearDetail, event.yearEnd, event.yearEndDetail)) {
    event.yearEnd = null;
    event.yearEndDetail = null;
  }
}

/** Époques, naissances et nom des années, lus d'un document enregistré. */
function timelineOf(o: Record<string, unknown>): Pick<PlotData, "eras" | "yearLabel" | "timePrecision"> {
  const eras: PlotEra[] = [];
  for (const value of Array.isArray(o.eras) ? o.eras : []) {
    const e = (value ?? {}) as Record<string, unknown>;
    const from = readYear(e.from);
    const to = readYear(e.to);
    if (from === null || to === null) continue;
    eras.push({
      id: idOrNull(e.id) ?? newId(),
      name: str(e.name, 80),
      from: Math.min(from, to),
      to: Math.max(from, to),
      color: typeof e.color === "string" && COLOR.test(e.color) ? e.color : PLOT_PALETTE[eras.length % PLOT_PALETTE.length],
    });
    if (eras.length >= 100) break;
  }
  eras.sort((a, b) => a.from - b.from || a.to - b.to);

  const timePrecision = TIME_PRECISIONS.includes(o.timePrecision as TimePrecision) ? (o.timePrecision as TimePrecision) : "year";
  return { eras, yearLabel: str(o.yearLabel, 20).trim(), timePrecision };
}

/** Événement placé sur la frise : ses années de début et de fin. */
export interface TimelineItem {
  event: PlotEvent;
  from: number;
  to: number;
}

/**
 * Frise chronologique : tous les événements, du plus ancien au plus récent.
 * Un événement sans année est placé en l'an 2000 (`DEFAULT_YEAR`) et
 * figure aussi dans `undated`, pour qu'on lui donne sa vraie année. Le début
 * du récit est la date du premier événement daté de l'histoire principale
 * (moment 0 ou après) ; sans aucun, il n'y en a pas.
 */
export function timeline(data: PlotData): { items: TimelineItem[]; undated: PlotEvent[]; storyStart: number | null } {
  const items: TimelineItem[] = [];
  const undated: PlotEvent[] = [];
  for (const event of data.events) {
    if (event.year === null) {
      undated.push(event);
      items.push({ event, from: DEFAULT_YEAR, to: DEFAULT_YEAR });
    } else {
      // Instants à la précision du projet : un mois saisi puis une précision
      // ramenée à l'année est gardé, mais ne compte plus sur la frise.
      const from = instantOf(event.year, event.yearDetail, data.timePrecision);
      const to = event.yearEnd === null ? from : instantOf(event.yearEnd, event.yearEndDetail, data.timePrecision);
      items.push({ event, from, to: Math.max(from, to) });
    }
  }
  items.sort((a, b) => a.from - b.from || a.to - b.to || a.event.row - b.event.row);
  undated.sort((a, b) => a.row - b.row);
  // Seuls les événements datés comptent : un événement sans année, placé
  // en l'an 2000 en attendant, ne doit pas fixer le début du récit.
  const present = items.filter((item) => item.event.row >= 0 && item.event.year !== null);
  const storyStart = present.length ? Math.min(...present.map((item) => item.from)) : null;
  return { items, undated, storyStart };
}

/** Étendue de la frise : toutes les années utilisées (événements, époques), avec une marge. */
export function timelineRange(data: PlotData, items: TimelineItem[]): { from: number; to: number } | null {
  const years = [
    ...items.flatMap((item) => [item.from, item.to]),
    ...data.eras.flatMap((era) => [era.from, era.to]),
  ];
  if (!years.length) return null;
  let from = Math.min(...years);
  let to = Math.max(...years);
  // Précision plus fine que l'année : une étendue d'au moins un mois (mois),
  // quelques semaines (jour) ou quelques jours (heure), sans arrondi.
  if (data.timePrecision !== "year") {
    const minSpan = { month: 1, day: 1 / 12, hour: 3 / 365 }[data.timePrecision];
    if (to - from < minSpan) {
      const middle = (from + to) / 2;
      from = middle - minSpan / 2;
      to = middle + minSpan / 2;
    }
    const margin = Math.max(UNIT_YEARS[data.timePrecision], (to - from) * 0.04);
    return { from: from - margin, to: to + margin };
  }
  if (to - from < 10) {
    const middle = Math.floor((from + to) / 2);
    from = middle - 5;
    to = middle + 5;
  }
  const margin = Math.max(1, Math.round((to - from) * 0.04));
  return { from: from - margin, to: to + margin };
}

/** Pas des graduations : environ huit, sur des valeurs rondes (1, 2, 5, 10, 20, 50…). */
export function timelineStep(span: number): number {
  const raw = Math.max(1, span / 8);
  const power = 10 ** Math.floor(Math.log10(raw));
  for (const factor of [1, 2, 5, 10]) if (raw <= factor * power) return factor * power;
  return 10 * power;
}

/**
 * Pas des graduations selon l'échelle à l'écran : la plus petite valeur ronde
 * (1, 2, 5, 10, 20…) dont l'écart laisse la place de lire l'année
 * (`minGap` pixels). Au plus fort zoom, chaque année a sa graduation.
 */
export function timelineStepAt(pxPerYear: number, minGap: number): number {
  return timelineStep(Math.max(1, minGap / Math.max(pxPerYear, 1e-9)) * 8);
}

/** Graduation de la frise : son instant et la date qu'elle marque. */
export interface TimelineTick {
  at: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  /** Début de l'unité au-dessus (janvier, 1er du mois, minuit) : on y écrit aussi cette unité. */
  major: boolean;
}

/** Pas possibles sous l'année, du plus fin au plus large. */
const SUB_YEAR_STEPS: Array<{ unit: Exclude<TimePrecision, "year">; step: number }> = [
  { unit: "hour", step: 1 },
  { unit: "hour", step: 3 },
  { unit: "hour", step: 6 },
  { unit: "hour", step: 12 },
  { unit: "day", step: 1 },
  { unit: "day", step: 7 },
  { unit: "month", step: 1 },
  { unit: "month", step: 3 },
  { unit: "month", step: 6 },
];

/**
 * Écarts possibles entre deux graduations, en années, du plus large au plus
 * fin : 100, 50, 20, 10, 5, 2, 1 an, puis 6, 3, 1 mois, 7, 1 jour, 12, 6,
 * 3, 1 heure, selon la précision du projet. Les boutons − / + du zoom
 * passent d'un écart au suivant.
 */
export function timelineGaps(precision: TimePrecision, span: number): number[] {
  const gaps: number[] = [];
  for (let power = 1; power <= Math.max(1, span); power *= 10) for (const factor of [1, 2, 5]) if (factor * power <= Math.max(1, span)) gaps.push(factor * power);
  gaps.sort((a, b) => b - a);
  for (const { unit, step } of [...SUB_YEAR_STEPS].reverse()) if (precisionAllows(precision, unit)) gaps.push(UNIT_YEARS[unit] * step);
  return gaps;
}

/**
 * Graduations entre `from` et `to` (instants en années) : l'unité la plus
 * fine que la précision du projet permet et que l'échelle laisse lire
 * (`minGap` pixels entre deux), sinon des années rondes.
 */
export function timelineTicks(
  from: number,
  to: number,
  pxPerYear: number,
  minGap: number,
  precision: TimePrecision,
): { unit: TimePrecision; step: number; ticks: TimelineTick[] } {
  const choice = SUB_YEAR_STEPS.find(({ unit, step }) => precisionAllows(precision, unit) && UNIT_YEARS[unit] * step * pxPerYear >= minGap);
  const ticks: TimelineTick[] = [];
  if (!choice) {
    const step = timelineStepAt(pxPerYear, minGap);
    for (let y = Math.ceil(from / step) * step; y <= to; y += step) ticks.push({ at: y, year: y, month: 1, day: 1, hour: 0, major: true });
    return { unit: "year", step, ticks };
  }
  const { unit, step } = choice;
  const push = (year: number, month: number, day: number, hour: number, major: boolean) => {
    const at = instantOf(year, { month, day, hour }, "hour");
    if (at >= from && at <= to) ticks.push({ at, year, month, day, hour, major });
  };
  for (let year = Math.floor(from); year <= Math.floor(to); year++) {
    for (let month = 1; month <= 12; month++) {
      const monthStart = instantOf(year, { month, day: 1, hour: 0 });
      const monthEnd = month === 12 ? year + 1 : instantOf(year, { month: month + 1, day: 1, hour: 0 });
      if (monthEnd < from || monthStart > to) continue;
      if (unit === "month") {
        if ((month - 1) % step === 0) push(year, month, 1, 0, month === 1);
        continue;
      }
      for (let day = 1; day <= daysInMonth(year, month); day++) {
        if (unit === "day") {
          // Par semaine : le 1er, le 8, le 15, le 22 (et le 29) de chaque mois.
          if ((day - 1) % step === 0) push(year, month, day, 0, day === 1);
          continue;
        }
        const dayStart = instantOf(year, { month, day, hour: 0 });
        if (dayStart + 1 / daysInYear(year) < from || dayStart > to) continue;
        for (let hour = 0; hour < 24; hour += step) push(year, month, day, hour, hour === 0);
      }
    }
  }
  return { unit, step, ticks };
}

/**
 * Année lue dans un texte libre, comme la date de naissance d'une fiche
 * (« 12 mars 1890 », « an 299, 3e lune », « 1890-03-12 », « -45 ») : le
 * nombre le plus long, le dernier s'il y en a plusieurs. `null` sans nombre.
 */
export function yearInText(text: string | undefined | null): number | null {
  const numbers = [...(text ?? "").matchAll(/(^|[^\d-])(-?\d{1,7})/g)].map((m) => m[2]);
  if (!numbers.length) return null;
  const longest = numbers.reduce((best, n) => (n.replace("-", "").length >= best.replace("-", "").length ? n : best));
  return readYear(longest);
}

/** Âge à une année, d'après l'année de naissance (`null` : inconnue, ou pas encore né). */
export function ageAt(birthYear: number | null, year: number): number | null {
  if (birthYear === null || year < birthYear) return null;
  return year - birthYear;
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

  // Frise : un événement de l'histoire placé avant un événement du passé narratif.
  for (const later of data.events) {
    if (later.year === null || later.row < 0) continue;
    const earlier = data.events.find((e) => e.year !== null && e.row < 0 && e.laneId === later.laneId && e.year > later.year!);
    if (earlier) {
      out.push({ target: { type: "event", id: later.id }, key: "pastAfterStory", params: { title: title(later), past: title(earlier) }, severity: "warning" });
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

/** Événements où apparaît une fiche du monde (objet, faction…), dans l'ordre du plan. */
export function eventsOfEntry(data: PlotData, kind: PlotEntryRef["kind"], id: string): PlotEvent[] {
  return planOrder(data).filter((e) => e.entries.some((ref) => ref.kind === kind && ref.id === id));
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