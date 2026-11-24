import { useEffect } from "react";
import { create } from "zustand";
import { api } from "@/lib/api";
import { isNeutralFrame, normalizeFrame, type ImageFrame } from "@/lib/imageFrame";
import { onSessionEnd } from "@/lib/sessionCache";

/*
 * Cadrages des images du projet ouvert, chargés une fois et partagés par
 * toutes les vues : un cadrage changé dans la fiche se voit aussitôt dans
 * les listes, les vignettes et les liens.
 */

interface ImageFrameState {
  projectId: string | null;
  frames: Record<string, ImageFrame> | null;
  loading: boolean;
  fetchFrames: (projectId: string) => Promise<void>;
  /** Enregistre le cadrage d'une image (`null` : centrée, sans zoom). */
  setFrame: (projectId: string, key: string, frame: ImageFrame | null) => Promise<void>;
}

export const useImageFrameStore = create<ImageFrameState>((set, get) => ({
  projectId: null,
  frames: null,
  loading: false,

  fetchFrames: async (projectId) => {
    if (get().projectId === projectId && (get().frames || get().loading)) return;
    set({ projectId, frames: get().projectId === projectId ? get().frames : null, loading: true });
    try {
      const list = await api.listImageFrames(projectId);
      if (get().projectId !== projectId) return;
      set({ frames: Object.fromEntries(list.map(({ key, ...frame }) => [key, frame])), loading: false });
    } catch {
      // Cadrages indisponibles : les images restent centrées.
      if (get().projectId === projectId) set({ frames: {}, loading: false });
    }
  },

  setFrame: async (projectId, key, frame) => {
    const value = frame && !isNeutralFrame(frame) ? normalizeFrame(frame) : null;
    await api.setImageFrame(projectId, key, value);
    if (get().projectId !== projectId) return;
    const frames = { ...(get().frames ?? {}) };
    if (value) frames[key] = value;
    else delete frames[key];
    set({ frames });
  },
}));

/** Cadrage d'une image (`null` : centrée, sans zoom), chargé au premier besoin. */
export function useImageFrame(projectId: string | null | undefined, key: string | null | undefined): ImageFrame | null {
  const frame = useImageFrameStore((s) => (projectId && key && s.projectId === projectId ? (s.frames?.[key] ?? null) : null));
  const needsFetch = useImageFrameStore((s) => Boolean(projectId) && (s.projectId !== projectId || (!s.frames && !s.loading)));
  const fetchFrames = useImageFrameStore((s) => s.fetchFrames);
  useEffect(() => {
    if (projectId && needsFetch) void fetchFrames(projectId);
  }, [projectId, needsFetch, fetchFrames]);
  return frame;
}

// Fin de session (déconnexion, autre compte) : plus rien de ce projet en mémoire.
onSessionEnd(() => useImageFrameStore.setState(useImageFrameStore.getInitialState(), true));
