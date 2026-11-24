import { chapterLevel, sceneLevel } from "@/lib/novel";
import type { ExportBlock, ExportDocument } from "@/lib/novelExport";
import { buildStructureTree, flattenVisible } from "@/lib/structure";
import type {
  Character,
  EpisodeFields,
  EpisodeStatus,
  FilmDetails,
  Location,
  Project,
  SceneBlock,
  ScenePlace,
  SceneScript,
  SceneScriptInput,
  SceneTime,
  ScreenplayKind,
  StructureNode,
} from "@/types";

/*
 * Scénario de série ou de film : brouillon d'une scène, en-tête (INT. LIEU —
 * NUIT), durée estimée (règle de la page-minute), ordre des scènes, suivi
 * des épisodes (série) ou des séquences (film) et export (Word, PDF, texte,
 * Fountain).
 *
 * Un film reprend le découpage de la série : ses actes tiennent la place
 * des saisons, ses séquences celle des épisodes (Acte › Séquence › Scène).
 * Sa logline, sa durée visée et son scénariste valent pour le film entier
 * (`FilmDetails`).
 */

export function isSeriesProject(project: Pick<Project, "type"> | null | undefined): boolean {
  return project?.type === "series";
}

export function isFilmProject(project: Pick<Project, "type"> | null | undefined): boolean {
  return project?.type === "film";
}

/** Fiche d'un film jamais remplie. */
export const EMPTY_FILM: FilmDetails = {
  logline: "",
  runtimeGoal: null,
  writer: "",
  intention: "",
  pitch: "",
  beats: {},
  revision: null,
  lockedNumbers: {},
};

/** Projet écrit au format du scénario, scène par scène : série ou film. */
export function isScreenplayProject(project: Pick<Project, "type"> | null | undefined): boolean {
  return isSeriesProject(project) || isFilmProject(project);
}

/**
 * Niveaux du découpage : épisodes et scènes (Saison › Épisode › Scène) ;
 * pour un film, séquences et scènes (Acte › Séquence › Scène).
 */
export function seriesLevels(levelCount: number) {
  return { episode: chapterLevel(levelCount), scene: sceneLevel(levelCount) };
}

// ----------------------------------------------------------------------------
// Statuts des épisodes
// ----------------------------------------------------------------------------

export const EPISODE_STATUS_COLORS: Record<EpisodeStatus, string> = {
  idea: "#94a3b8",
  outline: "#6d8ee0",
  draft: "#e3a21a",
  revision: "#e0483d",
  final: "#1fa37a",
};

export const episodeStatusOf = (node: Pick<StructureNode, "episodeStatus">): EpisodeStatus => node.episodeStatus ?? "idea";

/** Fiche d'un épisode telle qu'enregistrée : à compléter des changements, jamais à recomposer à la main. */
export function episodeFieldsOf(node: Pick<StructureNode, "logline" | "runtimeGoal" | "episodeStatus" | "writer" | "dueDate">): EpisodeFields {
  return { logline: node.logline, runtimeGoal: node.runtimeGoal, episodeStatus: node.episodeStatus, writer: node.writer, dueDate: node.dueDate ?? null };
}

/** Échéance dépassée : date passée et épisode pas encore validé. */
export function isOverdue(node: Pick<StructureNode, "dueDate" | "episodeStatus">, today = new Date().toISOString().slice(0, 10)): boolean {
  return !!node.dueDate && node.dueDate < today && episodeStatusOf(node) !== "final";
}

// ----------------------------------------------------------------------------
// Brouillon d'une scène
// ----------------------------------------------------------------------------

export interface DraftBlock {
  /** Clé locale (stable pendant l'édition). */
  key: string;
  id?: string;
  kind: ScreenplayKind;
  characterId: string | null;
  parenthetical: string;
  content: string;
}

export interface SceneDraft {
  place: ScenePlace | null;
  locationId: string | null;
  time: SceneTime | null;
  blocks: DraftBlock[];
}

let keySeed = 0;
const newKey = () => `b${Date.now().toString(36)}${(++keySeed).toString(36)}`;

export function sceneDraftFromScript(script: SceneScript): SceneDraft {
  return {
    place: script.scene.scenePlace,
    locationId: script.scene.sceneLocationId,
    time: script.scene.sceneTime,
    blocks: script.blocks.map((b) => ({
      key: b.id,
      id: b.id,
      kind: b.kind,
      characterId: b.characterId,
      parenthetical: b.parenthetical,
      content: b.content,
    })),
  };
}

