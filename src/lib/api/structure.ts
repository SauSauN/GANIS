import { call, toBytes } from "./client";
import type {
  Structure,
  StructureLevelInput,
  StructureLinks,
  NodeCharacterRole,
  NodeLocationRole,
  NodeEntryRole,
  WorldModule,
  StructureNode,
  Editorial,
  MangaChapterFields,
  MangaSettings,
  MangaExtraPage,
  ExtraPageInput,
  ExtraPageUpdate,
  ExtraPagePlacement,
  ProductionStage,
  PageScript,
  SceneBlock,
  SceneScript,
  SceneScriptInput,
  EpisodeFields,
  FilmDetails,
  SceneBreakdown,
  SceneBreakdownRow,
  PageScriptInput,
  Panel,
  FindOptions,
  FindResult,
  ImportNode,
  ImportResult,
  ReplaceResult,
  ReplaceTarget,
  WritingStats,
  NovelFields,
} from "@/types";

/** Découpage du récit, roman, manga et série. */
export const structureApi = {
  // -------------------------------------------------------------------------
  // Découpage du récit
  // -------------------------------------------------------------------------

  /** Découpage complet du projet (modèle et éléments). */
  // --------------------------------------------------------------------------
  // Roman : texte des scènes, objectifs, états, narration, dossier éditorial
  // --------------------------------------------------------------------------

  /** Texte d'un élément du découpage (HTML de l'éditeur ; vide si aucun). */
  getStructureNodeContent: (projectId: string, nodeId: string) =>
    call<string>("get_structure_node_content", { projectId, nodeId }),

  /** Enregistre le texte d'un élément ; renvoie l'élément (mots à jour). */
  setStructureNodeContent: (projectId: string, nodeId: string, content: string) =>
    call<StructureNode>("set_structure_node_content", { projectId, nodeId, content }),

  /** Textes de tous les éléments qui en ont un (assemblage du manuscrit). */
  getManuscriptContents: (projectId: string) =>
    call<Array<{ id: string; content: string }>>("get_manuscript_contents", { projectId }),

  /** Objectif de mots, état de rédaction et narration d'un élément. */
  setStructureNodeNovel: (projectId: string, nodeId: string, fields: NovelFields) =>
    call<StructureNode>("set_structure_node_novel", { projectId, nodeId, fields }),

  /** Objectif de mots du manuscrit (`null` : aucun). */
  setManuscriptGoal: (projectId: string, goal: number | null) =>
    call<number | null>("set_manuscript_goal", { projectId, goal }),

  /** Cherche un texte dans le texte de toutes les scènes. */
  findInManuscript: (projectId: string, options: FindOptions) =>
    call<FindResult>("find_in_manuscript", { projectId, options }),

  /** Remplace les occurrences choisies (une version nommée par scène). */
  replaceInManuscript: (projectId: string, options: FindOptions, replacement: string, targets: ReplaceTarget[], versionName: string) =>
    call<ReplaceResult>("replace_in_manuscript", { projectId, options, replacement, targets, versionName }),

  /** Mots écrits aujourd'hui, objectif quotidien, série, jours récents. */
  getWritingStats: (projectId: string) => call<WritingStats>("get_writing_stats", { projectId }),

  /** Objectif de mots par jour (`null` : aucun). */
  setDailyGoal: (projectId: string, goal: number | null) => call<WritingStats>("set_daily_goal", { projectId, goal }),

  /** Ajoute un manuscrit découpé à la fin du plan. */
  importManuscript: (projectId: string, plan: ImportNode[]) => call<ImportResult>("import_manuscript", { projectId, plan }),

  // --------------------------------------------------------------------------
  // Série : scénario des scènes et fiche des épisodes
  // --------------------------------------------------------------------------

  /** Scénario d'une scène : en-tête et éléments. */
  getSceneScript: (projectId: string, sceneId: string) => call<SceneScript>("get_scene_script", { projectId, sceneId }),

  /** Enregistre le scénario d'une scène d'un bloc. */
  saveSceneScript: (projectId: string, sceneId: string, input: SceneScriptInput) =>
    call<SceneScript>("save_scene_script", { projectId, sceneId, input }),

  /** Tout le scénario de la série. */
  getSeriesBlocks: (projectId: string) => call<SceneBlock[]>("get_series_blocks", { projectId }),

  /** Logline, durée visée, statut et scénariste d'un épisode. */
  setSeriesEpisode: (projectId: string, nodeId: string, fields: EpisodeFields) =>
    call<StructureNode>("set_series_episode", { projectId, nodeId, fields }),

  /** Fiche du film : logline, durée visée et scénariste. */
  getFilmDetails: (projectId: string) => call<FilmDetails>("get_film_details", { projectId }),

  /** Enregistre la fiche du film. */
  setFilmDetails: (projectId: string, details: FilmDetails) => call<FilmDetails>("set_film_details", { projectId, details }),

  /** Dépouillement de toutes les scènes. */
  getSceneBreakdowns: (projectId: string) => call<SceneBreakdownRow[]>("get_scene_breakdowns", { projectId }),

  /** Enregistre le dépouillement d'une scène (tout vide : il est retiré). */
  setSceneBreakdown: (projectId: string, sceneId: string, breakdown: SceneBreakdown) =>
    call<SceneBreakdown>("set_scene_breakdown", { projectId, sceneId, breakdown }),

  /** Place une scène dans une séquence ou un épisode, au rang donné (tableau de liège). */
  placeStructureNode: (projectId: string, nodeId: string, parentId: string | null, index: number) =>
    call<StructureNode>("place_structure_node", { projectId, nodeId, parentId, index }),

  // --------------------------------------------------------------------------
  // Manga / BD : scénario par page et par case
  // --------------------------------------------------------------------------

  /** Scénario d'une page : fonction narrative et cases. */
  getPageScript: (projectId: string, pageId: string) => call<PageScript>("get_page_script", { projectId, pageId }),

  /** Enregistre le scénario d'une page d'un bloc (cases retirées : corbeille). */
  savePageScript: (projectId: string, pageId: string, input: PageScriptInput) =>
    call<PageScript>("save_page_script", { projectId, pageId, input }),

  /** Toutes les cases du projet. */
  getScriptPanels: (projectId: string) => call<Panel[]>("get_script_panels", { projectId }),

  /** Déplace une case à la fin d'une autre page. */
  moveMangaPanel: (projectId: string, panelId: string, pageId: string) => call<void>("move_manga_panel", { projectId, panelId, pageId }),

  /** Ajoute plusieurs pages à la fin d'un chapitre. */
  createMangaPages: (projectId: string, chapterId: string, count: number) => call<StructureNode[]>("create_manga_pages", { projectId, chapterId, count }),

  /** Objectif narratif, pages visées et statut d'un chapitre. */
  setMangaChapter: (projectId: string, nodeId: string, fields: MangaChapterFields) =>
    call<StructureNode>("set_manga_chapter", { projectId, nodeId, fields }),

  getMangaSettings: (projectId: string) => call<MangaSettings>("get_manga_settings", { projectId }),

  setMangaSettings: (projectId: string, settings: MangaSettings) => call<MangaSettings>("set_manga_settings", { projectId, settings }),

  /** Pages hors récit de tous les tomes. */
  listMangaExtraPages: (projectId: string) => call<MangaExtraPage[]>("list_manga_extra_pages", { projectId }),

  createMangaExtraPage: (projectId: string, input: ExtraPageInput) => call<MangaExtraPage>("create_manga_extra_page", { projectId, input }),

  updateMangaExtraPage: (projectId: string, pageId: string, update: ExtraPageUpdate) =>
    call<MangaExtraPage>("update_manga_extra_page", { projectId, pageId, update }),

  /** Nouvel ordre d'un groupe (tome + placement) ; renvoie toutes les pages hors récit. */
  reorderMangaExtraPages: (projectId: string, volumeId: string | null, placement: ExtraPagePlacement, ids: string[]) =>
    call<MangaExtraPage[]>("reorder_manga_extra_pages", { projectId, volumeId, placement, ids }),

  /** Met la page à la corbeille ; renvoie l'identifiant de l'entrée. */
  deleteMangaExtraPage: (projectId: string, pageId: string) => call<string>("delete_manga_extra_page", { projectId, pageId }),

  /** Range le dessin d'une page hors récit (image envoyée telle quelle). */
  setMangaExtraArt: (projectId: string, pageId: string, name: string, data: ArrayBuffer | Uint8Array) =>
    call<MangaExtraPage>("set_manga_extra_art", toBytes(data), {
      headers: {
        "x-project-id": encodeURIComponent(projectId),
        "x-page-id": encodeURIComponent(pageId),
        "x-name": encodeURIComponent(name),
      },
    }),

  removeMangaExtraArt: (projectId: string, pageId: string) => call<MangaExtraPage>("remove_manga_extra_art", { projectId, pageId }),

  /** Contenu du dessin d'une page hors récit, en binaire. */
  getMangaExtraArt: (projectId: string, pageId: string) => call<ArrayBuffer>("get_manga_extra_art", { projectId, pageId }),

  /** Étape de fabrication de pages du récit et de pages hors récit (`null` : rien de commencé). */
  setMangaProductionStage: (projectId: string, pageIds: string[], extraIds: string[], stage: ProductionStage | null) =>
    call<void>("set_manga_production_stage", { projectId, pageIds, extraIds, stage }),

  getEditorial: (projectId: string) => call<Editorial>("get_editorial", { projectId }),

  updateEditorial: (projectId: string, input: Partial<Pick<Editorial, "pitch" | "summaryShort" | "summaryLong">>) =>
    call<Editorial>("update_editorial", { projectId, input }),

  /**
   * Enregistre un fichier exporté (.docx, .pdf, .txt, .md) à l'emplacement
   * choisi dans la fenêtre du système. Renvoie le nom du fichier, ou
   * `null` si l'utilisateur a annulé.
   */
  saveExportFile: (fileName: string, dialogTitle: string, data: ArrayBuffer | Uint8Array) =>
    call<string | null>("save_export_file", toBytes(data), {
      headers: {
        "x-file-name": encodeURIComponent(fileName),
        "x-dialog-title": encodeURIComponent(dialogTitle),
      },
    }),

  getStructure: (projectId: string) =>
    call<Structure>("get_structure", { projectId }),

  /**
   * Choisit le modèle de découpage (`null` : il suit le type du projet).
   * Les niveaux redeviennent ceux du modèle.
   */
  setStructureTemplate: (projectId: string, template: string | null) =>
    call<void>("set_structure_template", { projectId, template }),

  /** Personnalise les niveaux : noms, numérotation, ajout ou retrait. */
  setStructureLevels: (projectId: string, levels: StructureLevelInput[]) =>
    call<void>("set_structure_levels", { projectId, levels }),

  /** Active ou désactive la mise à jour automatique des numéros. */
  setStructureAutoNumbering: (projectId: string, enabled: boolean) =>
    call<void>("set_structure_auto_numbering", { projectId, enabled }),

  /** Remet tous les numéros dans l'ordre du plan (« Renuméroter »). */
  renumberStructure: (projectId: string) =>
    call<void>("renumber_structure", { projectId }),

  /**
   * Ajoute un élément à la fin de son parent (ou de la racine), ou juste
   * après `afterId` (même parent). Le titre est facultatif.
   */
  createStructureNode: (
    projectId: string,
    input: {
      parentId: string | null;
      level: number;
      title?: string;
      afterId?: string | null;
    },
  ) => call<StructureNode>("create_structure_node", { projectId, input }),

  /**
   * Modifie le titre, le résumé, la numérotation et/ou le numéro (choisi à
   * la main, numérotation non automatique) d'un élément.
   */
  updateStructureNode: (
    projectId: string,
    nodeId: string,
    input: { title?: string; summary?: string; numbered?: boolean; number?: number },
  ) =>
    call<StructureNode>("update_structure_node", { projectId, nodeId, input }),

  /** Monte ou descend un élément parmi ceux de même parent. */
  moveStructureNode: (
    projectId: string,
    nodeId: string,
    direction: "up" | "down",
  ) => call<void>("move_structure_node", { projectId, nodeId, direction }),

  /** Supprime un élément et tout ce qu'il contient. */
  deleteStructureNode: (projectId: string, nodeId: string) =>
    call<string>("delete_structure_node", { projectId, nodeId }),

  /** Personnages et lieux liés aux éléments du découpage. */
  listStructureLinks: (projectId: string) =>
    call<StructureLinks>("list_structure_links", { projectId }),

  /** Lie un personnage à un élément (ou change son rôle). */
  linkStructureCharacter: (projectId: string, nodeId: string, characterId: string, role: NodeCharacterRole) =>
    call<void>("link_structure_character", { projectId, nodeId, characterId, role }),

  /** État d'un personnage lié à un élément (continuité). */
  setStructureCharacterState: (projectId: string, nodeId: string, characterId: string, value: string) =>
    call<void>("set_structure_character_state", { projectId, nodeId, characterId, value }),

  /** Retire un personnage d'un élément. */
  unlinkStructureCharacter: (projectId: string, nodeId: string, characterId: string) =>
    call<void>("unlink_structure_character", { projectId, nodeId, characterId }),

  /** Lie un lieu à un élément (ou change son rôle). */
  linkStructureLocation: (projectId: string, nodeId: string, locationId: string, role: NodeLocationRole) =>
    call<void>("link_structure_location", { projectId, nodeId, locationId, role }),

  /** Retire un lieu d'un élément. */
  unlinkStructureLocation: (projectId: string, nodeId: string, locationId: string) =>
    call<void>("unlink_structure_location", { projectId, nodeId, locationId }),

  /** Lie une fiche du monde (objet, faune et flore, faction, peuple, magie) à un élément. */
  linkStructureEntry: (projectId: string, nodeId: string, kind: WorldModule, entryId: string, role: NodeEntryRole) =>
    call<void>("link_structure_entry", { projectId, nodeId, kind, entryId, role }),

  unlinkStructureEntry: (projectId: string, nodeId: string, kind: WorldModule, entryId: string) =>
    call<void>("unlink_structure_entry", { projectId, nodeId, kind, entryId }),
};
