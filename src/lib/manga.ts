import { countWordsPlain, chapterLevel, sceneLevel } from "@/lib/novel";
import type { ExportBlock, ExportDocument } from "@/lib/novelExport";
import { buildStructureTree, flattenVisible } from "@/lib/structure";
import {
  PANEL_TEXT_KINDS,
  type Character,
  type Location,
  type MangaSettings,
  type PageScript,
  type PageScriptInput,
  type Panel,
  type PanelCharacter,
  type PanelText,
  type PanelTextKind,
  type Project,
  type Rhythm,
  type StructureNode,
} from "@/types";

/*
 * Scénario de manga / BD : brouillon d'une page, comptes de texte, alertes
 * de volume, ordre des pages et export pour le dessinateur.
 */

export function isMangaProject(project: Pick<Project, "type"> | null | undefined): boolean {
  return project?.type === "manga";
}

/** Niveaux du découpage : chapitres et pages (Tome › Chapitre › Page). */
export function mangaLevels(levelCount: number) {
  return { chapter: chapterLevel(levelCount), page: sceneLevel(levelCount) };
}

// ----------------------------------------------------------------------------
// Comptes et alertes
// ----------------------------------------------------------------------------

export interface TextStats {
  words: number;
  characters: number;
  /** Mots par type de texte. */
  byKind: Record<PanelTextKind, number>;
  texts: number;
}

const emptyByKind = () => Object.fromEntries(PANEL_TEXT_KINDS.map((k) => [k, 0])) as Record<PanelTextKind, number>;

export function textStats(texts: Array<Pick<PanelText, "kind" | "content">>): TextStats {
  const stats: TextStats = { words: 0, characters: 0, byKind: emptyByKind(), texts: 0 };
  for (const text of texts) {
    const content = text.content.trim();
    if (!content) continue;
    const words = countWordsPlain(content);
    stats.words += words;
    stats.characters += content.length;
    stats.byKind[text.kind] += words;
    stats.texts += 1;
  }
  return stats;
}

export function pageStats(panels: Array<{ texts: Array<Pick<PanelText, "kind" | "content">> }>): TextStats {
  return textStats(panels.flatMap((p) => p.texts));
}

export type VolumeLevel = "empty" | "ok" | "high";

/** Case : sans texte, normale, ou au-delà du seuil. */
export function panelVolume(stats: TextStats, settings: MangaSettings | null): VolumeLevel {
  if (stats.texts === 0) return "empty";
  return settings?.panelWordsMax && stats.words > settings.panelWordsMax ? "high" : "ok";
}

export function pageVolume(stats: TextStats, settings: MangaSettings | null): VolumeLevel {
  if (stats.texts === 0) return "empty";
  return settings?.pageWordsMax && stats.words > settings.pageWordsMax ? "high" : "ok";
}

// ----------------------------------------------------------------------------
// Ordre des pages
// ----------------------------------------------------------------------------

export interface PageEntry {
  page: StructureNode;
  chapter: StructureNode | null;
}

/** Pages dans l'ordre du plan, avec leur chapitre. */
export function pagesInOrder(nodes: StructureNode[], levelCount: number): PageEntry[] {
  const { chapter, page } = mangaLevels(levelCount);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chapterOf = (node: StructureNode): StructureNode | null => {
    let current = node.parentId ? byId.get(node.parentId) : undefined;
    while (current && current.level > chapter) current = current.parentId ? byId.get(current.parentId) : undefined;
    return current && current.level === chapter ? current : null;
  };
  return flattenVisible(buildStructureTree(nodes), new Set())
    .filter((n) => n.level >= page)
    .map((n) => ({ page: n, chapter: chapterOf(n) }));
}

/** Cases regroupées par page, dans l'ordre de chaque page. */
export function panelsByPage(panels: Panel[]): Map<string, Panel[]> {
  const map = new Map<string, Panel[]>();
  for (const panel of panels) {
    const list = map.get(panel.pageId);
    if (list) list.push(panel);
    else map.set(panel.pageId, [panel]);
  }
  for (const list of map.values()) list.sort((a, b) => a.position - b.position);
  return map;
}

// ----------------------------------------------------------------------------
// Brouillon d'une page
// ----------------------------------------------------------------------------

export interface DraftText {
  /** Clé locale (stable pendant l'édition). */
  key: string;
  id?: string;
  kind: PanelTextKind;
  characterId: string | null;
  content: string;
}