export function newBlock(kind: ScreenplayKind, characterId: string | null = null): DraftBlock {
  return { key: newKey(), kind, characterId: kind === "dialogue" ? characterId : null, parenthetical: "", content: "" };
}

/** Change le type d'un élément ; personnage et didascalie ne restent qu'à un dialogue. */
export function withKind(block: DraftBlock, kind: ScreenplayKind): DraftBlock {
  return kind === "dialogue" ? { ...block, kind } : { ...block, kind, characterId: null, parenthetical: "" };
}

/**
 * Type proposé pour l'élément suivant (Entrée en fin d'élément) : après une
 * réplique, l'autre personnage répond ; après une transition, l'action
 * reprend ; sinon, même type.
 */
export function nextBlockAfter(block: DraftBlock | undefined, blocks: DraftBlock[]): DraftBlock {
  if (!block) return newBlock("action");
  if (block.kind === "dialogue") {
    // Le dernier autre personnage qui a parlé avant cette réplique.
    const index = blocks.indexOf(block);
    const other = blocks
      .slice(0, index < 0 ? blocks.length : index)
      .reverse()
      .find((b) => b.kind === "dialogue" && b.characterId && b.characterId !== block.characterId);
    return newBlock("dialogue", other?.characterId ?? null);
  }
  if (block.kind === "transition" || block.kind === "shot") return newBlock("action");
  return newBlock(block.kind);
}

export function inputFromSceneDraft(draft: SceneDraft): SceneScriptInput {
  return {
    place: draft.place,
    locationId: draft.locationId,
    time: draft.time,
    blocks: draft.blocks.map((b) => ({
      id: b.id,
      kind: b.kind,
      characterId: b.kind === "dialogue" ? b.characterId : null,
      parenthetical: b.kind === "dialogue" ? b.parenthetical : "",
      content: b.content,
    })),
  };
}

/** Forme comparable (sans les clés locales) : deux brouillons égaux ont la même. */
export function sceneDraftSignature(draft: SceneDraft): string {
  return JSON.stringify(inputFromSceneDraft(draft));
}

// ----------------------------------------------------------------------------
// En-tête de scène
// ----------------------------------------------------------------------------

export interface HeadingLabels {
  place: (value: ScenePlace) => string;
  time: (value: SceneTime) => string;
}

/** « INT. CUISINE — NUIT » ; vide si rien n'est renseigné. */
export function sceneHeadingText(
  scene: Pick<StructureNode, "scenePlace" | "sceneLocationId" | "sceneTime">,
  locationName: (id: string) => string | null,
  labels: HeadingLabels,
): string {
  const place = scene.scenePlace ? labels.place(scene.scenePlace) : "";
  const where = scene.sceneLocationId ? (locationName(scene.sceneLocationId) ?? "") : "";
  const when = scene.sceneTime ? labels.time(scene.sceneTime) : "";
  const left = [place, where].filter(Boolean).join(" ");
  return [left, when].filter(Boolean).join(" — ").toUpperCase();
}

// ----------------------------------------------------------------------------
// Durée estimée : une page de scénario ≈ une minute à l'écran
// ----------------------------------------------------------------------------

/** Lignes d'une page de scénario au format standard. */
export const LINES_PER_PAGE = 55;
/** Caractères par ligne : action pleine largeur, réplique en colonne étroite. */
const ACTION_WIDTH = 60;
const DIALOGUE_WIDTH = 35;

const wrapped = (text: string, width: number) =>
  text
    .split("\n")
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.trim().length / width)), 0);

/** Lignes occupées par un élément, interligne suivant compris. */
export function blockLines(block: Pick<SceneBlock, "kind" | "parenthetical" | "content">): number {
  const content = block.content.trim();
  switch (block.kind) {
    case "note":
      return 0;
    case "dialogue":
      // Nom du personnage, didascalie, réplique, interligne.
      return 1 + (block.parenthetical.trim() ? 1 : 0) + (content ? wrapped(content, DIALOGUE_WIDTH) : 1) + 1;
    case "transition":
    case "shot":
      return 2;
    default:
      return content ? wrapped(content, ACTION_WIDTH) + 1 : 0;
  }
}

