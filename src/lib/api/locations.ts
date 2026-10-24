import { call } from "./client";
import type {
  Character,
  CharacterInput,
  CharacterPortrait,
  Location,
  LocationImage,
  LocationInput,
  LocationSettings,
  CustomLocationType,
} from "@/types";

/** Lieux. */
export const locationsApi = {
  // -------------------------------------------------------------------------
  // Lieux
  // -------------------------------------------------------------------------

  /** Tous les lieux du projet, par nom. */
  listLocations: (projectId: string) =>
    call<Location[]>("list_locations", { projectId }),

  /** Crée un lieu. */
  createLocation: (projectId: string, input: LocationInput) =>
    call<Location>("create_location", { projectId, input }),

  /** Remplace la fiche d'un lieu. */
  updateLocation: (projectId: string, locationId: string, input: LocationInput) =>
    call<Location>("update_location", { projectId, locationId, input }),

  /** Supprime un lieu (ses lieux contenus remontent d'un niveau). */
  deleteLocation: (projectId: string, locationId: string) =>
    call<string>("delete_location", { projectId, locationId }),

  /** Réglages des lieux du projet (types ajoutés, listes). */
  getLocationSettings: (projectId: string) =>
    call<LocationSettings>("get_location_settings", { projectId }),

  /** Remplace les types de lieux ajoutés par l'auteur (`id` absent : nouveau). */
  setLocationCustomTypes: (
    projectId: string,
    types: Array<Omit<CustomLocationType, "id"> & { id?: string }>,
  ) => call<LocationSettings>("set_location_custom_types", { projectId, types }),

  /** Remplace une liste personnalisable (`null` : valeurs par défaut). */
  setLocationList: (projectId: string, list: "status", values: string[] | null) =>
    call<LocationSettings>("set_location_list", { projectId, list, values }),

  setLocationDetailLevel: (projectId: string, level: string) =>
    call<LocationSettings>("set_location_detail_level", { projectId, level }),

  /** Image principale d'un lieu (`null` : pas d'image). */
  getLocationPortrait: (projectId: string, locationId: string) =>
    call<CharacterPortrait | null>("get_location_portrait", { projectId, locationId }),

  /** Remplace l'image principale (`data` : image en base64). */
  setLocationPortrait: (projectId: string, locationId: string, data: string) =>
    call<Location>("set_location_portrait", { projectId, locationId, data }),

  /** Retire l'image principale. */
  removeLocationPortrait: (projectId: string, locationId: string) =>
    call<Location>("remove_location_portrait", { projectId, locationId }),

  /** Images de la galerie d'un lieu (sans leur contenu). */
  listLocationGallery: (projectId: string, locationId: string) =>
    call<LocationImage[]>("list_location_gallery", { projectId, locationId }),

  /** Contenu d'une image de la galerie. */
  getLocationGalleryImage: (projectId: string, imageId: string) =>
    call<CharacterPortrait>("get_location_gallery_image", { projectId, imageId }),

  /** Ajoute une image à la galerie (`data` : image en base64). */
  addLocationGalleryImage: (
    projectId: string,
    locationId: string,
    data: string,
    caption: string | null = null,
  ) => call<LocationImage>("add_location_gallery_image", { projectId, locationId, data, caption }),

  /** Change la légende d'une image. */
  setLocationGalleryCaption: (projectId: string, imageId: string, caption: string | null) =>
    call<void>("set_location_gallery_caption", { projectId, imageId, caption }),

  /** Supprime une image de la galerie. */
  deleteLocationGalleryImage: (projectId: string, imageId: string) =>
    call<void>("delete_location_gallery_image", { projectId, imageId }),

  /** Tous les personnages du projet, par ordre alphabétique. */
  listCharacters: (projectId: string) =>
    call<Character[]>("list_characters", { projectId }),

  /** Crée un personnage. */
  createCharacter: (projectId: string, input: CharacterInput) =>
    call<Character>("create_character", { projectId, input }),

  /** Remplace la fiche d'un personnage. */
  updateCharacter: (projectId: string, characterId: string, input: CharacterInput) =>
    call<Character>("update_character", { projectId, characterId, input }),

  /** Supprime un personnage et sa photo. */
  deleteCharacter: (projectId: string, characterId: string) =>
    call<string>("delete_character", { projectId, characterId }),

  /** Photo d'un personnage (`null` : pas de photo). */
  getCharacterPortrait: (projectId: string, characterId: string) =>
    call<CharacterPortrait | null>("get_character_portrait", { projectId, characterId }),

  /** Remplace la photo d'un personnage (`data` : image en base64). */
  setCharacterPortrait: (projectId: string, characterId: string, data: string) =>
    call<Character>("set_character_portrait", { projectId, characterId, data }),

  /** Retire la photo d'un personnage. */
  removeCharacterPortrait: (projectId: string, characterId: string) =>
    call<Character>("remove_character_portrait", { projectId, characterId }),
};
