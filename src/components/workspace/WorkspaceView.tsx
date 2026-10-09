import { ProjectSettingsPanel } from "@/components/project-settings/ProjectSettingsPanel";
import type { ProjectSettingsId } from "@/components/project-settings/sections";
import {
  HOME_TAB,
  SETTINGS_PREFIX,
  findFeature,
} from "@/components/workspace/modules";
import { CharacterCreateView } from "@/components/workspace/views/CharacterCreateView";
import {
  ComingSoonView,
  EmptyListView,
} from "@/components/workspace/views/GenericViews";
import { StructurePlanView } from "@/components/workspace/views/StructurePlanView";
import { SynopsisEditView } from "@/components/workspace/views/SynopsisEditView";
import { WorkspaceHome } from "@/components/workspace/WorkspaceHome";
import type { Project } from "@/types";

interface WorkspaceViewProps {
  /** Identifiant de l'onglet à afficher. */
  tabId: string;
  project: Project;
  onOpenFeature: (featureId: string) => void;
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
  if (tabId === "synopsis.edit") {
    return <SynopsisEditView projectId={project.id} feature={feature} />;
  }

  // ---------------------------------------------------------------------------
  // Découpage du récit
  // ---------------------------------------------------------------------------
  if (tabId === "structure.plan") {
    return <StructurePlanView project={project} feature={feature} />;
  }

  // ---------------------------------------------------------------------------
  // Personnages
  // ---------------------------------------------------------------------------
  if (tabId === "characters.create") {
    return <CharacterCreateView feature={feature} />;
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