/** Lignes d'une scène : en-tête (et interligne), puis ses éléments. */
export function sceneLines(blocks: Array<Pick<SceneBlock, "kind" | "parenthetical" | "content">>): number {
  const body = blocks.reduce((sum, block) => sum + blockLines(block), 0);
  return body > 0 ? body + 2 : 0;
}

/** Pages (≈ minutes) d'un nombre de lignes, au dixième. */
export function linesToMinutes(lines: number): number {
  return Math.round((lines / LINES_PER_PAGE) * 10) / 10;
}

/** « 12 min », « 1 h 05 », « < 1 min ». */
export function formatMinutes(minutes: number, labels: { lessThanOne: string; minutes: (n: number) => string; hours: (h: number, m: string) => string }): string {
  if (minutes <= 0) return labels.minutes(0);
  if (minutes < 1) return labels.lessThanOne;
  const rounded = Math.round(minutes);
  if (rounded < 60) return labels.minutes(rounded);
  return labels.hours(Math.floor(rounded / 60), String(rounded % 60).padStart(2, "0"));
}

// ----------------------------------------------------------------------------
// Ordre des scènes et suivi
// ----------------------------------------------------------------------------

export interface SceneEntry {
  scene: StructureNode;
  episode: StructureNode | null;
  season: StructureNode | null;
}

/** Scènes dans l'ordre du plan, avec leur épisode et leur saison. */
export function scenesInOrder(nodes: StructureNode[], levelCount: number): SceneEntry[] {
  const { episode, scene } = seriesLevels(levelCount);
  const seasonLevel = episode - 1;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ancestorAt = (node: StructureNode, level: number): StructureNode | null => {
    if (level < 0) return null;
    let current = node.parentId ? byId.get(node.parentId) : undefined;
    while (current && current.level > level) current = current.parentId ? byId.get(current.parentId) : undefined;
    return current && current.level === level ? current : null;
  };
  return flattenVisible(buildStructureTree(nodes), new Set())
    .filter((n) => n.level >= scene && scene > episode)
    .map((n) => ({ scene: n, episode: ancestorAt(n, episode), season: ancestorAt(n, seasonLevel) }));
}

/**
 * Numéro de chaque scène dans tout le scénario (1, 2, 3…), comme sur un
 * scénario de tournage : il ne change pas quand on n'en affiche qu'une partie.
 */
export function sceneNumbers(entries: SceneEntry[]): Map<string, number> {
  return new Map(entries.map((entry, index) => [entry.scene.id, index + 1]));
}

/** Épisodes dans l'ordre du plan. */
export function episodesInOrder(nodes: StructureNode[], levelCount: number): StructureNode[] {
  const { episode } = seriesLevels(levelCount);
  return flattenVisible(buildStructureTree(nodes), new Set()).filter((n) => n.level === episode);
}

/** Éléments regroupés par scène, dans l'ordre de chaque scène. */
export function blocksByScene(blocks: SceneBlock[]): Map<string, SceneBlock[]> {
  const map = new Map<string, SceneBlock[]>();
  for (const block of blocks) {
    const list = map.get(block.sceneId);
    if (list) list.push(block);
    else map.set(block.sceneId, [block]);
  }
  for (const list of map.values()) list.sort((a, b) => a.position - b.position);
  return map;
}

export interface EpisodeProgress {
  episode: StructureNode;
  scenes: number;
  /** Scènes qui ont au moins un élément écrit. */
  writtenScenes: number;
  /** Durée estimée (minutes). */
  minutes: number;
  /** Répliques par personnage. */
  lines: Map<string, number>;
}

/** Avancement de chaque épisode, dans l'ordre du plan. */
export function episodeProgress(nodes: StructureNode[], levelCount: number, blocks: SceneBlock[]): EpisodeProgress[] {
  const byScene = blocksByScene(blocks);
  const progress = new Map<string, EpisodeProgress>(
    episodesInOrder(nodes, levelCount).map((episode) => [episode.id, { episode, scenes: 0, writtenScenes: 0, minutes: 0, lines: new Map() }]),
  );
  const linesOf = new Map<string, number>();
  for (const entry of scenesInOrder(nodes, levelCount)) {
    const item = entry.episode ? progress.get(entry.episode.id) : undefined;
    if (!item) continue;
    const sceneBlocks = byScene.get(entry.scene.id) ?? [];
    item.scenes += 1;
    if (sceneBlocks.some((b) => b.kind !== "note" && b.content.trim())) item.writtenScenes += 1;
    linesOf.set(item.episode.id, (linesOf.get(item.episode.id) ?? 0) + sceneLines(sceneBlocks));
    for (const block of sceneBlocks) {
      if (block.kind === "dialogue" && block.characterId && block.content.trim()) {
        item.lines.set(block.characterId, (item.lines.get(block.characterId) ?? 0) + 1);
      }
    }
  }
  for (const item of progress.values()) item.minutes = linesToMinutes(linesOf.get(item.episode.id) ?? 0);
  return [...progress.values()];
}

