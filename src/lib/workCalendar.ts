/*
 * Calendrier de travail du tableau de bord (comme les contributions de
 * GitHub) : une case par jour, de janvier à décembre, plus ou moins foncée
 * selon le volume de travail, et une détection du rythme (périodes
 * intenses, pauses, séries de jours travaillés).
 *
 * Le volume d'une journée est le nombre de minutes différentes pendant
 * lesquelles quelque chose a été enregistré : une estimation du temps passé.
 */

export interface DayWork {
  /** « 2026-10-12 » (heure locale). */
  day: string;
  minutes: number;
  actions: number;
}

/** Niveau d'intensité d'une case : 0 (rien) à 4 (journée très chargée). */
export type Level = 0 | 1 | 2 | 3 | 4;

/** Seuils fixes (minutes) quand il y a trop peu de jours pour les calculer. */
const DEFAULT_THRESHOLDS: [number, number, number] = [15, 60, 150];

const pad = (value: number) => String(value).padStart(2, "0");

/** « 2026-10-12 » sans passer par UTC (sinon décalage d'un jour). */
export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Lundi = 0 … dimanche = 6. */
export function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

/**
 * Seuils des niveaux 2, 3 et 4 : quartiles des jours travaillés de l'année
 * (le niveau s'adapte à votre rythme, comme sur GitHub). Avec moins de
 * 8 jours travaillés, seuils fixes : 15 min, 1 h, 2 h 30.
 */
export function levelThresholds(days: DayWork[]): [number, number, number] {
  const active = days.map((d) => d.minutes).filter((m) => m > 0).sort((a, b) => a - b);
  if (active.length < 8) return DEFAULT_THRESHOLDS;
  const t: [number, number, number] = [quantile(active, 0.25), quantile(active, 0.5), quantile(active, 0.75)];
  // Seuils strictement croissants, même si beaucoup de jours se ressemblent.
  t[1] = Math.max(t[1], t[0] + 1);
  t[2] = Math.max(t[2], t[1] + 1);
  return t;
}

export function levelOf(minutes: number, thresholds: [number, number, number]): Level {
  if (minutes <= 0) return 0;
  if (minutes < thresholds[0]) return 1;
  if (minutes < thresholds[1]) return 2;
  if (minutes < thresholds[2]) return 3;
  return 4;
}

export interface CalendarCell {
  day: string;
  date: Date;
  /** Colonne (semaine) et ligne (jour de la semaine, lundi en haut). */
  week: number;
  weekday: number;
  minutes: number;
  actions: number;
  /** Vrai : jour futur (case grisée, sans valeur). */
  future: boolean;
}

/**
 * Cases de l'année, du 1er janvier au 31 décembre, rangées en semaines
 * (colonnes) commençant le lundi. `today` sert à griser les jours à venir.
 */
export function buildYear(year: number, data: DayWork[], today: Date = new Date()): {
  cells: CalendarCell[];
  weeks: number;
  /** Première colonne de chaque mois (pour les libellés). */
  monthStarts: number[];
} {
  const byDay = new Map(data.map((d) => [d.day, d]));
  const first = new Date(year, 0, 1);
  const offset = weekdayIndex(first);
  const todayKey = isoDay(today);
  const cells: CalendarCell[] = [];
  const monthStarts: number[] = new Array(12).fill(0);

  for (let date = new Date(first); date.getFullYear() === year; date.setDate(date.getDate() + 1)) {
    const index = Math.round((date.getTime() - first.getTime()) / 86_400_000);
    const day = isoDay(date);
    const week = Math.floor((index + offset) / 7);
    if (date.getDate() === 1) monthStarts[date.getMonth()] = week;
    const work = byDay.get(day);
    cells.push({
      day,
      date: new Date(date),
      week,
      weekday: weekdayIndex(date),
      minutes: work?.minutes ?? 0,
      actions: work?.actions ?? 0,
      future: day > todayKey,
    });
  }

  return { cells, weeks: (cells[cells.length - 1]?.week ?? 0) + 1, monthStarts };
}

// ----------------------------------------------------------------------------
// Détection du volume de travail
// ----------------------------------------------------------------------------

export interface WorkSummary {
  totalMinutes: number;
  totalActions: number;
  activeDays: number;
  /** Jours écoulés de l'année (jusqu'à aujourd'hui, ou toute l'année passée). */
  elapsedDays: number;
  /** Jours travaillés par semaine, en moyenne sur la période écoulée. */
  daysPerWeek: number;
  /** Minutes par jour travaillé. */
  averageMinutes: number;
  longestStreak: { days: number; from: string; to: string } | null;
  /** Série en cours (jusqu'à aujourd'hui ou hier). */
  currentStreak: number;
  busiestDay: DayWork | null;
  /** Minutes par mois (janvier = 0). */
  months: number[];
  busiestMonth: number | null;
  /** Semaine la plus chargée (lundi de la semaine). */
  busiestWeek: { monday: string; minutes: number } | null;
  /** Plus longue pause entre deux jours travaillés (ou depuis le dernier). */
  longestBreak: { days: number; from: string; to: string } | null;
  /** Minutes par jour de la semaine (lundi = 0). */
  weekdays: number[];
  /** Jour de la semaine le plus travaillé (lundi = 0). */
  favoriteWeekday: number | null;
  /** Régularité : part des semaines écoulées avec au moins un jour travaillé (0 à 1). */
  regularity: number;
  /** Rythme détecté. */
  rhythm: "none" | "occasional" | "regular" | "intense";
  /** Tendance des 30 derniers jours par rapport aux 30 précédents (en %, `null` sans comparaison). */
  trend: number | null;
}

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / DAY);

