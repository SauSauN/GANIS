import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { useProjectStore } from "@/stores/projectStore";
import type { User } from "@/types";

/*
 * L'état affiché ici n'est qu'un reflet de l'interface.
 * La session réelle et les droits sont gérés par Rust (Phase 3).
 * Aucun mot de passe ni jeton n'est conservé dans ce store.
 */

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;

  login: (
    username: string,
    password: string,
  ) => Promise<boolean>;

  register: (input: {
    username: string;
    password: string;
    email?: string;
  }) => Promise<boolean>;

  logout: () => Promise<void>;

  clearError: () => void;

  /**
   * Remplace l'utilisateur affiché (après une modification du profil).
   */
  setUser: (user: User) => void;

  /**
   * Connexion de développement uniquement.
   * Cette fonction ne doit pas être utilisée en production.
   */
  devLogin: () => void;
}

const messageOf = (e: unknown): string =>
  e instanceof ApiError
    ? e.message
    : "Une erreur inattendue est survenue.";

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  error: null,

  login: async (username, password) => {
    set({
      loading: true,
      error: null,
    });

    try {
      const user = await api.login({
        username,
        password,
      });

      set({
        user,
        loading: false,
      });

      return true;
    } catch (e) {
      set({
        loading: false,
        error: messageOf(e),
      });

      return false;
    }
  },

  register: async (input) => {
    set({
      loading: true,
      error: null,
    });

    try {
      await api.register(input);

      set({
        loading: false,
      });

      return true;
    } catch (e) {
      set({
        loading: false,
        error: messageOf(e),
      });

      return false;
    }
  },

  logout: async () => {
    try {
      await api.logout();
    } catch {
      /*
       * Même si le backend échoue pendant la déconnexion,
       * l'interface est réinitialisée localement.
       */
    }

    useProjectStore.getState().reset();

    set({
      user: null,
      error: null,
    });
  },

  clearError: () => {
    set({
      error: null,
    });
  },

  setUser: (user) => {
    set({
      user,
    });
  },

  devLogin: () => {
    if (!import.meta.env.DEV) {
      return;
    }

    const now = new Date().toISOString();

    useProjectStore.getState().seedDemo();

    set({
      user: {
        id: "dev-user",
        username: "demo",
        email: null,
        role: "user",
        createdAt: now,
        updatedAt: now,
      },
      error: null,
    });
  },
}));