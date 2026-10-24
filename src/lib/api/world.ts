import { call } from "./client";
import type {
  Character,
  CharacterPortrait,
  CustomLocationType,
  WorldEntry,
  WorldEntryInput,
  WorldImage,
  WorldLink,
  WorldLinkInput,
  WorldModule,
  WorldSettings,
} from "@/types";

/**
 * Objets, faune et flore (`module` : `item` ou `species`) et liens entre
 * éléments. Voir `commands/world.rs`.
 */
export const worldApi = {
  // -------------------------------------------------------------------------
  // Réglages
  // -------------------------------------------------------------------------

  getWorldSettings: (projectId: string, module: WorldModule) =>
    call<WorldSettings>("get_world_settings", { projectId, module }),

  /** Active ou désactive le module (rien n'est supprimé). */
  setWorldEnabled: (projectId: string, module: WorldModule, enabled: boolean) =>
    call<WorldSettings>("set_world_enabled", { projectId, module, enabled }),

  /** Catégories utilisées (au moins une). */
  setWorldCategories: (projectId: string, module: WorldModule, categories: string[]) =>
    call<WorldSettings>("set_world_categories", { projectId, module, categories }),

  setWorldDetailLevel: (projectId: string, module: WorldModule, level: string) =>
    call<WorldSettings>("set_world_detail_level", { projectId, module, level }),

  setWorldCustomTypes: (
    projectId: string,
    module: WorldModule,
    types: Array<Omit<CustomLocationType, "id"> & { id?: string }>,
  ) => call<WorldSettings>("set_world_custom_types", { projectId, module, types }),

  setWorldList: (projectId: string, module: WorldModule, list: "status", values: string[] | null) =>
    call<WorldSettings>("set_world_list", { projectId, module, list, values }),

  // -------------------------------------------------------------------------
  // Fiches
  // -------------------------------------------------------------------------

  listWorldEntries: (projectId: string, module: WorldModule) =>
    call<WorldEntry[]>("list_world_entries", { projectId, module }),

  createWorldEntry: (projectId: string, module: WorldModule, input: WorldEntryInput) =>
    call<WorldEntry>("create_world_entry", { projectId, module, input }),

  updateWorldEntry: (projectId: string, module: WorldModule, entryId: string, input: WorldEntryInput) =>
    call<WorldEntry>("update_world_entry", { projectId, module, entryId, input }),

  /** Supprime une fiche (corbeille) ; renvoie l'identifiant de l'entrée. */
  deleteWorldEntry: (projectId: string, module: WorldModule, entryId: string) =>
    call<string>("delete_world_entry", { projectId, module, entryId }),

  // -------------------------------------------------------------------------
  // Animal personnage
  // -------------------------------------------------------------------------

  /** Associe un animal précis à un personnage existant (`null` : retire le lien). */
  setSpeciesCharacter: (projectId: string, entryId: string, characterId: string | null) =>
    call<WorldEntry>("set_species_character", { projectId, entryId, characterId }),

  /** Crée la fiche de personnage d'un animal précis. */
  createSpeciesCharacter: (projectId: string, entryId: string) =>
    call<{ entry: WorldEntry; character: Character }>("create_species_character", { projectId, entryId }),

  // -------------------------------------------------------------------------
  // Images
  // -------------------------------------------------------------------------

  getWorldEntryPortrait: (projectId: string, module: WorldModule, entryId: string) =>
    call<CharacterPortrait | null>("get_world_entry_portrait", { projectId, module, entryId }),

  setWorldEntryPortrait: (projectId: string, module: WorldModule, entryId: string, data: string) =>
    call<WorldEntry>("set_world_entry_portrait", { projectId, module, entryId, data }),

  removeWorldEntryPortrait: (projectId: string, module: WorldModule, entryId: string) =>
    call<WorldEntry>("remove_world_entry_portrait", { projectId, module, entryId }),

  listWorldEntryGallery: (projectId: string, module: WorldModule, entryId: string) =>
    call<WorldImage[]>("list_world_entry_gallery", { projectId, module, entryId }),

  getWorldEntryGalleryImage: (projectId: string, module: WorldModule, imageId: string) =>
    call<CharacterPortrait>("get_world_entry_gallery_image", { projectId, module, imageId }),

  addWorldEntryGalleryImage: (
    projectId: string,
    module: WorldModule,
    entryId: string,
    data: string,
    caption: string | null = null,
  ) => call<WorldImage>("add_world_entry_gallery_image", { projectId, module, entryId, data, caption }),

  setWorldEntryGalleryCaption: (projectId: string, module: WorldModule, imageId: string, caption: string | null) =>
    call<void>("set_world_entry_gallery_caption", { projectId, module, imageId, caption }),

  deleteWorldEntryGalleryImage: (projectId: string, module: WorldModule, imageId: string) =>
    call<void>("delete_world_entry_gallery_image", { projectId, module, imageId }),

  // -------------------------------------------------------------------------
  // Liens entre éléments
  // -------------------------------------------------------------------------

  listWorldLinks: (projectId: string) => call<WorldLink[]>("list_world_links", { projectId }),

  createWorldLink: (projectId: string, input: WorldLinkInput) =>
    call<WorldLink>("create_world_link", { projectId, input }),

  updateWorldLink: (projectId: string, linkId: string, input: WorldLinkInput) =>
    call<WorldLink>("update_world_link", { projectId, linkId, input }),

  deleteWorldLink: (projectId: string, linkId: string) => call<string>("delete_world_link", { projectId, linkId }),
};
