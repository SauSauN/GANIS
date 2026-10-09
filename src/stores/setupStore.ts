import { create } from "zustand";
import { api, isTauri } from "@/lib/api";

/*
 * État de la configuration initiale (§37.9).
 *
 * Au démarrage, l'application demande à Rust s'il existe au moins un
 * compte. S'il n'en existe aucun, l'assistant de configuration (page
 * /setup) est imposé pour créer le compte administrateur.
 *
 * Ce store ne sert qu'à l'affichage : la création du premier
 * administrateur est de toute façon protégée côté Rust.
 */

interface SetupState {
  /**
   * `true` : aucun compte, l'assistant doit être affiché.
   * `false` : configuration faite.
   * `null` : vérification pas encore effectuée.
   */
  needsSetup: boolean | null;
  error: string | null;

  /** Interroge Rust pour savoir si un compte existe. */
  check: () => Promise<void>;

  /** À appeler une fois le compte administrateur créé. */
  markDone: () => void;
}

export const useSetupStore = create<SetupState>((set) => ({
  needsSetup: null,
  error: null,

  check: async () => {
    // Hors de Tauri (simple navigateur, mode démo), il n'y a pas de
    // base de données : l'assistant n'a pas de sens.
    if (!isTauri()) {
      set({ needsSetup: false, error: null });
      return;
    }

    try {
      const anyUser = await api.hasAnyUser();

      set({ needsSetup: !anyUser, error: null });
    } catch (e) {
      set({
        needsSetup: null,
        error:
          e instanceof Error
            ? e.message
            : "Impossible de vérifier la configuration de GANIS.",
      });
    }
  },

  markDone: () => {
    set({ needsSetup: false, error: null });
  },
}));
