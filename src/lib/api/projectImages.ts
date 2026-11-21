import { call } from "./client";
import type { CharacterPortrait, GalleryFolder, ProjectImage } from "@/types";

/** Logo du projet et galerie de l'univers (voir `project_image_service.rs`). */
export const projectImagesApi = {
  /** Logo du projet (`null` : il n'en a pas). */
  getProjectLogo: (projectId: string) =>
    call<CharacterPortrait | null>("get_project_logo", { projectId }),

  /** Remplace le logo (`data` : image en base64). */
  setProjectLogo: (projectId: string, data: string) =>
    call<CharacterPortrait>("set_project_logo", { projectId, data }),

  /** Retire le logo. */
  removeProjectLogo: (projectId: string) =>
    call<void>("remove_project_logo", { projectId }),

  /** Images de la galerie de l'univers (sans leur contenu). */
  listProjectGallery: (projectId: string) =>
    call<ProjectImage[]>("list_project_gallery", { projectId }),

  /** Contenu d'une image de la galerie. */
  getProjectGalleryImage: (projectId: string, imageId: string) =>
    call<CharacterPortrait>("get_project_gallery_image", { projectId, imageId }),

  /** Ajoute une image à la galerie (`data` : image en base64), dans `folderId` (`null` : à la racine). */
  addProjectGalleryImage: (projectId: string, data: string, caption: string | null = null, folderId: string | null = null) =>
    call<ProjectImage>("add_project_gallery_image", { projectId, data, caption, folderId }),

  /** Nom et description d'une image (vides : effacés). */
  updateProjectGalleryImage: (projectId: string, imageId: string, details: { caption: string | null; description: string | null }) =>
    call<ProjectImage>("update_project_gallery_image", { projectId, imageId, ...details }),

  /** Range des images dans un dossier (`null` : à la racine). */
  moveProjectGalleryImages: (projectId: string, imageIds: string[], folderId: string | null) =>
    call<void>("move_project_gallery_images", { projectId, imageIds, folderId }),

  /** Dossiers de la galerie. */
  listGalleryFolders: (projectId: string) => call<GalleryFolder[]>("list_gallery_folders", { projectId }),

  /** Crée un dossier (dans `parentId`, ou à la racine). */
  createGalleryFolder: (projectId: string, parentId: string | null, name: string) =>
    call<GalleryFolder>("create_gallery_folder", { projectId, parentId, name }),

  /** Renomme un dossier. */
  renameGalleryFolder: (projectId: string, folderId: string, name: string) =>
    call<GalleryFolder>("rename_gallery_folder", { projectId, folderId, name }),

  /** Déplace un dossier (dans `parentId`, ou à la racine). */
  moveGalleryFolder: (projectId: string, folderId: string, parentId: string | null) =>
    call<GalleryFolder>("move_gallery_folder", { projectId, folderId, parentId }),

  /** Supprime un dossier et ses sous-dossiers ; leurs images reviennent à la racine. */
  deleteGalleryFolder: (projectId: string, folderId: string) => call<void>("delete_gallery_folder", { projectId, folderId }),

  /** Range la galerie : `imageIds` donne le nouvel ordre de toutes les images. */
  reorderProjectGallery: (projectId: string, imageIds: string[]) =>
    call<void>("reorder_project_gallery", { projectId, imageIds }),

  /** Change la légende d'une image. */
  setProjectGalleryCaption: (projectId: string, imageId: string, caption: string | null) =>
    call<void>("set_project_gallery_caption", { projectId, imageId, caption }),

  /** Supprime une image de la galerie. */
  deleteProjectGalleryImage: (projectId: string, imageId: string) =>
    call<void>("delete_project_gallery_image", { projectId, imageId }),
};