function addDays(day: string, delta: number): string {
  const date = parseDay(day);
  date.setDate(date.getDate() + delta);
  return isoDay(date);
}

/** Analyse le volume de travail d'une année. */
export function summarize(year: number, data: DayWork[], today: Date = new Date()): WorkSummary {
  const todayKey = isoDay(today);
  const yearEnd = `${year}-12-31`;
  const end = todayKey < yearEnd ? todayKey : yearEnd;
  const start = `${year}-01-01`;
  const elapsedDays = end < start ? 0 : daysBetween(start, end) + 1;

  const days = data
    .filter((d) => d.minutes > 0 && d.day >= start && d.day <= end)
    .sort((a, b) => a.day.localeCompare(b.day));
  const byDay = new Map(days.map((d) => [d.day, d]));

  const totalMinutes = days.reduce((sum, d) => sum + d.minutes, 0);
  const totalActions = days.reduce((sum, d) => sum + d.actions, 0);
  const months = new Array(12).fill(0);
  const weekdays = new Array(7).fill(0);
  const weeks = new Map<string, number>();

  for (const d of days) {
    const date = parseDay(d.day);
    months[date.getMonth()] += d.minutes;
    weekdays[weekdayIndex(date)] += d.minutes;
    const monday = addDays(d.day, -weekdayIndex(date));
    weeks.set(monday, (weeks.get(monday) ?? 0) + d.minutes);
  }

  // Séries de jours consécutifs travaillés.
  let longestStreak: WorkSummary["longestStreak"] = null;
  let runStart: string | null = null;
  let previous: string | null = null;
  for (const d of days) {
    if (previous && daysBetween(previous, d.day) === 1) {
      // la série continue
    } else {
      runStart = d.day;
    }
    const length = daysBetween(runStart!, d.day) + 1;
    if (!longestStreak || length > longestStreak.days) longestStreak = { days: length, from: runStart!, to: d.day };
    previous = d.day;
  }

  // Série en cours : finit aujourd'hui, ou hier (la journée n'est pas finie).
  let currentStreak = 0;
  if (end === todayKey) {
    let cursor = byDay.has(todayKey) ? todayKey : addDays(todayKey, -1);
    while (byDay.has(cursor) && cursor >= start) {
      currentStreak++;
      cursor = addDays(cursor, -1);
    }
  }

  // Pauses : écarts entre deux jours travaillés, et depuis le dernier.
  let longestBreak: WorkSummary["longestBreak"] = null;
  for (let i = 1; i < days.length; i++) {
    const gap = daysBetween(days[i - 1].day, days[i].day) - 1;
    if (gap > 0 && (!longestBreak || gap > longestBreak.days)) {
      longestBreak = { days: gap, from: addDays(days[i - 1].day, 1), to: addDays(days[i].day, -1) };
    }
  }
  if (days.length) {
    const sinceLast = daysBetween(days[days.length - 1].day, end);
    if (sinceLast > 0 && (!longestBreak || sinceLast > longestBreak.days)) {
      longestBreak = { days: sinceLast, from: addDays(days[days.length - 1].day, 1), to: end };
    }
  }

  const busiestDay = days.reduce<DayWork | null>((best, d) => (!best || d.minutes > best.minutes ? d : best), null);
  const busiestMonthValue = Math.max(...months);
  const busiestWeekEntry = [...weeks.entries()].reduce<[string, number] | null>(
    (best, entry) => (!best || entry[1] > best[1] ? entry : best),
    null,
  );
  const favoriteValue = Math.max(...weekdays);

  const elapsedWeeks = Math.max(1, Math.ceil(elapsedDays / 7));
  const regularity = elapsedDays ? Math.min(1, weeks.size / elapsedWeeks) : 0;
  const daysPerWeek = elapsedDays ? (days.length / elapsedDays) * 7 : 0;
  const averageMinutes = days.length ? totalMinutes / days.length : 0;

  // Rythme : jours par semaine et temps moyen par jour travaillé.
  const rhythm: WorkSummary["rhythm"] =
    days.length === 0
      ? "none"
      : daysPerWeek >= 4 && averageMinutes >= 90
        ? "intense"
        : daysPerWeek >= 2 || regularity >= 0.6
          ? "regular"
          : "occasional";

  // Tendance : 30 derniers jours contre les 30 d'avant (si l'année le permet).
  let trend: number | null = null;
  if (end === todayKey) {
    const sum = (from: string, to: string) =>
      days.filter((d) => d.day >= from && d.day <= to).reduce((s, d) => s + d.minutes, 0);
    const recent = sum(addDays(end, -29), end);
    const before = sum(addDays(end, -59), addDays(end, -30));
    if (before > 0 && addDays(end, -59) >= start) trend = Math.round(((recent - before) / before) * 100);
  }

  return {
    totalMinutes,
    totalActions,
    activeDays: days.length,
    elapsedDays,
    daysPerWeek,
    averageMinutes,
    longestStreak,
    currentStreak,
    busiestDay,
    months,
    busiestMonth: busiestMonthValue > 0 ? months.indexOf(busiestMonthValue) : null,
    busiestWeek: busiestWeekEntry ? { monday: busiestWeekEntry[0], minutes: busiestWeekEntry[1] } : null,
    longestBreak,
    weekdays,
    favoriteWeekday: favoriteValue > 0 ? weekdays.indexOf(favoriteValue) : null,
    regularity,
    rhythm,
    trend,
  };
}

/** « 2 h 15 », « 45 min », « 0 min ». */
export function formatDuration(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${pad(m)}`;
}
