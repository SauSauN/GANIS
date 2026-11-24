import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PanelItemActions } from "@/components/common/PanelItemActions";
import { deleteLane, duplicateLane } from "@/components/plot/actions";
import { announceDeletion } from "@/lib/trash";
import { api } from "@/lib/api";
import { fullName, MAX_NAME_LENGTH } from "@/lib/characters";
import { MAX_LOCATION_NAME_LENGTH } from "@/lib/locations";
import { MAX_NOTE_TITLE } from "@/lib/notes";
import {
  duplicateCharacter,
  duplicateLocation,
  duplicateNote,
  duplicateStructureNode,
  duplicateWorldEntry,
} from "@/lib/panelActions";
import { structureNodeTabId } from "@/lib/structure";
import { createFeatureOf, hasNature, MAX_WORLD_NAME_LENGTH } from "@/lib/world";
import { useCharacterStore } from "@/stores/characterStore";
import { useLocationStore } from "@/stores/locationStore";
import { useNoteStore } from "@/stores/noteStore";
import { usePlotStore } from "@/stores/plotStore";
import { useBoardStore, type BoardEntry } from "@/stores/boardStore";
import { useStructureStore } from "@/stores/structureStore";
import { useWorldStore } from "@/stores/worldStore";
import type { PlotLane } from "@/lib/plot";
import type { Character, Location, NoteSummary, StructureNode, WorldEntry, WorldModule } from "@/types";

/*
 * Menus clic droit des lignes du panneau du milieu, un par module. Chacun
 * enveloppe la ligne : `children` reçoit le gestionnaire à poser sur elle.
 */

type Row = (onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void) => ReactNode;

function usePanelText() {
  const { t } = useTranslation("common");
  return t as unknown as (key: string, options?: Record<string, unknown>) => string;
}

export function CharacterItemMenu({ projectId, character, onOpen, children }: { projectId: string; character: Character; onOpen: () => void; children: Row }) {
  const t = usePanelText();
  const name = fullName(character);
  return (
    <PanelItemActions
      name={name}
      onOpen={onOpen}
      rename={{
        fields: [
          { key: "firstName", label: t("panelActions.firstNameLabel"), value: character.firstName, maxLength: MAX_NAME_LENGTH },
          { key: "lastName", label: t("panelActions.lastNameLabel"), value: character.lastName, maxLength: MAX_NAME_LENGTH },
        ],
        save: async (values) => {
          await useCharacterStore.getState().updateCharacter(projectId, character.id, {
            firstName: values.firstName,
            lastName: values.lastName.toLocaleUpperCase(),
            role: character.role,
            status: character.status,
            fields: character.fields,
          });
        },
      }}
      onDuplicate={async () => {
        await duplicateCharacter(projectId, character);
      }}
      remove={{
        description: t("panelActions.deleteTrash", { name }),
        run: () => useCharacterStore.getState().deleteCharacter(projectId, character.id),
      }}
    >
      {children}
    </PanelItemActions>
  );
}

export function LocationItemMenu({
  projectId,
  location,
  onOpen,
  onOpenFeature,
  children,
}: {
  projectId: string;
  location: Location;
  onOpen: () => void;
  onOpenFeature: (featureId: string) => void;
  children: Row;
}) {
  const t = usePanelText();
  return (
    <PanelItemActions
      name={location.name}
      onOpen={onOpen}
      rename={{
        fields: [{ key: "name", label: t("panelActions.nameLabel"), value: location.name, maxLength: MAX_LOCATION_NAME_LENGTH }],
        save: async ({ name }) => {
          await useLocationStore.getState().updateLocation(projectId, location.id, {
            name,
            type: location.type,
            parentId: location.parentId,
            status: location.status,
            fields: location.fields,
          });
        },
      }}
      addInside={{
        label: t("panelActions.addInside"),
        run: () => {
          useLocationStore.getState().setCreatePreset({ parentId: location.id });
          onOpenFeature("locations.create");
        },
      }}
      onDuplicate={async () => {
        await duplicateLocation(projectId, location);
      }}
      remove={{
        description: t("panelActions.deleteTrashChildren", { name: location.name }),
        run: () => useLocationStore.getState().deleteLocation(projectId, location.id),
      }}
    >
      {children}
    </PanelItemActions>
  );
}

export function WorldItemMenu({
  projectId,
  module,
  entry,
  onOpen,
  onOpenFeature,
  children,
}: {
  projectId: string;
  module: WorldModule;
  entry: WorldEntry;
  onOpen: () => void;
  onOpenFeature: (featureId: string) => void;
  children: Row;
}) {
  const t = usePanelText();
  // Comme sur la fiche : seule une espèce (ou un objet, une faction) en regroupe d'autres.
  const canContain = !hasNature(module) || entry.nature === "species";
  return (
    <PanelItemActions
      name={entry.name}
      onOpen={onOpen}
      rename={{
        fields: [{ key: "name", label: t("panelActions.nameLabel"), value: entry.name, maxLength: MAX_WORLD_NAME_LENGTH }],
        save: async ({ name }) => {
          await useWorldStore.getState().updateEntry(projectId, module, entry.id, {
            name,
            type: entry.type,
            nature: entry.nature,
            parentId: entry.parentId,
            status: entry.status,
            fields: entry.fields,
          });
        },
      }}
      addInside={
        canContain
          ? {
              label: t("panelActions.addInside"),
              run: () => {
                useWorldStore.getState().setCreatePreset(module, { parentId: entry.id, nature: "individual" });
                onOpenFeature(createFeatureOf(module));
              },
            }
          : undefined
      }
      onDuplicate={async () => {
        await duplicateWorldEntry(projectId, module, entry);
      }}
      remove={{
        description: t("panelActions.deleteTrashChildren", { name: entry.name }),
        run: () => useWorldStore.getState().deleteEntry(projectId, module, entry.id),
      }}
    >
      {children}
    </PanelItemActions>
  );
}

