import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import type { Synopsis } from "@/types";

/*
 * Store du synopsis du projet actuellement ouvert.
 *
 * Le store sait à quel projet appartient le synopsis qu'il contient
 * (`projectId`) : les composants ne reçoivent que le synopsis de LEUR
 * projet (voir `useProjectSynopsis`), jamais celui d'un autre.
 *
 * Il est vidé en quittant un projet et à la déconnexion
 * (voir `closeProject` et `reset` dans `projectStore`).
 */

export interface SynopsisInput {
  content: string;
  genres: string[];
  subgenres: string[];
  tone: string[];
}

interface SynopsisState {
  /** Projet auquel appartiennent `synopsis`, `loading` et `error`. */
  projectId: string | null;
  synopsis: Synopsis | null;
  loading: boolean;
  saving: boolean;
  error: string | null;

  /**
   * Charge le synopsis du projet depuis le backend Rust.
   *
   * Si plusieurs chargements se chevauchent, seul le dernier compte :
   * une réponse tardive ne peut pas écraser une réponse plus récente,
   * ni afficher les données d'un autre projet.
   */
  fetchSynopsis: (projectId: string) => Promise<void>;

  /**
   * Enregistre les modifications du synopsis et retourne la version
   * enregistrée (listes nettoyées par le backend).
   *
   * Relance l'erreur en cas d'échec, afin que le composant appelant
   * puisse afficher un message adapté.
   */
  updateSynopsis: (
    projectId: string,
    input: SynopsisInput,
  ) => Promise<Synopsis>;

  /**
   * Réinitialise complètement l'état et ignore les réponses en attente.
   */
  reset: () => void;
}

/**
 * Numéro de la dernière demande (chargement, enregistrement ou
 * réinitialisation). Une réponse n'est appliquée que si son numéro
 * est toujours le dernier.
 */
let latestRequest = 0;

const messageOf = (error: unknown, fallback: string): string =>
  error instanceof ApiError ? error.message : fallback;

export const useSynopsisStore = create<SynopsisState>((set, get) => ({
  projectId: null,
  synopsis: null,
  loading: false,
  saving: false,
  error: null,

  fetchSynopsis: async (projectId) => {
    const request = ++latestRequest;
    const sameProject = get().projectId === projectId;

    set({
      projectId,
      // Changer de projet efface immédiatement le synopsis précédent.
      synopsis: sameProject ? get().synopsis : null,
      loading: true,
      error: null,
    });

    try {
      const synopsis = await api.getSynopsis(projectId);

      if (request !== latestRequest) {
        return;
      }

      set({ synopsis, loading: false });
    } catch (error) {
      if (request !== latestRequest) {
        return;
      }

      set({
        loading: false,
        error: messageOf(error, "Impossible de charger le synopsis."),
      });
    }
  },

  updateSynopsis: async (projectId, input) => {
    // Invalide les chargements plus anciens encore en cours : leur
    // réponse, antérieure à l'enregistrement, ne doit pas l'écraser.
    latestRequest++;

    set({ projectId, saving: true, loading: false, error: null });

    try {
      const saved = await api.updateSynopsis(projectId, input);

      // Appliqué seulement si on est toujours sur ce projet.
      if (get().projectId === projectId) {
        set({ synopsis: saved, saving: false });
      } else {
        set({ saving: false });
      }

      return saved;
    } catch (error) {
      if (get().projectId === projectId) {
        set({
          saving: false,
          error: messageOf(error, "Impossible d'enregistrer le synopsis."),
        });
      } else {
        set({ saving: false });
      }

      // On relance l'erreur pour que le composant appelant puisse réagir.
      throw error;
    }
  },

  reset: () => {
    latestRequest++;

    set({
      projectId: null,
      synopsis: null,
      loading: false,
      saving: false,
      error: null,
    });
  },
}));

/**
 * État du synopsis pour un projet donné.
 *
 * Si le store contient les données d'un autre projet, ce hook renvoie
 * un état vide : un composant n'affiche (et ne peut enregistrer)
 * que les données de son propre projet.
 */
export function useProjectSynopsis(projectId: string) {
  const synopsis = useSynopsisStore((state) =>
    state.projectId === projectId ? state.synopsis : null,
  );

  const loading = useSynopsisStore(
    (state) => state.projectId === projectId && state.loading,
  );

  const saving = useSynopsisStore(
    (state) => state.projectId === projectId && state.saving,
  );

  const error = useSynopsisStore((state) =>
    state.projectId === projectId ? state.error : null,
  );

  return { synopsis, loading, saving, error };
}