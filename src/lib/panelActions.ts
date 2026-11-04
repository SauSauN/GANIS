import i18n from "@/i18n";
import { api } from "@/lib/api";
import { notifySaved } from "@/lib/notify";
import { useCharacterStore } from "@/stores/characterStore";
import { useLocationStore } from "@/stores/locationStore";
import { useNoteStore } from "@/stores/noteStore";
import { useStructureStore } from "@/stores/structureStore";
import { useWorldStore } from "@/stores/worldStore";
import type { Character, Location, NoteSummary, StructureNode, WorldEntry, WorldModule } from "@/types";

/*
 * Duplication depuis le menu clic droit du panneau du milieu. La copie
 * reprend la fiche (type, statut, parent, champs) et l'image principale ;
 * pas la galerie, ni les liens, ni ce que l'élément contient.
 */

/** « Nom (copie) ». */
export function copyName(name: string): string {
  return i18n.t("common:panelActions.copyName", { name });
}

function announce(name: string) {
  notifySaved(i18n.t("common:panelActions.duplicated", { name }), "panel-duplicate");
}

export async function duplicateCharacter(projectId: string, character: Character): Promise<Character> {
  const store = useCharacterStore.getState();
  // Le nom de famille est en capitales : « (copie) » va après le prénom.
  const named = character.firstName.trim() ? { firstName: copyName(character.firstName) } : { lastName: copyName(character.lastName) };
  const created = await store.createCharacter(projectId, {
    firstName: character.firstName,
    lastName: character.lastName,
    role: character.role,
    status: character.status,
    fields: { ...character.fields },
    ...named,
  });
  if (character.portraitUpdatedAt) {
    const portrait = await api.getCharacterPortrait(projectId, character.id);
    if (portrait) await store.setPortrait(projectId, created.id, portrait.data);
  }
  announce(copyName([character.firstName, character.lastName].filter(Boolean).join(" ")));
  return created;
}

export async function duplicateLocation(projectId: string, location: Location): Promise<Location> {
  const store = useLocationStore.getState();
  const created = await store.createLocation(projectId, {
    name: copyName(location.name),
    type: location.type,
    parentId: location.parentId,
    status: location.status,
    fields: { ...location.fields },
  });
  if (location.portraitUpdatedAt) {
    const portrait = await api.getLocationPortrait(projectId, location.id);
    if (portrait) await store.setPortrait(projectId, created.id, portrait.data);
  }
  announce(created.name);
  return created;
}

export async function duplicateWorldEntry(projectId: string, module: WorldModule, entry: WorldEntry): Promise<WorldEntry> {
  const store = useWorldStore.getState();
  const created = await store.createEntry(projectId, module, {
    name: copyName(entry.name),
    type: entry.type,
    nature: entry.nature,
    parentId: entry.parentId,
    status: entry.status,
    fields: { ...entry.fields },
  });
  if (entry.portraitUpdatedAt) {
    const portrait = await api.getWorldEntryPortrait(projectId, module, entry.id);
    if (portrait) await store.setPortrait(projectId, module, created.id, portrait.data);
  }
  announce(created.name);
  return created;
}

/** Copie placée juste après l'original : titre, résumé et texte. */
export async function duplicateStructureNode(projectId: string, node: StructureNode, label: string): Promise<StructureNode> {
  const created = await api.createStructureNode(projectId, {
    parentId: node.parentId,
    level: node.level,
    title: node.title.trim() ? copyName(node.title) : "",
    afterId: node.id,
  });
  if (node.summary.trim()) await api.updateStructureNode(projectId, created.id, { summary: node.summary });
  if (node.contentWords > 0) {
    const content = await api.getStructureNodeContent(projectId, node.id);
    if (content.trim()) await api.setStructureNodeContent(projectId, created.id, content);
  }
  await useStructureStore.getState().fetchStructure(projectId);
  announce(copyName(label));
  return created;
}

export async function duplicateNote(projectId: string, summary: NoteSummary) {
  const store = useNoteStore.getState();
  const note = await api.getNote(projectId, summary.id);
  const created = await store.createNote(projectId, note.folderId, copyName(note.title));
  if (note.content) await store.updateNote(projectId, created.id, { content: note.content, excerpt: note.excerpt });
  announce(created.title);
  return created;
}