export function StructureItemMenu({
  projectId,
  node,
  label,
  canAddInside,
  onOpen,
  onOpenFeature,
  children,
}: {
  projectId: string;
  node: StructureNode;
  /** Titre affiché (« Chapitre 3 — La traversée »). */
  label: string;
  /** Faux au dernier niveau du modèle : rien ne peut aller dedans. */
  canAddInside: boolean;
  onOpen: () => void;
  onOpenFeature: (featureId: string) => void;
  children: Row;
}) {
  const t = usePanelText();
  const reload = () => useStructureStore.getState().fetchStructure(projectId);
  return (
    <PanelItemActions
      name={label}
      onOpen={onOpen}
      rename={{
        fields: [
          {
            key: "title",
            label: t("panelActions.titleLabel"),
            value: node.title,
            maxLength: 200,
            placeholder: t("panelActions.titlePlaceholder"),
          },
        ],
        save: async ({ title }) => {
          await api.updateStructureNode(projectId, node.id, { title });
          await reload();
        },
      }}
      addInside={
        canAddInside
          ? {
              label: t("panelActions.addInside"),
              run: async () => {
                const created = await api.createStructureNode(projectId, { parentId: node.id, level: node.level + 1 });
                await reload();
                onOpenFeature(structureNodeTabId(created.id));
              },
            }
          : undefined
      }
      onDuplicate={async () => {
        await duplicateStructureNode(projectId, node, label);
      }}
      remove={{
        description: t("panelActions.deleteStructure", { name: label }),
        run: async () => {
          const trashId = await api.deleteStructureNode(projectId, node.id);
          announceDeletion(projectId, trashId, "structureNode", label);
          await reload();
        },
      }}
    >
      {children}
    </PanelItemActions>
  );
}

export function NoteItemMenu({
  projectId,
  note,
  name,
  onOpen,
  children,
}: {
  projectId: string;
  note: NoteSummary;
  /** Titre affiché (« Sans titre » pour une note sans titre). */
  name: string;
  onOpen: () => void;
  children: Row;
}) {
  const t = usePanelText();
  return (
    <PanelItemActions
      name={name}
      onOpen={onOpen}
      // Une note système reprend une fiche : son titre est fixe.
      rename={
        note.system
          ? undefined
          : {
              fields: [{ key: "title", label: t("panelActions.titleLabel"), value: note.title, maxLength: MAX_NOTE_TITLE }],
              save: async ({ title }) => {
                await useNoteStore.getState().updateNote(projectId, note.id, { title });
              },
            }
      }
      onDuplicate={async () => {
        await duplicateNote(projectId, note);
      }}
      remove={
        note.system
          ? undefined
          : {
              description: t("panelActions.deleteTrash", { name }),
              run: () => useNoteStore.getState().deleteNote(projectId, note.id),
            }
      }
    >
      {children}
    </PanelItemActions>
  );
}

/**
 * Planche d'inspiration (module Notes) : ouvrir, renommer, dupliquer,
 * supprimer. La suppression est définitive (pas de corbeille) ; les images
 * restent dans la galerie.
 */
export function BoardItemMenu({ projectId, board, onOpen, children }: { projectId: string; board: BoardEntry; onOpen: () => void; children: Row }) {
  const t = usePanelText();
  const { t: tb } = useTranslation("workspaceHome");
  return (
    <PanelItemActions
      name={board.name}
      onOpen={onOpen}
      rename={{
        fields: [{ key: "name", label: t("panelActions.nameLabel"), value: board.name, maxLength: 100, placeholder: tb("boards.namePlaceholder") }],
        save: async ({ name }) => {
          await useBoardStore.getState().rename(projectId, board.id, name);
        },
      }}
      onDuplicate={async () => {
        const name = tb("boards.copyName", { name: board.name }).slice(0, 100);
        await useBoardStore.getState().duplicate(projectId, board.id, name);
      }}
      remove={{
        description: tb("boards.deleteBody"),
        run: () => useBoardStore.getState().remove(projectId, board.id),
      }}
    >
      {children}
    </PanelItemActions>
  );
}

export function LaneItemMenu({ projectId, lane, onOpen, children }: { projectId: string; lane: PlotLane; onOpen: () => void; children: Row }) {
  const t = usePanelText();
  return (
    <PanelItemActions
      name={lane.name}
      onOpen={onOpen}
      rename={{
        fields: [{ key: "name", label: t("panelActions.nameLabel"), value: lane.name, maxLength: 80, placeholder: t("placeholders.laneName") }],
        save: async ({ name }) => {
          usePlotStore.getState().mutate(projectId, (d) => {
            const target = d.lanes.find((item) => item.id === lane.id);
            if (target) target.name = name;
          });
        },
      }}
      onDuplicate={async () => {
        duplicateLane(projectId, lane.id);
      }}
      remove={{
        description: t("panelActions.deleteLane", { name: lane.name }),
        run: async () => {
          deleteLane(projectId, lane.id);
        },
      }}
    >
      {children}
    </PanelItemActions>
  );
}
