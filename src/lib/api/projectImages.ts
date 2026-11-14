import { call } from "./client";
import type { CharacterPortrait, ProjectImage } from "@/types";

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

  /** Ajoute une image à la galerie (`data` : image en base64). */
  addProjectGalleryImage: (projectId: string, data: string, caption: string | null = null) =>
    call<ProjectImage>("add_project_gallery_image", { projectId, data, caption }),

  /** Change la légende d'une image. */
  setProjectGalleryCaption: (projectId: string, imageId: string, caption: string | null) =>
    call<void>("set_project_gallery_caption", { projectId, imageId, caption }),

  /** Supprime une image de la galerie. */
  deleteProjectGalleryImage: (projectId: string, imageId: string) =>
    call<void>("delete_project_gallery_image", { projectId, imageId }),
};