// ----------------------------------------------------------------------------
// Export
// ----------------------------------------------------------------------------

export interface SeriesExportLabels extends HeadingLabels {
  subtitle: string;
  /** En-tête d'une scène sans en-tête renseigné. */
  untitledScene: (label: string) => string;
  logline: string;
  writer: string;
  noScript: string;
}

export interface SeriesExportInput {
  project: Pick<Project, "name">;
  entries: SceneEntry[];
  blocks: Map<string, SceneBlock[]>;
  labelOf: (node: StructureNode) => string;
  characters: Character[];
  locations: Location[];
  nameOf: (character: Character) => string;
  labels: SeriesExportLabels;
  /**
   * Fiche du film : l'export suit alors la forme d'un long métrage — une
   * seule page de titre (scénariste, logline), scènes numérotées, sans titre
   * d'acte ni de séquence (ils ne s'impriment pas dans un scénario de film).
   */
  film?: FilmDetails | null;
  /** Numéros des scènes dans tout le film (sinon : leur rang dans l'export). */
  numbers?: Map<string, number | string>;
}

/** Numéro d'une scène dans l'export d'un film. */
function numberOf(input: SeriesExportInput, sceneId: string, index: number): number | string {
  return input.numbers?.get(sceneId) ?? index + 1;
}

/** Nom d'un personnage en capitales (convention du scénario). */
function speakerName(input: Pick<SeriesExportInput, "characters" | "nameOf">, id: string | null): string {
  const character = id ? input.characters.find((c) => c.id === id) : undefined;
  return character ? input.nameOf(character).toUpperCase() : "";
}

/** Document du scénario : épisodes, scènes avec leur en-tête, puis les éléments. */
export function buildSeriesExport(input: SeriesExportInput): ExportDocument {
  const { labels } = input;
  const locationName = (id: string) => input.locations.find((l) => l.id === id)?.name ?? null;
  const out: ExportBlock[] = [];
  let currentSeason: string | null | undefined;
  let currentEpisode: string | null | undefined;
  const film = input.film ?? null;

  input.entries.forEach((entry, index) => {
    const seasonId = entry.season?.id ?? null;
    if (!film && seasonId !== currentSeason) {
      currentSeason = seasonId;
      if (entry.season) out.push({ type: "heading", level: 1, text: input.labelOf(entry.season), pageBreakBefore: out.length > 0 });
    }
    const episodeId = entry.episode?.id ?? null;
    if (!film && episodeId !== currentEpisode) {
      currentEpisode = episodeId;
      if (entry.episode) {
        const firstOfSeason = out.length > 0 && out[out.length - 1].type === "heading" && (out[out.length - 1] as { level: number }).level === 1;
        out.push({ type: "heading", level: 2, text: input.labelOf(entry.episode), pageBreakBefore: out.length > 0 && !firstOfSeason });
        if (entry.episode.logline.trim()) out.push({ type: "paragraph", runs: [{ text: `${labels.logline} `, bold: true }, { text: entry.episode.logline.trim(), italics: true }] });
        if (entry.episode.writer.trim()) out.push({ type: "paragraph", runs: [{ text: `${labels.writer} `, bold: true }, { text: entry.episode.writer.trim() }] });
      }
    }

    const heading = sceneHeadingText(entry.scene, locationName, labels) || labels.untitledScene(input.labelOf(entry.scene)).toUpperCase();
    out.push({ type: "heading", level: 3, text: film ? `${numberOf(input, entry.scene.id, index)}. ${heading}` : heading });
    const blocks = (input.blocks.get(entry.scene.id) ?? []).filter((b) => b.kind !== "note" && b.content.trim());
    if (!blocks.length) {
      out.push({ type: "paragraph", runs: [{ text: labels.noScript, italics: true }] });
      return;
    }
    for (const block of blocks) {
      const content = block.content.trim();
      if (block.kind === "dialogue") {
        out.push({ type: "paragraph", runs: [{ text: speakerName(input, block.characterId) || "—", bold: true }], inset: 4 });
        if (block.parenthetical.trim()) out.push({ type: "paragraph", runs: [{ text: `(${block.parenthetical.trim()})`, italics: true }], inset: 3 });
        out.push({ type: "paragraph", runs: [{ text: content }], inset: 2 });
      } else if (block.kind === "transition") {
        out.push({ type: "paragraph", runs: [{ text: content.toUpperCase(), bold: true }], align: "right" });
      } else if (block.kind === "shot") {
        out.push({ type: "paragraph", runs: [{ text: content.toUpperCase(), bold: true }] });
      } else {
        out.push({ type: "paragraph", runs: [{ text: content }] });
      }
    }
  });

  const subtitle = [labels.subtitle];
  if (film?.writer.trim()) subtitle.push(`${labels.writer} ${film.writer.trim()}`);
  if (film?.logline.trim()) subtitle.push(film.logline.trim().replace(/\s+/g, " "));
  return { title: input.project.name, subtitle, titlePage: true, layout: "script", monospace: true, blocks: out };
}