export interface DraftPanel {
  key: string;
  id?: string;
  action: string;
  framing: Panel["framing"];
  setting: string;
  artistNotes: string;
  rhythm: Rhythm | null;
  locationId: string | null;
  moment: string;
  continuity: string;
  characters: PanelCharacter[];
  texts: DraftText[];
}

export interface PageDraft {
  rhythm: Rhythm | null;
  pageTurn: boolean;
  panels: DraftPanel[];
}

let keySeed = 0;
export const newKey = () => `k${Date.now().toString(36)}${(++keySeed).toString(36)}`;

export function draftFromScript(script: PageScript): PageDraft {
  return {
    rhythm: script.page.rhythm,
    pageTurn: script.page.pageTurn,
    panels: script.panels.map((p) => ({
      key: p.id,
      id: p.id,
      action: p.action,
      framing: p.framing,
      setting: p.setting,
      artistNotes: p.artistNotes,
      rhythm: p.rhythm,
      locationId: p.locationId,
      moment: p.moment,
      continuity: p.continuity,
      characters: p.characters.map((c) => ({ ...c })),
      texts: p.texts.map((t) => ({ key: t.id, id: t.id, kind: t.kind, characterId: t.characterId, content: t.content })),
    })),
  };
}

export function emptyPanel(): DraftPanel {
  return {
    key: newKey(),
    action: "",
    framing: "",
    setting: "",
    artistNotes: "",
    rhythm: null,
    locationId: null,
    moment: "",
    continuity: "",
    characters: [],
    texts: [],
  };
}

export function newText(kind: PanelTextKind, characterId: string | null = null): DraftText {
  return { key: newKey(), kind, characterId: kind === "dialogue" || kind === "thought" ? characterId : null, content: "" };
}

/** Copie d'une case (nouveaux identifiants). */
export function duplicatePanel(panel: DraftPanel): DraftPanel {
  return {
    ...panel,
    key: newKey(),
    id: undefined,
    characters: panel.characters.map((c) => ({ ...c })),
    texts: panel.texts.map((t) => ({ ...t, key: newKey(), id: undefined })),
  };
}

/** Forme comparable (sans les clés locales) : deux brouillons égaux ont la même. */
export function draftSignature(draft: PageDraft): string {
  return JSON.stringify(inputFromDraft(draft, ""));
}

export function inputFromDraft(draft: PageDraft, pageLabel: string): PageScriptInput {
  return {
    rhythm: draft.rhythm,
    pageTurn: draft.pageTurn,
    pageLabel,
    panels: draft.panels.map((p) => ({
      id: p.id,
      action: p.action,
      framing: p.framing,
      setting: p.setting,
      artistNotes: p.artistNotes,
      rhythm: p.rhythm,
      locationId: p.locationId,
      moment: p.moment,
      continuity: p.continuity,
      characters: p.characters,
      texts: p.texts.map((t) => ({ id: t.id, kind: t.kind, characterId: t.characterId, content: t.content })),
    })),
  };
}

