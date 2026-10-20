import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { ProjectSettingsPanel } from "@/components/project-settings/ProjectSettingsPanel";
import type { ProjectSettingsId } from "@/components/project-settings/sections";
import {
  HOME_TAB,
  NOVEL_FEATURES,
  MANGA_FEATURES,
  SETTINGS_PREFIX,
  findFeature,
} from "@/components/workspace/modules";
import { CharacterCreateView } from "@/components/workspace/views/CharacterCreateView";
import { CharacterEditView } from "@/components/workspace/views/CharacterEditView";
import { CharacterListView } from "@/components/workspace/views/CharacterListView";
import { LocationCreateView } from "@/components/workspace/views/LocationCreateView";
import { LocationEditView } from "@/components/workspace/views/LocationEditView";
import { LocationListView } from "@/components/workspace/views/LocationListView";
import { NoteCreateView } from "@/components/workspace/views/NoteCreateView";
import { NotesListView } from "@/components/workspace/views/NotesListView";
import { TrashView } from "@/components/workspace/views/TrashView";
import {
  ComingSoonView,
  EmptyListView,
} from "@/components/workspace/views/GenericViews";
import { StructurePlanView } from "@/components/workspace/views/StructurePlanView";
import { SynopsisEditView } from "@/components/workspace/views/SynopsisEditView";
import { WorkspaceHome } from "@/components/workspace/WorkspaceHome";
import { characterIdOfTab } from "@/lib/characters";
import { locationIdOfTab } from "@/lib/locations";
import { noteIdOfTab } from "@/lib/notes";
import { structureNodeIdOfTab } from "@/lib/structure";
import type { Project } from "@/types";

/*
 * Interfaces lourdes (éditeur de notes, graphe des relations, mur de post-it,
 * trame, visionneuse de documents…) chargées à la première ouverture :
 * l'application démarre plus vite.
 */
const NoteEditView = lazy(() => import("@/components/workspace/views/NoteEditView").then((module) => ({ default: module.NoteEditView })));
const RelationsView = lazy(() => import("@/components/workspace/views/RelationsView").then((module) => ({ default: module.RelationsView })));
const StickyWallView = lazy(() => import("@/components/workspace/views/StickyWallView").then((module) => ({ default: module.StickyWallView })));
const HistoryView = lazy(() => import("@/components/workspace/views/HistoryView").then((module) => ({ default: module.HistoryView })));
const StructureNodeView = lazy(() => import("@/components/workspace/views/StructureNodeView").then((module) => ({ default: module.StructureNodeView })));
const PlotBoard = lazy(() => import("@/components/plot/PlotBoard").then((module) => ({ default: module.PlotBoard })));
const PlotReadingView = lazy(() => import("@/components/plot/PlotReadingView").then((module) => ({ default: module.PlotReadingView })));
// Roman : manuscrit continu, suivi de rédaction, dossier éditorial.
const ManuscriptView = lazy(() => import("@/components/novel/ManuscriptView").then((module) => ({ default: module.ManuscriptView })));
const ProgressView = lazy(() => import("@/components/novel/ProgressView").then((module) => ({ default: module.ProgressView })));
const ReplaceView = lazy(() => import("@/components/novel/ReplaceView").then((module) => ({ default: module.ReplaceView })));
const ImportView = lazy(() => import("@/components/novel/ImportView").then((module) => ({ default: module.ImportView })));
const ScriptReadView = lazy(() => import("@/components/manga/ScriptReadView").then((module) => ({ default: module.ScriptReadView })));
const ScriptProgressView = lazy(() => import("@/components/manga/ScriptProgressView").then((module) => ({ default: module.ScriptProgressView })));
const ContinuityView = lazy(() => import("@/components/manga/ContinuityView").then((module) => ({ default: module.ContinuityView })));
const EditorialView = lazy(() => import("@/components/novel/EditorialView").then((module) => ({ default: module.EditorialView })));

interface WorkspaceViewProps {
  /** Identifiant de l'onglet à afficher. */
  tabId: string;
  project: Project;
  onOpenFeature: (featureId: string) => void;
  /** Ferme cet onglet sans question (ex. personnage supprimé). */
  onCloseTab: (tabId: string) => void;
}

/**
 * Choisit l'interface à afficher dans la zone centrale selon l'onglet.
 *
 * Pour brancher une nouvelle interface : ajouter la fonctionnalité dans
 * `modules.ts`, puis son cas ici.
 */
export function WorkspaceView(props: WorkspaceViewProps) {
  const { t } = useTranslation("common");
  return (
    <Suspense
      fallback={
        <main className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground" role="status">
          <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
          {t("loading")}
        </main>
      }
    >
      {/* Un onglet qui plante n'emporte pas le reste de l'espace de travail. */}
      <ErrorBoundary scope="tab">
        <WorkspaceContent {...props} />
      </ErrorBoundary>
    </Suspense>
  );
}

