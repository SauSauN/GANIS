import { documentKind, extensionOf } from "@/lib/documents";
import { countWordsPlain, chapterLevel, sceneLevel } from "@/lib/novel";
import type { ExportBlock, ExportDocument } from "@/lib/novelExport";
import { buildStructureTree, flattenVisible } from "@/lib/structure";
import {
  PANEL_TEXT_KINDS,
  type Character,
  type ExtraPageKind,
  type Location,
  type MangaExtraPage,
  type MangaSettings,
  type PageScript,
  type PageScriptInput,
  type Panel,
  type PanelCharacter,
  type PanelText,
  type PanelTextKind,
  type ProductionStage,
  type Project,
  type Rhythm,
  type StructureDocument,
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
// Chemin de fer : tomes, folios, planches et dessins
// ----------------------------------------------------------------------------

export interface VolumeGroup {
  /** Tome (niveau juste au-dessus des chapitres) ; `null` s'il n'y en a pas. */
  volume: StructureNode | null;
  entries: PageEntry[];
}

/** Pages dans l'ordre du plan, regroupées par tome. */
export function pagesByVolume(nodes: StructureNode[], levelCount: number): VolumeGroup[] {
  const volumeLevel = mangaLevels(levelCount).chapter - 1;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const volumeOf = (node: StructureNode): StructureNode | null => {
    if (volumeLevel < 0) return null;
    let current = node.parentId ? byId.get(node.parentId) : undefined;
    while (current && current.level > volumeLevel) current = current.parentId ? byId.get(current.parentId) : undefined;
    return current?.level === volumeLevel ? current : null;
  };
  const groups: VolumeGroup[] = [];
  for (const entry of pagesInOrder(nodes, levelCount)) {
    const volume = volumeOf(entry.page);
    const last = groups[groups.length - 1];
    if (last && last.volume?.id === volume?.id) last.entries.push(entry);
    else groups.push({ volume, entries: [entry] });
  }
  return groups;
}

export interface FolioPage extends PageEntry {
  /** Numéro imprimé de la page dans son tome. */
  folio: number;
}

export function foliosOf(entries: PageEntry[], firstFolio: number): FolioPage[] {
  return entries.map((entry, index) => ({ ...entry, folio: firstFolio + index }));
}

/**
 * Planche : deux pages en vis-à-vis. Quel que soit le sens de lecture, une
 * page paire est lue d'abord et une page impaire ensuite ; on tourne donc
 * la page après un folio impair.
 */
export interface Spread<T> {
  first: T | null;
  second: T | null;
}

export function spreadsOf<T extends { folio: number }>(pages: T[]): Array<Spread<T>> {
  const spreads: Array<Spread<T>> = [];
  let index = 0;
  // Un folio impair au début est seul : sa page en vis-à-vis est hors du tome.
  if (pages[0] && pages[0].folio % 2 !== 0) {
    spreads.push({ first: null, second: pages[0] });
    index = 1;
  }
  for (; index < pages.length; index += 2) {
    spreads.push({ first: pages[index], second: pages[index + 1] ?? null });
  }
  return spreads;
}

/** Révélation prévue au tourné, alors que la suite est déjà en vis-à-vis. */
export function isTurnMisplaced(page: { folio: number; page: Pick<StructureNode, "pageTurn"> }): boolean {
  return page.page.pageTurn && page.folio % 2 === 0;
}

/** Fichiers de dessin que GANIS range sans pouvoir les afficher. */
const ART_SOURCE_EXTENSIONS = new Set(["TIF", "TIFF", "PSD", "PSB", "CLIP", "KRA", "SAI", "SAI2", "MDP", "CSP", "XCF"]);

function isArt(document: Pick<StructureDocument, "mime" | "name">): boolean {
  return documentKind(document) === "image" || ART_SOURCE_EXTENSIONS.has(extensionOf(document.name));
}

export interface FlatplanArt {
  /** Dessin de chaque page : le sien, sinon celui de son rang dans le chapitre. */
  art: Map<string, StructureDocument>;
  /** Dessins d'un chapitre qui n'ont pas trouvé de page. */
  unplaced: StructureDocument[];
}

/**
 * Attribue un dessin à chaque page. Une page préfère une image affichable à
 * un fichier source. Les dessins déposés sur le chapitre (cas prévu par le
 * lecteur de pages) vont aux pages qui n'en ont pas, dans l'ordre.
 */
export function assignArt(entries: PageEntry[], documents: Map<string, StructureDocument[]>): FlatplanArt {
  const art = new Map<string, StructureDocument>();
  const freeByChapter = new Map<string, StructureNode[]>();
  for (const { page, chapter } of entries) {
    const own = (documents.get(page.id) ?? []).filter(isArt);
    const chosen = own.find((document) => documentKind(document) === "image") ?? own[0];
    if (chosen) art.set(page.id, chosen);
    else if (chapter) freeByChapter.set(chapter.id, [...(freeByChapter.get(chapter.id) ?? []), page]);
  }
  const chapterIds = new Set(entries.flatMap((entry) => (entry.chapter ? [entry.chapter.id] : [])));
  const unplaced: StructureDocument[] = [];
  for (const chapterId of chapterIds) {
    const free = freeByChapter.get(chapterId) ?? [];
    (documents.get(chapterId) ?? []).filter(isArt).forEach((document, index) => {
      if (free[index]) art.set(free[index].id, document);
      else unplaced.push(document);
    });
  }
  return { art, unplaced };
}

/** Images à enchaîner dans le lecteur : page par page, puis celles sans page. */
export function readingOrder(entries: PageEntry[], { art, unplaced }: FlatplanArt): StructureDocument[] {
  const placed = entries.flatMap(({ page }) => art.get(page.id) ?? []);
  return [...placed, ...unplaced].filter((document) => documentKind(document) === "image");
}

// ----------------------------------------------------------------------------
// Fabrication et pages hors récit
// ----------------------------------------------------------------------------

/** Étapes de fabrication d'une page, dans l'ordre (la valeur est la dernière terminée). */
export const PRODUCTION_STAGES: readonly ProductionStage[] = ["storyboard", "pencils", "inks", "tones", "lettering", "done"];

/** Couleur de chaque étape ; `none` : rien de commencé. */
export const PRODUCTION_STAGE_COLORS: Record<ProductionStage | "none", string> = {
  none: "#94a3b8",
  storyboard: "#a855f7",
  pencils: "#3b82f6",
  inks: "#0d9488",
  tones: "#d97706",
  lettering: "#ea580c",
  done: "#16a34a",
};

/** Sortes de pages hors récit, dans l'ordre où on les propose. */
export const EXTRA_PAGE_KINDS: readonly ExtraPageKind[] = [
  "cover", "title", "toc", "credits", "cast", "foreword", "bonus", "afterword", "preview", "blank", "backCover", "other",
];

/** Couvertures : hors des pages intérieures, sans folio. */
export const isCoverKind = (kind: ExtraPageKind) => kind === "cover" || kind === "backCover";

/** Avancement d'une étape (0 : rien, 6 : validée) ; sert aux pourcentages. */
export function stageRank(stage: ProductionStage | null): number {
  return stage ? PRODUCTION_STAGES.indexOf(stage) + 1 : 0;
}

/** Nombre de pages à chaque étape. */
export function stageCounts(stages: Array<ProductionStage | null>): Record<ProductionStage | "none", number> {
  const counts = { none: 0, storyboard: 0, pencils: 0, inks: 0, tones: 0, lettering: 0, done: 0 };
  for (const stage of stages) counts[stage ?? "none"]++;
  return counts;
}

/** Avancement moyen de pages, de 0 à 100 (chaque étape compte pour un sixième). */
export function productionPercent(stages: Array<ProductionStage | null>): number {
  if (!stages.length) return 0;
  const total = stages.reduce((sum, stage) => sum + stageRank(stage), 0);
  return Math.round((total / (stages.length * PRODUCTION_STAGES.length)) * 100);
}

/** Pages hors récit d'un tome, triées : couvertures à part, puis avant et après le récit. */
export interface VolumeExtras {
  cover: MangaExtraPage | null;
  backCover: MangaExtraPage | null;
  front: MangaExtraPage[];
  back: MangaExtraPage[];
}

export function extrasOfVolume(extras: readonly MangaExtraPage[], volumeId: string | null): VolumeExtras {
  const mine = extras
    .filter((extra) => extra.volumeId === volumeId)
    .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
  return {
    cover: mine.find((extra) => extra.kind === "cover") ?? null,
    backCover: mine.find((extra) => extra.kind === "backCover") ?? null,
    front: mine.filter((extra) => extra.placement === "front" && !isCoverKind(extra.kind)),
    back: mine.filter((extra) => extra.placement === "back" && !isCoverKind(extra.kind)),
  };
}

/** Page hors récit placée dans le tome, avec son folio. */
export interface FolioExtra {
  extra: MangaExtraPage;
  folio: number;
}

/** Une page intérieure du tome : du récit ou hors récit. */
export type FlatplanItem = FolioPage | FolioExtra;

export const isExtraItem = (item: FlatplanItem): item is FolioExtra => "extra" in item;

/** Identifiant d'une page intérieure (page du récit ou page hors récit). */
export const itemId = (item: FlatplanItem) => (isExtraItem(item) ? item.extra.id : item.page.id);

/**
 * Pages intérieures d'un tome dans l'ordre d'impression : pages hors récit
 * d'ouverture, récit, pages hors récit de fin. Les folios se suivent à
 * partir de `firstFolio` ; les couvertures n'en ont pas.
 */
export function volumeSequence(entries: PageEntry[], extras: VolumeExtras, firstFolio: number): FlatplanItem[] {
  let folio = firstFolio;
  const items: FlatplanItem[] = [];
  for (const extra of extras.front) items.push({ extra, folio: folio++ });
  for (const entry of entries) items.push({ ...entry, folio: folio++ });
  for (const extra of extras.back) items.push({ extra, folio: folio++ });
  return items;
}

/** Folio de la première page d'un tome (réglage du chemin de fer, gardé sur cet ordinateur). */
const firstFolioKey = (groupId: string) => `ganis.flatplan.firstFolio.${groupId}`;
export const MAX_FIRST_FOLIO = 99;

export function storedFirstFolio(groupId: string): number {
  let value = Number.NaN;
  try {
    value = Number.parseInt(localStorage.getItem(firstFolioKey(groupId)) ?? "", 10);
  } catch {
    // Stockage indisponible : la première page porte le numéro 1.
  }
  return value >= 1 && value <= MAX_FIRST_FOLIO ? value : 1;
}

export function rememberFirstFolio(groupId: string, value: number) {
  try {
    localStorage.setItem(firstFolioKey(groupId), String(value));
  } catch {
    // Préférence gardée pour cette séance seulement.
  }
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
  /** Titre d'une page avec son folio : « p. 12 — Page 3 ». Absent : titre seul. */
  folio?: (folio: number, label: string) => string;
  /** Titre d'une page hors récit (`folio` : `null` pour une couverture). */
  extraHeading?: (extra: MangaExtraPage, folio: number | null) => string;
  /** Titres des parties « avant le récit » et « après le récit ». */
  frontMatter?: string;
  backMatter?: string;
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
  /**
   * Tome exporté avec ses folios et ses pages hors récit (voir
   * `volumeSequence`). Absent : les pages de `entries`, sans folio.
   */
  volume?: { items: FlatplanItem[]; extras: VolumeExtras };
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
  const items: FlatplanItem[] = input.volume?.items ?? input.entries.map((entry) => ({ ...entry, folio: 0 }));
  const storyPages = items.filter((item): item is FolioPage => !isExtraItem(item));
  const withFolio = Boolean(input.volume);

  // Pages hors récit : titre, puis indications.
  const matter = (title: string | undefined, list: Array<{ extra: MangaExtraPage; folio: number | null }>) => {
    if (!list.length) return;
    blocks.push({ type: "heading", level: 1, text: title ?? "", pageBreakBefore: blocks.length > 0 });
    for (const { extra, folio } of list) {
      blocks.push({ type: "heading", level: 2, text: labels.extraHeading?.(extra, folio) ?? extra.title });
      if (extra.notes.trim()) blocks.push(plain(extra.notes.trim()));
    }
  };
  const extras = input.volume?.extras;
  const folioOfExtra = new Map(items.filter(isExtraItem).map((item) => [item.extra.id, item.folio]));

  // Personnages et lieux présents dans les pages exportées.
  if (input.includeCast) {
    const castIds = new Set<string>();
    const placeIds = new Set<string>();
    for (const entry of storyPages) {
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

  if (extras) {
    matter(labels.frontMatter, [
      ...(extras.cover ? [{ extra: extras.cover, folio: null }] : []),
      ...extras.front.map((extra) => ({ extra, folio: folioOfExtra.get(extra.id) ?? null })),
    ]);
  }

  let currentChapter: string | null | undefined;
  for (const entry of storyPages) {
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
    const pageLabel = withFolio && labels.folio ? labels.folio(entry.folio, input.labelOf(entry.page)) : input.labelOf(entry.page);
    blocks.push({ type: "heading", level: 2, text: labels.pageHeading(pageLabel, panels.length) });
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

  if (extras) {
    matter(labels.backMatter, [
      ...extras.back.map((extra) => ({ extra, folio: folioOfExtra.get(extra.id) ?? null })),
      ...(extras.backCover ? [{ extra: extras.backCover, folio: null }] : []),
    ]);
  }

  return { title: input.project.name, subtitle: [labels.subtitle], titlePage: false, layout: "script", blocks };
}
