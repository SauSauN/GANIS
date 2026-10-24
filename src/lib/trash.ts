import i18n from "@/i18n";
import { api } from "@/lib/api";
import { useCharacterStore } from "@/stores/characterStore";
import { useLocationStore } from "@/stores/locationStore";
import { useNoteStore } from "@/stores/noteStore";
import { usePlaceLinkStore } from "@/stores/placeLinkStore";
import { useRelationStore } from "@/stores/relationStore";
import { useStructureStore } from "@/stores/structureStore";
import { toast, useToastStore } from "@/stores/toastStore";
import { useTrashStore } from "@/stores/trashStore";
import { useWorldLinkStore } from "@/stores/worldLinkStore";
import { useWorldStore } from "@/stores/worldStore";
import { fullName } from "@/lib/characters";
import { useDocumentStore } from "@/lib/documents";
import { notifyMangaScriptChanged } from "@/lib/mangaEvents";
import type { CharacterLocation, Relation, TrashKind, WorldLink, WorldLinkKind } from "@/types";
import { errorText } from "@/lib/errors";

/*
 * Corbeille : « Annuler » juste après une suppression, et restauration.
 *
 * Rust range chaque élément supprimé dans la corbeille (avec tout ce qui a
 * disparu avec lui) et renvoie l'identifiant de l'entrée. Le store qui a
 * supprimé appelle `announceDeletion` : un message propose « Annuler »
 * pendant quelques secondes. Plus tard, la corbeille (Projet › Corbeille)
 * permet encore de restaurer pendant 30 jours.
 */

/** `t` sans vérification des clés (type d'élément connu à l'exécution). */
const t = i18n.t.bind(i18n) as unknown as (key: string, options?: Record<string, unknown>) => string;

/** Nom à afficher pour un élément (« Sans titre » si vide). */
export function trashLabel(kind: TrashKind, label: string): string {
  return label.trim() || t(`trash:untitled.${kind}`);
}

function characterName(projectId: string, id: string): string {
  const store = useCharacterStore.getState();
  const found = store.projectId === projectId ? store.characters.find((item) => item.id === id) : undefined;
  return found ? fullName(found) : "?";
}

/** « Aldric – Mira » pour une relation. */
export function relationLabel(projectId: string, relation: Relation | undefined): string {
  return relation ? `${characterName(projectId, relation.sourceId)} – ${characterName(projectId, relation.targetId)}` : "";
}

/** « Aldric – Valona » pour un lien personnage ↔ lieu. */
export function placeLinkLabel(projectId: string, link: CharacterLocation | undefined): string {
  if (!link) return "";
  const store = useLocationStore.getState();
  const place = store.projectId === projectId ? store.locations.find((item) => item.id === link.locationId) : undefined;
  return `${characterName(projectId, link.characterId)} – ${place?.name ?? "?"}`;
}

/** Nom d'un élément quelconque (lien du monde). */
function elementName(projectId: string, kind: WorldLinkKind, id: string): string {
  if (kind === "character") return characterName(projectId, id);
  if (kind === "location") {
    const store = useLocationStore.getState();
    return (store.projectId === projectId ? store.locations.find((item) => item.id === id)?.name : undefined) ?? "?";
  }
  const slice = useWorldStore.getState()[kind];
  return (slice.projectId === projectId ? slice.entries.find((item) => item.id === id)?.name : undefined) ?? "?";
}

/** « Aldric – Excalibur » pour un lien entre éléments. */
export function worldLinkLabel(projectId: string, link: WorldLink | undefined): string {
  if (!link) return "";
  return `${elementName(projectId, link.sourceKind, link.sourceId)} – ${elementName(projectId, link.targetKind, link.targetId)}`;
}

/** Dernière suppression annulable avec Ctrl+Z (tant que son message est affiché). */
let lastUndo: { toastId: number; run: () => Promise<void> } | null = null;

/** Message « … supprimé — Annuler » après une suppression. */
export function announceDeletion(projectId: string, trashId: string, kind: TrashKind, label: string) {
  useTrashStore.getState().invalidate(projectId);

  const run = async () => {
    useToastStore.getState().dismiss(toastId);
    lastUndo = null;
    await restoreFromTrash(projectId, trashId);
  };

  const toastId = toast({
    message: t(`trash:deleted.${kind}`, { name: trashLabel(kind, label) }),
    action: { label: t("trash:undo"), run },
  });

  lastUndo = { toastId, run };
}

/**
 * Suppression de plusieurs éléments à la fois (sélection multiple) : un seul
 * message « N éléments supprimés — Annuler », qui les restaure tous.
 */
export function announceDeletions(projectId: string, trashIds: string[]) {
  if (trashIds.length === 0) return;

  useTrashStore.getState().invalidate(projectId);

  const run = async () => {
    useToastStore.getState().dismiss(toastId);
    lastUndo = null;
    await restoreManyFromTrash(projectId, trashIds);
  };

  const toastId = toast({
    message: t("trash:deletedMany", { count: trashIds.length }),
    action: { label: t("trash:undo"), run },
  });

  lastUndo = { toastId, run };
}

