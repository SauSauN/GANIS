import type { ExportBlock, ExportDocument } from "@/lib/novelExport";
import { episodesInOrder, scenesInOrder, seriesLevels, type SceneEntry } from "@/lib/series";
import type { Project, SceneBlock, SceneBreakdown, ScenePlace, SceneTime, StructureNode, FilmDetails } from "@/types";

/*
 * Documents du film (testés) : séquencier, traitement, dossier de
 * financement, fiches de dépouillement et plan de travail.
 */

// ----------------------------------------------------------------------------
// Séquencier et traitement
// ----------------------------------------------------------------------------

export interface OutlineSequence {
  node: StructureNode;
  scenes: number;
  minutes: number;
}

export interface OutlineGroup {
  act: StructureNode | null;
  sequences: OutlineSequence[];
}

/** Séquencier : les séquences dans l'ordre, par acte, avec leurs scènes et leur durée. */
export function stepOutline(nodes: StructureNode[], levelCount: number, times: Map<string, { start: number; minutes: number }>): OutlineGroup[] {
  const sequences = episodesInOrder(nodes, levelCount);
  const scenes = scenesInOrder(nodes, levelCount);
  const actLevel = seriesLevels(levelCount).episode - 1;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const actOf = (node: StructureNode): StructureNode | null => {
    let current = node.parentId ? byId.get(node.parentId) : undefined;
    while (current && current.level > actLevel) current = current.parentId ? byId.get(current.parentId) : undefined;
    return actLevel >= 0 && current?.level === actLevel ? current : null;
  };
  const groups: OutlineGroup[] = [];
  for (const node of sequences) {
    const own = scenes.filter((e) => e.episode?.id === node.id);
    const item = { node, scenes: own.length, minutes: Math.round(own.reduce((sum, e) => sum + (times.get(e.scene.id)?.minutes ?? 0), 0) * 10) / 10 };
    const act = actOf(node);
    const last = groups[groups.length - 1];
    if (last && last.act?.id === act?.id) last.sequences.push(item);
    else groups.push({ act, sequences: [item] });
  }
  return groups;
}

export interface TreatmentScene {
  entry: SceneEntry;
  /** Résumé de la scène ; à défaut, sa première action. */
  text: string;
}

/** Traitement : le récit scène par scène, sans dialogues. */
export function treatment(entries: SceneEntry[], blocks: Map<string, SceneBlock[]>): TreatmentScene[] {
  return entries.map((entry) => ({
    entry,
    text: entry.scene.summary.trim() || (blocks.get(entry.scene.id) ?? []).find((b) => b.kind === "action" && b.content.trim())?.content.trim() || "",
  }));
}

// ----------------------------------------------------------------------------
// Dossier de financement
// ----------------------------------------------------------------------------

export interface DossierInput {
  project: Pick<Project, "name">;
  details: FilmDetails;
  /** Synopsis du projet (Détails › Synopsis), déjà en blocs. */
  synopsis: ExportBlock[];
  outline: OutlineGroup[];
  scenes: TreatmentScene[];
  labelOf: (node: StructureNode) => string;
  headingOf: (scene: StructureNode) => string;
  numbers: Map<string, string>;
  duration: (minutes: number) => string;
  characters: Array<{ name: string; role: string; description: string }>;
  labels: {
    subtitle: string;
    writer: string;
    logline: string;
    pitch: string;
    intention: string;
    synopsis: string;
    characters: string;
    outline: string;
    treatment: string;
    runtime: (duration: string) => string;
  };
}

const paragraphs = (text: string): ExportBlock[] =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ type: "paragraph", runs: [{ text: p }] }));

/**
 * Dossier du film : page de titre, pitch, intention, synopsis (celui du
 * projet), personnages, séquencier et traitement (calculés à partir du
 * découpage).
 */