/** Déplace un élément d'une liste (renvoie une nouvelle liste). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// ----------------------------------------------------------------------------
// Export pour le dessinateur
// ----------------------------------------------------------------------------

export interface ScriptExportLabels {
  subtitle: string;
  cast: string;
  places: string;
  pageHeading: (label: string, panels: number) => string;
  panelHeading: (number: number, framing: string) => string;
  goal: string;
  rhythm: (value: string) => string;
  pageTurn: string;
  setting: string;
  place: string;
  characters: string;
  notes: string;
  continuity: string;
  textLabel: (kind: PanelTextKind, speaker: string) => string;
  framing: (value: string) => string;
  rhythmName: (value: Rhythm) => string;
  noPanels: string;
}

export interface ScriptExportInput {
  project: Pick<Project, "name">;
  entries: PageEntry[];
  panels: Map<string, Panel[]>;
  labelOf: (node: StructureNode) => string;
  characters: Character[];
  locations: Location[];
  nameOf: (character: Character) => string;
  includeCast: boolean;
  labels: ScriptExportLabels;
}

const plain = (text: string) => ({ type: "paragraph" as const, runs: [{ text }] });

/** Document du scénario : chapitres, pages, cases numérotées et leurs textes. */
export function buildScriptExport(input: ScriptExportInput): ExportDocument {
  const { labels } = input;
  const characterById = new Map(input.characters.map((c) => [c.id, c]));
  const locationById = new Map(input.locations.map((l) => [l.id, l]));
  const speaker = (id: string | null) => {
    const c = id ? characterById.get(id) : undefined;
    return c ? input.nameOf(c) : "";
  };
  const blocks: ExportBlock[] = [];

  // Personnages et lieux présents dans les pages exportées.
  if (input.includeCast) {
    const castIds = new Set<string>();
    const placeIds = new Set<string>();
    for (const entry of input.entries) {
      for (const panel of input.panels.get(entry.page.id) ?? []) {
        panel.characters.forEach((c) => castIds.add(c.characterId));
        panel.texts.forEach((t) => t.characterId && castIds.add(t.characterId));
        if (panel.locationId) placeIds.add(panel.locationId);
      }
    }
    const describe = (text: string | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
    const cast = input.characters.filter((c) => castIds.has(c.id));
    if (cast.length) {
      blocks.push({ type: "heading", level: 2, text: labels.cast });
      for (const c of cast) {
        const details = [describe(c.fields.description), describe(c.fields.distinctiveTrait)].filter(Boolean).join(" ");
        blocks.push({ type: "paragraph", runs: [{ text: input.nameOf(c), bold: true }, ...(details ? [{ text: ` — ${details}` }] : [])] });
      }
    }
    const places = input.locations.filter((l) => placeIds.has(l.id));
    if (places.length) {
      blocks.push({ type: "heading", level: 2, text: labels.places });
      for (const l of places) {
        const details = describe(l.fields.description);
        blocks.push({ type: "paragraph", runs: [{ text: l.name, bold: true }, ...(details ? [{ text: ` — ${details}` }] : [])] });
      }
    }
  }

  let currentChapter: string | null | undefined;
  for (const entry of input.entries) {
    const chapterId = entry.chapter?.id ?? null;
    if (chapterId !== currentChapter) {
      currentChapter = chapterId;
      if (entry.chapter) {
        blocks.push({ type: "heading", level: 1, text: input.labelOf(entry.chapter), pageBreakBefore: blocks.length > 0 });
        if (entry.chapter.summary.trim()) blocks.push({ type: "paragraph", runs: [{ text: entry.chapter.summary.trim(), italics: true }] });
        if (entry.chapter.narrativeGoal.trim()) blocks.push({ type: "paragraph", runs: [{ text: `${labels.goal} `, bold: true }, { text: entry.chapter.narrativeGoal.trim() }] });
      }
    }

    const panels = input.panels.get(entry.page.id) ?? [];
    blocks.push({ type: "heading", level: 2, text: labels.pageHeading(input.labelOf(entry.page), panels.length) });
    const pageNotes = [entry.page.rhythm ? labels.rhythm(labels.rhythmName(entry.page.rhythm)) : "", entry.page.pageTurn ? labels.pageTurn : ""].filter(Boolean);
    if (pageNotes.length) blocks.push({ type: "paragraph", runs: [{ text: pageNotes.join(" · "), italics: true }] });
    if (entry.page.summary.trim()) blocks.push(plain(entry.page.summary.trim()));
    if (!panels.length) blocks.push({ type: "paragraph", runs: [{ text: labels.noPanels, italics: true }] });

    panels.forEach((panel, index) => {
      const framing = panel.framing ? labels.framing(panel.framing) : "";
      blocks.push({ type: "heading", level: 3, text: labels.panelHeading(index + 1, [framing, panel.rhythm ? labels.rhythmName(panel.rhythm) : ""].filter(Boolean).join(" · ")) });
      if (panel.action.trim()) blocks.push(plain(panel.action.trim()));
      const field = (label: string, value: string) => value.trim() && blocks.push({ type: "paragraph", runs: [{ text: `${label} `, bold: true }, { text: value.trim() }], inset: 1 });
      const place = panel.locationId ? locationById.get(panel.locationId)?.name ?? "" : "";
      field(labels.place, [place, panel.moment].filter((v) => v.trim()).join(" — "));
      field(labels.setting, panel.setting);
      field(
        labels.characters,
        panel.characters
          .map((c) => {
            const name = speaker(c.characterId);
            return name ? (c.state.trim() ? `${name} (${c.state.trim()})` : name) : "";
          })
          .filter(Boolean)
          .join(", "),
      );
      field(labels.notes, panel.artistNotes);
      field(labels.continuity, panel.continuity);
      for (const text of panel.texts) {
        if (!text.content.trim()) continue;
        blocks.push({
          type: "paragraph",
          runs: [{ text: `${labels.textLabel(text.kind, speaker(text.characterId))} `, bold: true }, { text: text.content.trim(), italics: text.kind === "thought" }],
          inset: 2,
        });
      }
    });
  }

  return { title: input.project.name, subtitle: [labels.subtitle], titlePage: false, layout: "script", blocks };
}
