import { call } from "./client";
import type {
  CharacterPortrait,
  CharacterListKey,
  CharacterSettings,
  GalleryImage,
  GraphPosition,
  CharacterLocation,
  CharacterLocationInput,
  Relation,
  RelationInput,
} from "@/types";

/** Personnages, liens personnage ↔ lieu et relations. */
export const charactersApi = {
  // -------------------------------------------------------------------------
  // Personnages
  // -------------------------------------------------------------------------

  /** Réglages des personnages du projet (niveau de détail des fiches). */
  getCharacterSettings: (projectId: string) =>
    call<CharacterSettings>("get_character_settings", { projectId }),

  /** Choisit le niveau de détail de toutes les fiches du projet. */
  setCharacterDetailLevel: (projectId: string, level: string) =>
    call<CharacterSettings>("set_character_detail_level", { projectId, level }),

  /** Remplace une liste personnalisable (`null` : valeurs par défaut). */
  setCharacterList: (projectId: string, list: CharacterListKey, values: string[] | null) =>
    call<CharacterSettings>("set_character_list", { projectId, list, values }),

  /** Images de la galerie d'un personnage (sans leur contenu). */
  listCharacterGallery: (projectId: string, characterId: string) =>
    call<GalleryImage[]>("list_character_gallery", { projectId, characterId }),

  /** Contenu d'une image de la galerie. */
  getCharacterGalleryImage: (projectId: string, imageId: string) =>
    call<CharacterPortrait>("get_character_gallery_image", { projectId, imageId }),

  /** Ajoute une image à la galerie (`data` : image en base64). */
  addCharacterGalleryImage: (projectId: string, characterId: string, data: string) =>
    call<GalleryImage>("add_character_gallery_image", { projectId, characterId, data }),

  /** Supprime une image de la galerie. */
  deleteCharacterGalleryImage: (projectId: string, imageId: string) =>
    call<void>("delete_character_gallery_image", { projectId, imageId }),

  // -------------------------------------------------------------------------
  // Liens personnage ↔ lieu
  // -------------------------------------------------------------------------

  /** Tous les liens personnage ↔ lieu du projet. */
  listCharacterLocations: (projectId: string) =>
    call<CharacterLocation[]>("list_character_locations", { projectId }),

  /** Crée un lien. */
  createCharacterLocation: (projectId: string, input: CharacterLocationInput) =>
    call<CharacterLocation>("create_character_location", { projectId, input }),

  /** Remplace un lien. */
  updateCharacterLocation: (projectId: string, linkId: string, input: CharacterLocationInput) =>
    call<CharacterLocation>("update_character_location", { projectId, linkId, input }),

  /** Supprime un lien. */
  deleteCharacterLocation: (projectId: string, linkId: string) =>
    call<string>("delete_character_location", { projectId, linkId }),

  // -------------------------------------------------------------------------
  // Relations entre personnages
  // -------------------------------------------------------------------------

  /** Toutes les relations du projet. */
  listRelations: (projectId: string) => call<Relation[]>("list_relations", { projectId }),

  /** Crée une relation. */
  createRelation: (projectId: string, input: RelationInput) =>
    call<Relation>("create_relation", { projectId, input }),

  /** Remplace une relation. */
  updateRelation: (projectId: string, relationId: string, input: RelationInput) =>
    call<Relation>("update_relation", { projectId, relationId, input }),

  /** Supprime une relation. */
  deleteRelation: (projectId: string, relationId: string) =>
    call<string>("delete_relation", { projectId, relationId }),

  /** Positions de la disposition libre du graphe. */
  getGraphPositions: (projectId: string) =>
    call<GraphPosition[]>("get_graph_positions", { projectId }),

  /** Enregistre des positions de la disposition libre. */
  saveGraphPositions: (projectId: string, positions: GraphPosition[]) =>
    call<void>("save_graph_positions", { projectId, positions }),

  /** Efface la disposition libre. */
  clearGraphPositions: (projectId: string) => call<void>("clear_graph_positions", { projectId }),
};
