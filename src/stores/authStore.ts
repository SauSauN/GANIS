import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { findBuiltinTheme, getActiveColorThemeId, resetColorTheme } from "@/lib/colorTheme";
import { canDevelop } from "@/lib/roles";
import { usePackageStore } from "@/stores/packageStore";
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

  /**
   * Clé de récupération à montrer une seule fois, après une connexion qui
   * vient de chiffrer un compte créé avant le chiffrement.
   *
   * Gardée uniquement en mémoire, le temps de l'afficher.
   */
  pendingRecoveryKey: string | null;

  /** Oublie la clé de récupération une fois notée par l'utilisateur. */
  clearPendingRecoveryKey: () => void;

  login: (
    username: string,
    password: string,
  ) => Promise<boolean>;

  /**
   * Crée un compte. Retourne `null` en cas d'échec ; sinon la clé de
   * récupération du compte (à montrer une seule fois), qui vaut `null`
   * tant que les clés de récupération sont désactivées.
   */
  register: (input: {
    username: string;
    password: string;
    email?: string;
  }) => Promise<{ recoveryKey: string | null } | null>;

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

/**
 * Aligne les thèmes sur le rôle du compte affiché.
 *
 * - Développeur : ses créations sont (re)chargées ; le thème actif est
 *   vérifié au passage (`packageStore.load`).
 * - Utilisateur : il ne voit que les thèmes système. Un thème créé (par lui
 *   avant de quitter le mode développeur, ou par un autre compte de cet
 *   appareil) n'est plus appliqué : retour au thème par défaut.
 */
function syncThemesWithRole(user: User | null) {
  const packages = usePackageStore.getState();

  packages.reset();

  if (!user) {
    return;
  }

  if (canDevelop(user)) {
    void packages.load();
  } else if (!findBuiltinTheme(getActiveColorThemeId())) {
    resetColorTheme();
  }
}

const messageOf = (e: unknown): string =>
  e instanceof ApiError
    ? e.message
    : "Une erreur inattendue est survenue.";

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  error: null,
  pendingRecoveryKey: null,

  clearPendingRecoveryKey: () => {
    set({ pendingRecoveryKey: null });
  },

  login: async (username, password) => {
    set({
      loading: true,
      error: null,
    });

    try {
      const { user, recoveryKey } = await api.login({
        username,
        password,
      });

      set({
        user,
        loading: false,
        pendingRecoveryKey: recoveryKey,
      });

      syncThemesWithRole(user);

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
      const { recoveryKey } = await api.register(input);

      set({
        loading: false,
      });

      return { recoveryKey };
    } catch (e) {
      set({
        loading: false,
        error: messageOf(e),
      });

      return null;
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
    usePackageStore.getState().reset();

    set({
      user: null,
      error: null,
      pendingRecoveryKey: null,
    });
  },

  clearError: () => {
    set({
      error: null,
    });
  },

  setUser: (user) => {
    const previous = useAuthStore.getState().user;

    set({
      user,
    });

    // Changement de rôle (devenir / quitter développeur).
    if (previous?.role !== user.role) {
      syncThemesWithRole(user);
    }
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
