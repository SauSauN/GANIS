import { ProjectSettingsPanel } from "@/components/project-settings/ProjectSettingsPanel";
import type { ProjectSettingsId } from "@/components/project-settings/sections";
import {
  HOME_TAB,
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
import { NoteEditView } from "@/components/workspace/views/NoteEditView";
import { NotesListView } from "@/components/workspace/views/NotesListView";
import { RelationsView } from "@/components/workspace/views/RelationsView";
import { StickyWallView } from "@/components/workspace/views/StickyWallView";
import { TrashView } from "@/components/workspace/views/TrashView";
import { HistoryView } from "@/components/workspace/views/HistoryView";
import {
  ComingSoonView,
  EmptyListView,
} from "@/components/workspace/views/GenericViews";
import { StructureNodeView } from "@/components/workspace/views/StructureNodeView";
import { StructurePlanView } from "@/components/workspace/views/StructurePlanView";
import { SynopsisEditView } from "@/components/workspace/views/SynopsisEditView";
import { WorkspaceHome } from "@/components/workspace/WorkspaceHome";
import { characterIdOfTab } from "@/lib/characters";
import { locationIdOfTab } from "@/lib/locations";
import { noteIdOfTab } from "@/lib/notes";
import { structureNodeIdOfTab } from "@/lib/structure";
import type { Project } from "@/types";

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
export function WorkspaceView({
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