/**
 * Ctrl+Z hors d'un champ de saisie : annule la dernière suppression si son
 * message est encore affiché. Renvoie `false` s'il n'y a rien à annuler.
 */
export function undoLastDeletion(): boolean {
  const undo = lastUndo;
  if (!undo || !useToastStore.getState().toasts.some((item) => item.id === undo.toastId)) {
    return false;
  }
  void undo.run();
  return true;
}

/** Relit les données du projet que la restauration a pu changer. */
async function refreshAfterRestore(projectId: string, kind: TrashKind) {
  const tasks: Array<Promise<unknown>> = [];

  const characters = useCharacterStore.getState();
  if (characters.projectId === projectId && ["character", "location"].includes(kind)) {
    tasks.push(characters.fetchCharacters(projectId));
  }

  const locations = useLocationStore.getState();
  if (locations.projectId === projectId && ["character", "location"].includes(kind)) {
    tasks.push(locations.fetchLocations(projectId));
  }

  const relations = useRelationStore.getState();
  if (relations.projectId === projectId && ["character", "relation", "structureNode"].includes(kind)) {
    tasks.push(relations.fetchRelations(projectId));
  }

  const links = usePlaceLinkStore.getState();
  if (links.projectId === projectId && ["character", "location", "placeLink", "structureNode"].includes(kind)) {
    tasks.push(links.fetchLinks(projectId));
  }

  const structure = useStructureStore.getState();
  if (structure.projectId === projectId && ["character", "location", "structureNode"].includes(kind)) {
    tasks.push(structure.fetchStructure(projectId), structure.fetchLinks(projectId));
  }

  // Objets, faune et flore, et leurs liens. Un personnage restauré peut
  // redevenir un animal (faune) ; un personnage ou un lieu restauré
  // ramène ses liens avec des objets et des espèces.
  const world = useWorldStore.getState();
  if (world.item.projectId === projectId && ["item", "structureNode"].includes(kind)) {
    tasks.push(world.fetchEntries(projectId, "item"));
  }
  if (world.species.projectId === projectId && ["species", "character", "structureNode"].includes(kind)) {
    tasks.push(world.fetchEntries(projectId, "species"));
  }

  const worldLinks = useWorldLinkStore.getState();
  if (
    worldLinks.projectId === projectId &&
    ["character", "location", "item", "species", "worldLink", "structureNode"].includes(kind)
  ) {
    tasks.push(worldLinks.fetchLinks(projectId));
  }

  // Documents (et ceux d'un élément du découpage restauré).
  if (kind === "document" || kind === "structureNode") useDocumentStore.getState().invalidate(projectId);

  const notes = useNoteStore.getState();
  if (notes.projectId === projectId) {
    if (kind === "note" || kind === "noteFolder") tasks.push(notes.fetchNotes(projectId));
    if (kind === "sticky") tasks.push(notes.fetchStickies(projectId));
  }

  // Scénario de manga : les pages ouvertes et les vues du scénario se relisent.
  if (kind === "mangaPanel" || kind === "structureNode" || kind === "character" || kind === "location") notifyMangaScriptChanged(projectId);

  await Promise.allSettled(tasks);
}

/** Restaure un élément de la corbeille ; affiche le résultat. */
/**
 * Restaure plusieurs éléments de la corbeille (sélection multiple). Chaque
 * module concerné est relu une seule fois ; un seul message résume le tout.
 * Retourne les identifiants restaurés.
 */
export async function restoreManyFromTrash(projectId: string, trashIds: string[]): Promise<string[]> {
  const restored: string[] = [];
  const kinds = new Set<TrashKind>();
  let failure: unknown = null;

  for (const trashId of trashIds) {
    try {
      const item = await api.restoreTrash(projectId, trashId);
      useTrashStore.getState().remove(projectId, trashId);
      kinds.add(item.kind);
      restored.push(trashId);
    } catch (error) {
      failure ??= error;
    }
  }

  for (const kind of kinds) {
    await refreshAfterRestore(projectId, kind);
  }

  if (restored.length > 0) {
    toast({ message: t("trash:restoredMany", { count: restored.length }), tone: "success" });
  }

  if (failure) {
    toast({
      message: t("trash:restoreFailedSome", { count: trashIds.length - restored.length, reason: errorText(failure) }),
      tone: "error",
    });
    // Un échec peut venir d'un élément déjà restauré avec un autre : la
    // liste est relue.
    void useTrashStore.getState().fetchTrash(projectId);
  }

  return restored;
}

export async function restoreFromTrash(projectId: string, trashId: string): Promise<boolean> {
  try {
    const item = await api.restoreTrash(projectId, trashId);
    useTrashStore.getState().remove(projectId, trashId);
    await refreshAfterRestore(projectId, item.kind);
    toast({ message: t(`trash:restored.${item.kind}`, { name: trashLabel(item.kind, item.label) }), tone: "success" });
    return true;
  } catch (error) {
    toast({ message: errorText(error), tone: "error" });
    return false;
  }
}
