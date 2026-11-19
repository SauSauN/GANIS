import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import type { SceneBlock } from "@/types";

/*
 * Scénario de série du projet ouvert : tous les éléments des scènes (pour
 * la lecture, l'export et le suivi). Relus quand une scène est enregistrée
 * (voir `notifySeriesScriptChanged`).
 */

const EVENT = "ganis:series-script-changed";

export function notifySeriesScriptChanged(projectId: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: projectId }));
}

/** Écoute les changements d'un projet ; renvoie la fonction pour arrêter. */
export function onSeriesScriptChanged(projectId: string, listener: () => void): () => void {
  const handler = (event: Event) => {
    if ((event as CustomEvent<string>).detail === projectId) listener();
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

interface SeriesState {
  projectId: string | null;
  blocks: SceneBlock[] | null;
  error: string | null;
  fetchBlocks: (projectId: string) => Promise<void>;
}

export const useSeriesStore = create<SeriesState>((set, get) => ({
  projectId: null,
  blocks: null,
  error: null,

  fetchBlocks: async (projectId) => {
    if (get().projectId !== projectId) set({ projectId, blocks: null, error: null });
    try {
      const blocks = await api.getSeriesBlocks(projectId);
      if (get().projectId === projectId) set({ blocks, error: null });
    } catch (e) {
      if (get().projectId === projectId) set({ error: errorText(e, "errors:load.series") });
    }
  },
}));

/** Tout le scénario du projet, relu quand une scène change (si `enabled`). */
export function useSeriesBlocks(projectId: string, enabled = true) {
  const blocks = useSeriesStore((s) => (enabled && s.projectId === projectId ? s.blocks : null));
  const error = useSeriesStore((s) => (enabled && s.projectId === projectId ? s.error : null));
  const fetchBlocks = useSeriesStore((s) => s.fetchBlocks);
  const reload = useCallback(() => void fetchBlocks(projectId), [fetchBlocks, projectId]);
  useEffect(() => {
    if (!enabled) return;
    reload();
    return onSeriesScriptChanged(projectId, reload);
  }, [enabled, projectId, reload]);
  return { blocks, error, reload };
}
