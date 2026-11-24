import { blockLines, linesToMinutes, sceneLines, type SceneEntry } from "@/lib/series";
import { FILM_BEATS, type FilmBeat, type SceneBlock } from "@/types";

/*
 * Outils du scénariste de film, sans état (testés) :
 * - numéros de scène, verrouillés pour le tournage (une scène ajoutée
 *   après la 12 devient 12A) ;
 * - repères de structure placés sur des scènes, comparés à la durée ;
 * - statistiques de parole par personnage ;
 * - scènes d'un comédien (extraits pour les auditions).
 */

// ----------------------------------------------------------------------------
// Numéros de scène
// ----------------------------------------------------------------------------

/** A, B… Z, AA, AB… */
function letters(n: number): string {
  let out = "";
  let k = n;
  do {
    out = String.fromCharCode(65 + (k % 26)) + out;
    k = Math.floor(k / 26) - 1;
  } while (k >= 0);
  return out;
}

/**
 * Numéro de chaque scène. Sans numéros verrouillés : 1, 2, 3… Avec : une
 * scène verrouillée garde le sien ; une scène ajoutée prend celui de la
 * précédente suivi d'une lettre (12A, 12B), ou, avant la première, une
 * lettre suivie du premier numéro (A1).
 */
export function sceneLabels(entries: Pick<SceneEntry, "scene">[], locked: Record<string, string>, base?: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  const hasLocked = entries.some((e) => locked[e.scene.id]);
  if (!hasLocked) {
    entries.forEach((e, i) => out.set(e.scene.id, base?.get(e.scene.id) ?? String(i + 1)));
    return out;
  }
  const firstLocked = entries.find((e) => locked[e.scene.id]);
  let previous: string | null = null;
  let added = 0;
  for (const entry of entries) {
    const label = locked[entry.scene.id];
    if (label) {
      previous = label;
      added = 0;
      out.set(entry.scene.id, label);
      continue;
    }
    out.set(entry.scene.id, previous ? `${previous}${letters(added)}` : `${letters(added)}${locked[firstLocked!.scene.id]}`);
    added += 1;
  }
  return out;
}

/** Verrouille les numéros actuels (ceux que l'on voit) de toutes les scènes. */
export function lockNumbers(entries: Pick<SceneEntry, "scene">[], locked: Record<string, string>, base?: Map<string, string>): Record<string, string> {
  return Object.fromEntries(sceneLabels(entries, locked, base));
}

/**
 * Numéros d'une série : épisode puis scène dans l'épisode (« 2.5 » :
 * cinquième scène du deuxième épisode), comme sur les scénarios de
 * tournage d'une série.
 */
export function episodeSceneLabels(entries: Pick<SceneEntry, "scene" | "episode">[]): Map<string, string> {
  const out = new Map<string, string>();
  const episodes: Array<string | null> = [];
  const counts = new Map<string | null, number>();
  for (const entry of entries) {
    const id = entry.episode?.id ?? null;
    if (!episodes.includes(id)) episodes.push(id);
    const n = (counts.get(id) ?? 0) + 1;
    counts.set(id, n);
    out.set(entry.scene.id, `${episodes.indexOf(id) + 1}.${n}`);
  }
  return out;
}

// ----------------------------------------------------------------------------
// Durées
// ----------------------------------------------------------------------------

/** Minute à laquelle commence chaque scène, et durée de chacune. */
export function sceneTimes(entries: Pick<SceneEntry, "scene">[], blocks: Map<string, SceneBlock[]>): Map<string, { start: number; minutes: number }> {
  const out = new Map<string, { start: number; minutes: number }>();
  let lines = 0;
  for (const entry of entries) {
    const own = sceneLines(blocks.get(entry.scene.id) ?? []);
    out.set(entry.scene.id, { start: linesToMinutes(lines), minutes: linesToMinutes(own) });
    lines += own;
  }
  return out;
}

// ----------------------------------------------------------------------------
// Repères de structure
// ----------------------------------------------------------------------------

/** Place attendue de chaque moment clé, en part de la durée du film. */
export const BEAT_TARGETS: Record<FilmBeat, number> = {
  inciting: 0.12,
  plot1: 0.25,
  midpoint: 0.5,
  plot2: 0.75,
  climax: 0.9,
};

/** Écart toléré avant de signaler un repère trop tôt ou trop tard. */
export const BEAT_TOLERANCE = 0.05;

export interface BeatReport {
  beat: FilmBeat;
  /** Scène choisie (absente : repère non placé). */
  sceneId: string | null;
  /** Minute attendue (part attendue de la durée de référence). */
  expected: number;
  /** Minute où tombe la scène, et sa part de la durée de référence. */
  minute: number | null;
  share: number | null;
  verdict: "missing" | "early" | "onTime" | "late";
}

