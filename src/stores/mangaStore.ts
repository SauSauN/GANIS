import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { api } from "@/lib/api";
import { onMangaScriptChanged } from "@/lib/mangaEvents";
import { announceDeletion } from "@/lib/trash";
import { useStructureStore } from "@/stores/structureStore";
import type { ExtraPageInput, ExtraPagePlacement, ExtraPageUpdate, MangaExtraPage, MangaSettings, Panel, ProductionStage } from "@/types";
import { errorText } from "@/lib/errors";
import { onSessionEnd } from "@/lib/sessionCache";

/*
 * Scénario de manga du projet ouvert : seuils d'alerte du volume de texte,
 * et toutes les cases (pour la lecture, l'export, le suivi et la
 * continuité). Les cases sont relues quand une page est enregistrée ou
 * qu'une case est déplacée ou restaurée.
 *
 * Fabrication : les pages hors récit des tomes (`extras`) et l'étape de
 * fabrication des pages. L'étape d'une page du récit est rangée dans le
 * découpage (`structureStore`), mise à jour sur place.
 */

interface MangaState {
  projectId: string | null;
  settings: MangaSettings | null;
  panels: Panel[] | null;
  error: string | null;
  fetchSettings: (projectId: string) => Promise<void>;
  saveSettings: (projectId: string, settings: MangaSettings) => Promise<void>;
  fetchPanels: (projectId: string) => Promise<void>;

  /** Pages hors récit de tous les tomes (`null` : pas encore lues). */
  extras: MangaExtraPage[] | null;
  extrasError: string | null;
  fetchExtras: (projectId: string) => Promise<void>;
  createExtra: (projectId: string, input: ExtraPageInput) => Promise<MangaExtraPage>;
  updateExtra: (projectId: string, id: string, update: ExtraPageUpdate) => Promise<MangaExtraPage>;
  /** Nouvel ordre d'un groupe (tome + placement) : `ids` dans l'ordre voulu. */
  reorderExtras: (projectId: string, volumeId: string | null, placement: ExtraPagePlacement, ids: string[]) => Promise<void>;
  deleteExtra: (projectId: string, id: string, label: string) => Promise<void>;
  /** Dessin d'une page hors récit : une image, ou `null` pour le retirer. */
  setExtraArt: (projectId: string, id: string, file: File | null) => Promise<void>;
  /** Étape de fabrication de pages du récit et de pages hors récit. */
  setStage: (projectId: string, pageIds: string[], extraIds: string[], stage: ProductionStage | null) => Promise<void>;
}

const mine = (state: MangaState, projectId: string) => state.projectId === projectId;

export const useMangaStore = create<MangaState>((set, get) => ({
  projectId: null,
  settings: null,
  panels: null,
  error: null,
  extras: null,
  extrasError: null,

  fetchSettings: async (projectId) => {
    if (!mine(get(), projectId)) set({ projectId, settings: null, panels: null, error: null, extras: null, extrasError: null });
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
    if (!mine(get(), projectId)) set({ projectId, settings: null, panels: null, error: null, extras: null, extrasError: null });
    try {
      const panels = await api.getScriptPanels(projectId);
      if (mine(get(), projectId)) set({ panels, error: null });
    } catch (e) {
      if (mine(get(), projectId)) set({ error: errorText(e, "errors:load.manga") });
    }
  },

  fetchExtras: async (projectId) => {
    if (!mine(get(), projectId)) set({ projectId, settings: null, panels: null, error: null, extras: null, extrasError: null });
    try {
      const extras = await api.listMangaExtraPages(projectId);
      if (mine(get(), projectId)) set({ extras, extrasError: null });
    } catch (e) {
      if (mine(get(), projectId)) set({ extrasError: errorText(e, "errors:load.manga") });
    }
  },

  createExtra: async (projectId, input) => {
    const created = await api.createMangaExtraPage(projectId, input);
    if (mine(get(), projectId)) set((state) => ({ extras: [...(state.extras ?? []), created] }));
    return created;
  },

  updateExtra: async (projectId, id, update) => {
    const saved = await api.updateMangaExtraPage(projectId, id, update);
    if (mine(get(), projectId)) set((state) => ({ extras: (state.extras ?? []).map((item) => (item.id === id ? saved : item)) }));
    return saved;
  },

  reorderExtras: async (projectId, volumeId, placement, ids) => {
    const extras = await api.reorderMangaExtraPages(projectId, volumeId, placement, ids);
    if (mine(get(), projectId)) set({ extras });
  },

  deleteExtra: async (projectId, id, label) => {
    const trashId = await api.deleteMangaExtraPage(projectId, id);
    announceDeletion(projectId, trashId, "mangaExtraPage", label);
    if (mine(get(), projectId)) set((state) => ({ extras: (state.extras ?? []).filter((item) => item.id !== id) }));
  },

  setExtraArt: async (projectId, id, file) => {
    const saved = file
      ? await api.setMangaExtraArt(projectId, id, file.name, await file.arrayBuffer())
      : await api.removeMangaExtraArt(projectId, id);
    if (mine(get(), projectId)) set((state) => ({ extras: (state.extras ?? []).map((item) => (item.id === id ? saved : item)) }));
  },

  setStage: async (projectId, pageIds, extraIds, stage) => {
    await api.setMangaProductionStage(projectId, pageIds, extraIds, stage);
    const changedExtras = new Set(extraIds);
    if (mine(get(), projectId) && extraIds.length) {
      set((state) => ({ extras: (state.extras ?? []).map((item) => (changedExtras.has(item.id) ? { ...item, productionStage: stage } : item)) }));
    }
    const structure = useStructureStore.getState();
    if (structure.projectId === projectId && structure.structure && pageIds.length) {
      const changed = new Set(pageIds);
      useStructureStore.setState({
        structure: { ...structure.structure, nodes: structure.structure.nodes.map((n) => (changed.has(n.id) ? { ...n, productionStage: stage } : n)) },
      });
    }
  },
}));

/** Pages hors récit de tous les tomes (chargées au premier besoin). */
export function useExtraPages(projectId: string) {
  const extras = useMangaStore((s) => (s.projectId === projectId ? s.extras : null));
  const error = useMangaStore((s) => (s.projectId === projectId ? s.extrasError : null));
  const fetchExtras = useMangaStore((s) => s.fetchExtras);
  const needsFetch = extras === null && !error;
  useEffect(() => {
    if (needsFetch) void fetchExtras(projectId);
  }, [needsFetch, fetchExtras, projectId]);
  return { extras, error };
}

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

// Fin de session (déconnexion, autre compte) : plus rien de ce projet en mémoire.
onSessionEnd(() => useMangaStore.setState(useMangaStore.getInitialState(), true));
