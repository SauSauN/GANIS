import i18n from "@/i18n";
import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { findBuiltinTheme, getActiveColorThemeId, resetColorTheme } from "@/lib/colorTheme";
import { canDevelop } from "@/lib/roles";
import { clearOpenTabs } from "@/lib/tabLayout";
import { usePackageStore } from "@/stores/packageStore";
import { useProjectStore } from "@/stores/projectStore";
import type { User } from "@/types";

/*
 * L'état affiché ici n'est qu'un reflet de l'interface.
 * La session réelle et les droits sont gérés par Rust (Phase 3).
 * Aucun mot de passe ni jeton n'est conservé dans ce store.
 *
 * Deux façons d'utiliser GANIS :
 * - **sans connexion** (bouton « Commencer » de l'accueil) : mode invité,
 *   seuls les projets publics sont accessibles, et tout projet créé est
 *   public ;
 * - **connecté** : projets privés du compte (chiffrés) et projets publics.
 *
 * Rust décide seul de ce qui est accessible : ce store ne sert qu'à
 * l'affichage et à la navigation.
 */

interface LoginOptions {
  /**
   * Garde le projet ouvert et ses onglets (connexion demandée depuis un
   * projet public, pour le rendre privé). Par défaut, la liste des projets
   * et les onglets sont oubliés puis relus avec les droits du compte.
   */
  keepWorkspace?: boolean;
}

interface AuthState {
  user: User | null;

  /**
   * Vrai après « Commencer » : l'application est utilisée sans connexion.
   * Toujours faux quand un compte est connecté.
   */
  guest: boolean;
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
    options?: LoginOptions,
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

  /**
   * Supprime le compte connecté et ses projets privés (mot de passe
   * demandé), puis remet l'interface à zéro comme une déconnexion.
   */
  deleteAccount: (password: string) => Promise<void>;

  clearError: () => void;

  /**
   * Remplace l'utilisateur affiché (après une modification du profil).
   */
  setUser: (user: User) => void;

  /** Entre dans l'application sans connexion (projets publics). */
  startGuest: () => void;
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

/** Interface remise à zéro après une déconnexion ou une suppression de compte. */
function resetSession(set: (state: Partial<AuthState>) => void) {
  useProjectStore.getState().reset();
  usePackageStore.getState().reset();
  // Les onglets ouverts sont oubliés (les épinglés restent).
  clearOpenTabs();

  set({
    user: null,
    guest: false,
    error: null,
    pendingRecoveryKey: null,
  });
}

const messageOf = (e: unknown): string =>
  e instanceof ApiError
    ? e.message
    : i18n.t("errors:unexpected");

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  guest: false,
  loading: false,
  error: null,
  pendingRecoveryKey: null,

  clearPendingRecoveryKey: () => {
    set({ pendingRecoveryKey: null });
  },

  login: async (username, password, options) => {
    set({
      loading: true,
      error: null,
    });

    try {
      const { user, recoveryKey } = await api.login({
        username,
        password,
      });

      // Les projets affichés jusque-là (mode invité) sont oubliés : la
      // liste est relue avec les droits du compte.
      if (!options?.keepWorkspace) {
        useProjectStore.getState().reset();
        clearOpenTabs();
      }

      set({
        user,
        guest: false,
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

    resetSession(set);
  },

  deleteAccount: async (password) => {
    // Une erreur (mot de passe faux…) est rendue à l'appelant : rien n'a
    // été supprimé et la session reste ouverte.
    await api.deleteAccount(password);

    resetSession(set);
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

  startGuest: () => {
    // Un compte resté connecté n'a rien à faire en mode invité.
    if (useAuthStore.getState().user) {
      return;
    }

    useProjectStore.getState().reset();

    set({
      guest: true,
      error: null,
    });
  },
}));