/**
 * Où tombent les moments clés : chaque scène choisie, à sa minute, comparée
 * à la place attendue. La durée de référence est la durée visée du film,
 * sinon sa durée estimée.
 */
export function beatsReport(
  beats: Partial<Record<FilmBeat, string>>,
  times: Map<string, { start: number; minutes: number }>,
  runtime: number,
): BeatReport[] {
  return FILM_BEATS.map((beat) => {
    const expected = Math.round(BEAT_TARGETS[beat] * runtime * 10) / 10;
    const sceneId = beats[beat] && times.has(beats[beat]!) ? beats[beat]! : null;
    if (!sceneId || runtime <= 0) return { beat, sceneId, expected, minute: null, share: null, verdict: "missing" };
    const minute = times.get(sceneId)!.start;
    const share = minute / runtime;
    const gap = share - BEAT_TARGETS[beat];
    const verdict = Math.abs(gap) <= BEAT_TOLERANCE ? "onTime" : gap < 0 ? "early" : "late";
    return { beat, sceneId, expected, minute, share, verdict };
  });
}

// ----------------------------------------------------------------------------
// Statistiques de parole
// ----------------------------------------------------------------------------

export interface SpeakingStats {
  characterId: string;
  /** Répliques écrites. */
  lines: number;
  /** Temps de parole estimé (minutes). */
  minutes: number;
  /** Scènes où le personnage parle ou figure. */
  scenes: number;
  /** Temps de parole par acte (clé : identifiant de l'acte, ou « » sans acte). */
  byAct: Map<string, number>;
  /** Plus longue absence entre deux apparitions (minutes), et à partir de quand. */
  longestGap: number;
  gapFrom: number | null;
}

/**
 * Parole de chaque personnage : répliques, minutes (à la page-minute),
 * scènes, minutes par acte, et plus longue absence entre deux scènes où il
 * apparaît. Les présences sans réplique viennent de `present` (personnages
 * liés à la scène).
 */
export function speakingStats(
  entries: SceneEntry[],
  blocks: Map<string, SceneBlock[]>,
  present: Map<string, Set<string>> = new Map(),
  /** Regroupement des minutes : l'acte (film, par défaut) ou l'épisode (série). */
  groupOf: (entry: SceneEntry) => string = (entry) => entry.season?.id ?? "",
): SpeakingStats[] {
  const times = sceneTimes(entries, blocks);
  const stats = new Map<string, SpeakingStats & { seen: number[] }>();
  const of = (id: string) => {
    let s = stats.get(id);
    if (!s) {
      s = { characterId: id, lines: 0, minutes: 0, scenes: 0, byAct: new Map(), longestGap: 0, gapFrom: null, seen: [] };
      stats.set(id, s);
    }
    return s;
  };
  for (const entry of entries) {
    const time = times.get(entry.scene.id)!;
    const here = new Set(present.get(entry.scene.id) ?? []);
    const act = groupOf(entry);
    for (const block of blocks.get(entry.scene.id) ?? []) {
      if (block.kind !== "dialogue" || !block.characterId || !block.content.trim()) continue;
      const s = of(block.characterId);
      const minutes = linesToMinutes(blockLines(block));
      s.lines += 1;
      s.minutes += minutes;
      s.byAct.set(act, (s.byAct.get(act) ?? 0) + minutes);
      here.add(block.characterId);
    }
    for (const id of here) {
      const s = of(id);
      s.scenes += 1;
      s.seen.push(time.start);
    }
  }
  return [...stats.values()]
    .map(({ seen, ...s }) => {
      for (let i = 1; i < seen.length; i += 1) {
        const gap = seen[i] - seen[i - 1];
        if (gap > s.longestGap) {
          s.longestGap = Math.round(gap * 10) / 10;
          s.gapFrom = seen[i - 1];
        }
      }
      return { ...s, minutes: Math.round(s.minutes * 10) / 10 };
    })
    .sort((a, b) => b.minutes - a.minutes || b.lines - a.lines);
}

// ----------------------------------------------------------------------------
// Scènes d'un comédien
// ----------------------------------------------------------------------------

/** Scènes où le personnage parle ou figure (extraits pour les auditions). */
export function scenesOfCharacter(
  entries: SceneEntry[],
  blocks: Map<string, SceneBlock[]>,
  characterId: string,
  present: Map<string, Set<string>> = new Map(),
): SceneEntry[] {
  return entries.filter(
    (e) => present.get(e.scene.id)?.has(characterId) || (blocks.get(e.scene.id) ?? []).some((b) => b.kind === "dialogue" && b.characterId === characterId),
  );
}

/** Éléments modifiés pendant la révision commencée à `since`. */
export function revisedBlocks(blocks: SceneBlock[], since: string | null | undefined): Set<string> {
  if (!since) return new Set();
  return new Set(blocks.filter((b) => b.updatedAt && b.updatedAt > since).map((b) => b.id));
}
