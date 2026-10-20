import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { api } from "@/lib/api";
import { onMangaScriptChanged } from "@/lib/mangaEvents";
import type { MangaSettings, Panel } from "@/types";
import { errorText } from "@/lib/errors";

/*
 * Scénario de manga du projet ouvert : seuils d'alerte du volume de texte,
 * et toutes les cases (pour la lecture, l'export, le suivi et la
 * continuité). Les cases sont relues quand une page est enregistrée ou
 * qu'une case est déplacée ou restaurée.
 */

interface MangaState {
  projectId: string | null;
  settings: MangaSettings | null;
  panels: Panel[] | null;
  error: string | null;
  fetchSettings: (projectId: string) => Promise<void>;
  saveSettings: (projectId: string, settings: MangaSettings) => Promise<void>;
  fetchPanels: (projectId: string) => Promise<void>;
}

const mine = (state: MangaState, projectId: string) => state.projectId === projectId;

export const useMangaStore = create<MangaState>((set, get) => ({
  projectId: null,
  settings: null,
  panels: null,
  error: null,

  fetchSettings: async (projectId) => {
    if (!mine(get(), projectId)) set({ projectId, settings: null, panels: null, error: null });
    try {
      const settings = await api.getMangaSettings(projectId);
      if (mine(get(), projectId)) set({ settings });
    } catch {
      // Seuils indisponibles : pas d'alerte, le reste fonctionne.
    }
  },

  saveSettings: async (projectId, value) => {
    const settings = await api.setMangaSettings(projectId, value);
    if (mine(get(), projectId)) set({ settings });
  },

  fetchPanels: async (projectId) => {
    if (!mine(get(), projectId)) set({ projectId, settings: null, panels: null, error: null });
    try {
      const panels = await api.getScriptPanels(projectId);
      if (mine(get(), projectId)) set({ panels, error: null });
    } catch (e) {
      if (mine(get(), projectId)) set({ error: errorText(e, "errors:load.manga") });
    }
  },
}));

/** Seuils d'alerte du projet (chargés au premier besoin). */
export function useMangaSettings(projectId: string, enabled = true) {
  const settings = useMangaStore((s) => (s.projectId === projectId ? s.settings : null));
  const fetchSettings = useMangaStore((s) => s.fetchSettings);
  useEffect(() => {
    if (enabled && !settings) void fetchSettings(projectId);
  }, [enabled, settings, fetchSettings, projectId]);
  return settings;
}

/** Toutes les cases du projet, relues quand le scénario change. */
export function useScriptPanels(projectId: string) {
  const panels = useMangaStore((s) => (s.projectId === projectId ? s.panels : null));
  const error = useMangaStore((s) => (s.projectId === projectId ? s.error : null));
  const fetchPanels = useMangaStore((s) => s.fetchPanels);
  const reload = useCallback(() => void fetchPanels(projectId), [fetchPanels, projectId]);
  useEffect(() => {
    reload();
    return onMangaScriptChanged(projectId, reload);
  }, [projectId, reload]);
  return { panels, error, reload };
}

/** Comme `useScriptPanels`, seulement si `enabled` (fiche d'un chapitre de manga). */
export function useScriptPanelsIf(projectId: string, enabled: boolean) {
  const panels = useMangaStore((s) => (enabled && s.projectId === projectId ? s.panels : null));
  const fetchPanels = useMangaStore((s) => s.fetchPanels);
  useEffect(() => {
    if (!enabled) return;
    const reload = () => void fetchPanels(projectId);
    reload();
    return onMangaScriptChanged(projectId, reload);
  }, [enabled, fetchPanels, projectId]);
  return { panels };
}