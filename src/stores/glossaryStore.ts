import { useEffect } from "react";
import { create } from "zustand";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { sortTerms } from "@/lib/glossary";
import { announceDeletion } from "@/lib/trash";
import type { GlossaryInput, GlossaryTerm } from "@/types";

/*
 * Glossaire du projet ouvert (Détails › Glossaire). La liste est chargée
 * au premier besoin et gardée triée par ordre alphabétique. Supprimer un
 * terme le met à la corbeille, avec « Annuler ».
 */

interface GlossaryState {
  projectId: string | null;
  terms: GlossaryTerm[];
  loaded: boolean;
  loading: boolean;
  error: string | null;

  fetchTerms: (projectId: string) => Promise<void>;
  createTerm: (projectId: string, input: GlossaryInput) => Promise<GlossaryTerm>;
  updateTerm: (projectId: string, id: string, input: GlossaryInput) => Promise<GlossaryTerm>;
  deleteTerm: (projectId: string, id: string) => Promise<void>;
  reset: () => void;
}

const EMPTY: GlossaryTerm[] = [];
let latest = 0;

export const useGlossaryStore = create<GlossaryState>((set, get) => {
  const mine = (projectId: string) => get().projectId === projectId;

  /** Remplace (ou ajoute) un terme, en gardant l'ordre alphabétique. */
  function upsert(projectId: string, term: GlossaryTerm) {
    if (!mine(projectId)) return;
    set((state) => ({ terms: sortTerms([...state.terms.filter((item) => item.id !== term.id), term]) }));
  }

  return {
    projectId: null,
    terms: EMPTY,
    loaded: false,
    loading: false,
    error: null,

    fetchTerms: async (projectId) => {
      const request = ++latest;
      const same = mine(projectId);
      set({ projectId, terms: same ? get().terms : EMPTY, loading: true, error: null, loaded: same && get().loaded });
      try {
        const terms = await api.listGlossaryTerms(projectId);
        if (request !== latest) return;
        set({ terms: sortTerms(terms), loaded: true, loading: false });
      } catch (error) {
        if (request !== latest) return;
        set({ loading: false, error: errorText(error, "errors:load.glossary") });
      }
    },

    createTerm: async (projectId, input) => {
      const created = await api.createGlossaryTerm(projectId, input);
      upsert(projectId, created);
      return created;
    },

    updateTerm: async (projectId, id, input) => {
      const updated = await api.updateGlossaryTerm(projectId, id, input);
      upsert(projectId, updated);
      return updated;
    },

    deleteTerm: async (projectId, id) => {
      const before = get().terms.find((item) => item.id === id);
      const trashId = await api.deleteGlossaryTerm(projectId, id);
      announceDeletion(projectId, trashId, "glossaryTerm", before?.term ?? "");
      if (mine(projectId)) set((state) => ({ terms: state.terms.filter((item) => item.id !== id) }));
    },

    reset: () => {
      latest++;
      set({ projectId: null, terms: EMPTY, loaded: false, loading: false, error: null });
    },
  };
});

/**
 * Termes du glossaire d'un projet ; la liste est chargée au premier besoin.
 * Si le store contient un autre projet, l'état renvoyé est vide.
 */
export function useProjectGlossary(projectId: string) {
  const mine = useGlossaryStore((state) => state.projectId === projectId);
  const terms = useGlossaryStore((state) => (mine ? state.terms : EMPTY));
  const loaded = useGlossaryStore((state) => mine && state.loaded);
  const loading = useGlossaryStore((state) => mine && state.loading);
  const error = useGlossaryStore((state) => (mine ? state.error : null));
  const fetchTerms = useGlossaryStore((state) => state.fetchTerms);

  const needsFetch = !mine || (!loaded && !loading && !error);

  useEffect(() => {
    if (needsFetch) void fetchTerms(projectId);
  }, [needsFetch, fetchTerms, projectId]);

  return { terms, loaded, loading, error, reload: () => fetchTerms(projectId) };
}