export function buildFilmDossier(input: DossierInput): ExportDocument {
  const { details, labels } = input;
  const blocks: ExportBlock[] = [];
  const section = (title: string, body: ExportBlock[]) => {
    if (!body.length) return;
    blocks.push({ type: "heading", level: 1, text: title, pageBreakBefore: blocks.length > 0 }, ...body);
  };
  const top: ExportBlock[] = [];
  if (details.logline.trim()) top.push({ type: "paragraph", runs: [{ text: `${labels.logline} `, bold: true }, { text: details.logline.trim(), italics: true }] });
  top.push(...paragraphs(details.pitch));
  section(labels.pitch, top);
  section(labels.intention, paragraphs(details.intention));
  section(labels.synopsis, input.synopsis);
  section(
    labels.characters,
    input.characters.flatMap((c) => [
      { type: "heading" as const, level: 3 as const, text: `${c.name} — ${c.role}` },
      ...(c.description.trim() ? paragraphs(c.description) : []),
    ]),
  );
  section(
    labels.outline,
    input.outline.flatMap((group) => [
      ...(group.act ? [{ type: "heading" as const, level: 2 as const, text: input.labelOf(group.act) }] : []),
      ...group.sequences.map(
        (s): ExportBlock => ({
          type: "paragraph",
          runs: [{ text: `${input.labelOf(s.node)} — `, bold: true }, { text: s.node.summary.trim() || "…" }, { text: ` (${input.duration(s.minutes)})`, italics: true }],
        }),
      ),
    ]),
  );
  section(
    labels.treatment,
    input.scenes.flatMap((s): ExportBlock[] => [
      { type: "heading", level: 3, text: `${input.numbers.get(s.entry.scene.id) ?? ""}. ${input.headingOf(s.entry.scene)}` },
      ...(s.text ? paragraphs(s.text) : []),
    ]),
  );
  const subtitle = [labels.subtitle];
  if (details.writer.trim()) subtitle.push(`${labels.writer} ${details.writer.trim()}`);
  if (details.runtimeGoal) subtitle.push(labels.runtime(input.duration(details.runtimeGoal)));
  return { title: input.project.name, subtitle, titlePage: true, blocks };
}

// ----------------------------------------------------------------------------
// Dépouillement et plan de travail
// ----------------------------------------------------------------------------

/** Une scène telle que la régie la voit. */
export interface BreakdownScene {
  sceneId: string;
  number: string;
  heading: string;
  place: ScenePlace | null;
  time: SceneTime | null;
  /** Lieu de l'en-tête (identifiant de fiche, et nom). */
  locationId: string | null;
  location: string;
  minutes: number;
  /** Personnages (nom, état dans la scène). */
  cast: Array<{ id: string; name: string; state: string }>;
  /** Fiches du monde liées (objets, animaux…), par sorte. */
  entries: Array<{ kind: string; name: string }>;
  breakdown: SceneBreakdown;
}

/** Moment de la journée pour le plan de travail : jour, nuit, ou non précisé. */
export function dayOrNight(time: SceneTime | null): "day" | "night" | "unknown" {
  if (!time) return "unknown";
  return time === "night" || time === "evening" || time === "dusk" ? "night" : time === "continuous" || time === "later" ? "unknown" : "day";
}

export interface ScheduleGroup {
  /** Décor (nom du lieu ; vide : sans lieu). */
  location: string;
  place: ScenePlace | null;
  moment: "day" | "night" | "unknown";
  scenes: BreakdownScene[];
  minutes: number;
  cast: string[];
}

/**
 * Plan de travail : les scènes regroupées par décor, intérieur ou
 * extérieur, et jour ou nuit — on tourne ensemble ce qui se tourne au même
 * endroit dans la même lumière. Les groupes les plus longs d'abord, dans
 * chaque décor.
 */
export function shootingSchedule(scenes: BreakdownScene[]): ScheduleGroup[] {
  const groups = new Map<string, ScheduleGroup>();
  for (const scene of scenes) {
    const moment = dayOrNight(scene.time);
    const key = `${scene.location}\u0000${scene.place ?? ""}\u0000${moment}`;
    let group = groups.get(key);
    if (!group) {
      group = { location: scene.location, place: scene.place, moment, scenes: [], minutes: 0, cast: [] };
      groups.set(key, group);
    }
    group.scenes.push(scene);
    group.minutes = Math.round((group.minutes + scene.minutes) * 10) / 10;
    for (const c of scene.cast) if (!group.cast.includes(c.name)) group.cast.push(c.name);
  }
  return [...groups.values()].sort(
    (a, b) => a.location.localeCompare(b.location, "fr") || (a.moment === b.moment ? 0 : a.moment === "day" ? -1 : 1) || b.minutes - a.minutes,
  );
}

export interface BreakdownLabels {
  subtitle: string;
  scheduleSubtitle: string;
  fields: Record<keyof SceneBreakdown | "cast" | "entries" | "duration", string>;
  place: (v: ScenePlace) => string;
  moment: (v: "day" | "night" | "unknown") => string;
  noLocation: string;
  scenes: string;
}