/**
 * Scénario au format Fountain (texte brut lu par les logiciels de
 * scénario : Final Draft, Highland, WriterDuet…). Les en-têtes de scène sont
 * forcés par un point, les personnages par « @ », les transitions par « > ».
 */
export function buildFountain(input: SeriesExportInput): string {
  const { labels } = input;
  const locationName = (id: string) => input.locations.find((l) => l.id === id)?.name ?? null;
  const film = input.film ?? null;
  const oneLine = (text: string) => text.trim().replace(/\s+/g, " ");
  const lines: string[] = [`Title: ${input.project.name}`, `Credit: ${labels.subtitle}`];
  if (film?.writer.trim()) lines.push(`Author: ${oneLine(film.writer)}`);
  if (film?.logline.trim()) lines.push(`Notes: ${oneLine(film.logline)}`);
  lines.push("");
  const header = lines.length;
  let currentSeason: string | null | undefined;
  let currentEpisode: string | null | undefined;
  // Une ligne commençant par un caractère spécial de Fountain est échappée.
  const safe = (text: string) => text.replace(/^([.!@#>~=])/gm, "\\$1");

  input.entries.forEach((entry, index) => {
    const seasonId = entry.season?.id ?? null;
    if (!film && seasonId !== currentSeason) {
      currentSeason = seasonId;
      if (entry.season) lines.push(`# ${input.labelOf(entry.season)}`, "");
    }
    const episodeId = entry.episode?.id ?? null;
    if (!film && episodeId !== currentEpisode) {
      currentEpisode = episodeId;
      if (entry.episode) {
        if (lines.length > header) lines.push("===", "");
        lines.push(`## ${input.labelOf(entry.episode)}`, "");
        if (entry.episode.logline.trim()) lines.push(`= ${entry.episode.logline.trim().replace(/\s+/g, " ")}`, "");
      }
    }
    const heading = sceneHeadingText(entry.scene, locationName, labels) || labels.untitledScene(input.labelOf(entry.scene)).toUpperCase();
    // Fountain : le numéro de scène s'écrit entre dièses en fin d'en-tête.
    lines.push(film ? `.${heading} #${numberOf(input, entry.scene.id, index)}#` : `.${heading}`, "");
    for (const block of input.blocks.get(entry.scene.id) ?? []) {
      const content = block.content.trim();
      if (!content) continue;
      if (block.kind === "note") lines.push(`[[${content.replace(/\]\]/g, "] ]")}]]`, "");
      else if (block.kind === "dialogue") {
        lines.push(`@${speakerName(input, block.characterId) || "?"}`);
        if (block.parenthetical.trim()) lines.push(`(${block.parenthetical.trim().replace(/^\(|\)$/g, "")})`);
        // Une ligne vide couperait la réplique : deux espaces la gardent.
        lines.push(safe(content).replace(/\n\s*\n/g, "\n  \n"), "");
      } else if (block.kind === "transition") lines.push(`> ${content.toUpperCase()}`, "");
      else if (block.kind === "shot") lines.push(`!${content.toUpperCase()}`, "");
      else lines.push(`!${content}`, "");
    }
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