function WorkspaceContent({
  tabId,
  project,
  onOpenFeature,
  onCloseTab,
}: WorkspaceViewProps) {
  if (tabId === HOME_TAB) {
    return <WorkspaceHome project={project} />;
  }

  if (tabId.startsWith(SETTINGS_PREFIX)) {
    return (
      <ProjectSettingsPanel
        project={project}
        section={tabId.slice(SETTINGS_PREFIX.length) as ProjectSettingsId}
      />
    );
  }

  const found = findFeature(tabId);

  if (!found) {
    return null;
  }

  const { module, feature } = found;

  // ---------------------------------------------------------------------------
  // Synopsis
  // ---------------------------------------------------------------------------
  if (tabId === "history") {
    return <HistoryView projectId={project.id} feature={feature} onOpenFeature={onOpenFeature} />;
  }

  if (tabId === "trash") {
    return <TrashView projectId={project.id} feature={feature} />;
  }

  if (tabId === "synopsis.edit") {
    return <SynopsisEditView projectId={project.id} feature={feature} />;
  }

  // ---------------------------------------------------------------------------
  // Découpage du récit
  // ---------------------------------------------------------------------------
  const structureNodeId = structureNodeIdOfTab(tabId);

  if (structureNodeId) {
    return (
      <StructureNodeView
        projectId={project.id}
        nodeId={structureNodeId}
        onClose={() => onCloseTab(tabId)}
        onOpenFeature={onOpenFeature}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Trame
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Roman (réservé aux projets de roman ; l'onglet se ferme sinon)
  // ---------------------------------------------------------------------------
  if (NOVEL_FEATURES.has(tabId) && project.type !== "novel") {
    return null;
  }

  if (tabId === "manuscript.read") {
    return <ManuscriptView project={project} feature={feature} onOpenFeature={onOpenFeature} />;
  }

  if (tabId === "manuscript.progress") {
    return <ProgressView project={project} feature={feature} onOpenFeature={onOpenFeature} />;
  }

  if (tabId === "manuscript.replace") {
    return <ReplaceView project={project} feature={feature} onOpenFeature={onOpenFeature} />;
  }

  if (tabId === "manuscript.import") {
    return <ImportView project={project} feature={feature} onOpenFeature={onOpenFeature} />;
  }

  if (tabId === "manuscript.editorial") {
    return <EditorialView project={project} feature={feature} />;
  }

  // ---------------------------------------------------------------------------
  // Manga / BD (réservé aux projets de manga ; l'onglet se ferme sinon)
  // ---------------------------------------------------------------------------
  if (MANGA_FEATURES.has(tabId) && project.type !== "manga") {
    return null;
  }

  if (tabId === "script.read") {
    return <ScriptReadView project={project} feature={feature} onOpenFeature={onOpenFeature} />;
  }

  if (tabId === "script.progress") {
    return <ScriptProgressView project={project} feature={feature} onOpenFeature={onOpenFeature} />;
  }

  if (tabId === "script.continuity") {
    return <ContinuityView project={project} feature={feature} onOpenFeature={onOpenFeature} />;
  }

  if (tabId === "plot.board") {
    return <PlotBoard projectId={project.id} feature={feature} onOpenFeature={onOpenFeature} />;
  }

  if (tabId === "plot.reading") {
    return <PlotReadingView projectId={project.id} feature={feature} onOpenFeature={onOpenFeature} />;
  }


  if (tabId === "structure.plan") {
    return <StructurePlanView project={project} feature={feature} onOpenFeature={onOpenFeature} />;
  }

  // ---------------------------------------------------------------------------
  // Personnages
  // ---------------------------------------------------------------------------
  const characterId = characterIdOfTab(tabId);

  if (characterId) {
    return (
      <CharacterEditView
        projectId={project.id}
        characterId={characterId}
        onClose={() => onCloseTab(tabId)}
        onOpenFeature={onOpenFeature}
      />
    );
  }

  if (tabId === "characters.create") {
    return (
      <CharacterCreateView
        projectId={project.id}
        feature={feature}
        onOpenFeature={onOpenFeature}
      />
    );
  }

  if (tabId === "characters.relations") {
    return <RelationsView projectId={project.id} feature={feature} onOpenFeature={onOpenFeature} />;
  }

  if (tabId === "characters.list") {
    return (
      <CharacterListView
        projectId={project.id}
        feature={feature}
        onOpenFeature={onOpenFeature}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Lieux
  // ---------------------------------------------------------------------------
  const locationId = locationIdOfTab(tabId);

  if (locationId) {
    return (
      <LocationEditView
        projectId={project.id}
        locationId={locationId}
        onClose={() => onCloseTab(tabId)}
        onOpenFeature={onOpenFeature}
      />
    );
  }

  if (tabId === "locations.create") {
    return <LocationCreateView projectId={project.id} feature={feature} onOpenFeature={onOpenFeature} />;
  }

  if (tabId === "locations.list") {
    return <LocationListView projectId={project.id} feature={feature} onOpenFeature={onOpenFeature} />;
  }

  // ---------------------------------------------------------------------------
  // Notes
  // ---------------------------------------------------------------------------
  const noteId = noteIdOfTab(tabId);

  if (noteId) {
    return (
      <NoteEditView
        // Une autre note dans le même onglet : éditeur neuf.
        key={noteId}
        projectId={project.id}
        noteId={noteId}
        onClose={() => onCloseTab(tabId)}
        onOpenFeature={onOpenFeature}
      />
    );
  }

  if (tabId === "notes.create") {
    return <NoteCreateView projectId={project.id} feature={feature} onOpenFeature={onOpenFeature} />;
  }

  if (tabId === "notes.list") {
    return <NotesListView projectId={project.id} feature={feature} onOpenFeature={onOpenFeature} />;
  }

  if (tabId === "notes.wall") {
    return <StickyWallView projectId={project.id} feature={feature} />;
  }

  // ---------------------------------------------------------------------------
  // Listes vides génériques
  // ---------------------------------------------------------------------------
  if (tabId.endsWith(".list")) {
    return (
      <EmptyListView
        module={module}
        feature={feature}
        createFeature={module.features.find((item) =>
          item.id.endsWith(".create"),
        )}
        onOpenFeature={onOpenFeature}
      />
    );
  }

  return <ComingSoonView feature={feature} />;
}