/** Fiches de dépouillement : une par scène. */
export function buildBreakdownDoc(project: Pick<Project, "name">, scenes: BreakdownScene[], duration: (m: number) => string, labels: BreakdownLabels): ExportDocument {
  const blocks: ExportBlock[] = [];
  const line = (label: string, value: string) => {
    if (value.trim()) blocks.push({ type: "paragraph", runs: [{ text: `${label} : `, bold: true }, { text: value.trim() }] });
  };
  for (const s of scenes) {
    blocks.push({ type: "heading", level: 2, text: `${s.number}. ${s.heading}`, pageBreakBefore: blocks.length > 0 });
    line(labels.fields.duration, duration(s.minutes));
    line(labels.fields.cast, s.cast.map((c) => (c.state ? `${c.name} (${c.state})` : c.name)).join(", "));
    line(labels.fields.entries, s.entries.map((e) => e.name).join(", "));
    for (const key of ["extras", "props", "costumes", "makeup", "vehicles", "effects", "sound", "notes"] as const) line(labels.fields[key], s.breakdown[key]);
  }
  return { title: project.name, subtitle: [labels.subtitle], titlePage: false, layout: "script", blocks };
}

/** Plan de travail : un groupe par décor et par moment. */
export function buildScheduleDoc(project: Pick<Project, "name">, groups: ScheduleGroup[], duration: (m: number) => string, labels: BreakdownLabels): ExportDocument {
  const blocks: ExportBlock[] = [];
  for (const g of groups) {
    const where = [g.place ? labels.place(g.place) : "", g.location || labels.noLocation].filter(Boolean).join(" ");
    blocks.push({ type: "heading", level: 2, text: `${where.toUpperCase()} — ${labels.moment(g.moment).toUpperCase()} · ${duration(g.minutes)}` });
    blocks.push({ type: "paragraph", runs: [{ text: `${labels.scenes} : `, bold: true }, { text: g.scenes.map((s) => s.number).join(", ") }] });
    if (g.cast.length) blocks.push({ type: "paragraph", runs: [{ text: `${labels.fields.cast} : `, bold: true }, { text: g.cast.join(", ") }] });
  }
  return { title: project.name, subtitle: [labels.scheduleSubtitle], titlePage: false, layout: "script", blocks };
}

// ----------------------------------------------------------------------------
// Bible de série
// ----------------------------------------------------------------------------

export interface BibleInput {
  project: Pick<Project, "name">;
  /** Synopsis du projet (concept), déjà en blocs. */
  synopsis: ExportBlock[];
  characters: Array<{ name: string; role: string; description: string }>;
  /** Saisons (premier niveau) et leurs épisodes, dans l'ordre du plan. */
  outline: OutlineGroup[];
  labelOf: (node: StructureNode) => string;
  duration: (minutes: number) => string;
  labels: {
    subtitle: string;
    concept: string;
    characters: string;
    seasons: string;
    logline: string;
    writer: string;
    runtime: (duration: string) => string;
  };
}

/**
 * Bible de série : le concept (synopsis du projet), les personnages, puis
 * chaque saison avec son résumé et ses épisodes (logline, résumé,
 * scénariste, durée visée). Tout vient de ce qui existe déjà.
 */
export function buildSeriesBible(input: BibleInput): ExportDocument {
  const { labels } = input;
  const blocks: ExportBlock[] = [];
  const section = (title: string, body: ExportBlock[]) => {
    if (!body.length) return;
    blocks.push({ type: "heading", level: 1, text: title, pageBreakBefore: blocks.length > 0 }, ...body);
  };
  section(labels.concept, input.synopsis);
  section(
    labels.characters,
    input.characters.flatMap((c) => [{ type: "heading" as const, level: 3 as const, text: `${c.name} — ${c.role}` }, ...(c.description.trim() ? paragraphs(c.description) : [])]),
  );
  section(
    labels.seasons,
    input.outline.flatMap((group): ExportBlock[] => [
      ...(group.act ? [{ type: "heading" as const, level: 2 as const, text: input.labelOf(group.act) }, ...paragraphs(group.act.summary)] : []),
      ...group.sequences.flatMap((e): ExportBlock[] => {
        const node = e.node;
        const meta = [node.writer.trim() && `${labels.writer} ${node.writer.trim()}`, node.runtimeGoal ? labels.runtime(input.duration(node.runtimeGoal)) : ""].filter(Boolean).join(" · ");
        return [
          { type: "heading", level: 3, text: input.labelOf(node) },
          ...(node.logline.trim() ? [{ type: "paragraph" as const, runs: [{ text: `${labels.logline} `, bold: true }, { text: node.logline.trim(), italics: true }] }] : []),
          ...paragraphs(node.summary),
          ...(meta ? [{ type: "paragraph" as const, runs: [{ text: meta, italics: true }] }] : []),
        ];
      }),
    ]),
  );
  return { title: input.project.name, subtitle: [labels.subtitle], titlePage: true, blocks };
}
