import { call } from "./client";
import type { ImageFrame } from "@/lib/imageFrame";

/** Cadrage des images du projet (voir `commands/image_frames.rs`). */
export const imageFramesApi = {
  /** Tous les cadrages, avec la clé de leur image. */
  listImageFrames: (projectId: string) => call<Array<ImageFrame & { key: string }>>("list_image_frames", { projectId }),

  /** Cadrage d'une image ; `null` : de nouveau centrée, sans zoom. */
  setImageFrame: (projectId: string, key: string, frame: ImageFrame | null) => call<void>("set_image_frame", { projectId, key, frame }),
};
