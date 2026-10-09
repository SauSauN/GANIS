import { create } from "zustand";
import { api } from "@/lib/api";
import {
  findBuiltinTheme,
  getActiveColorThemeId,
  resetColorTheme,
  setActiveColorTheme,
} from "@/lib/colorTheme";
import type { ThemeData, UserPackage } from "@/types";

/**
 * Packages créés par l'utilisateur connecté.
 *
 * Les packages système ne passent pas par ce store : ils sont intégrés à
 * l'interface (`lib/colorTheme.ts`). Les droits (développeur, propriétaire)
 * sont vérifiés par Rust ; ce store ne fait que refléter l'état.
 *
 * Les erreurs sont gardées telles quelles (`unknown`) : l'écran les traduit
 * au moment de l'affichage, dans la langue courante.
 */

export interface ThemeInput {
  name: string;
  description: string;
  theme: ThemeData;
}

interface PackageState {
  packages: UserPackage[];
  /** Vrai une fois la liste chargée au moins une fois. */
  loaded: boolean;
  loading: boolean;
  loadError: unknown;

  load: () => Promise<void>;
  createTheme: (input: ThemeInput) => Promise<UserPackage>;
  updateTheme: (id: string, input: ThemeInput) => Promise<UserPackage>;
  deletePackage: (id: string) => Promise<void>;
  reset: () => void;
}

export const usePackageStore = create<PackageState>((set, get) => ({
  packages: [],
  loaded: false,
  loading: false,
  loadError: null,

  load: async () => {
    set({ loading: true, loadError: null });

    try {
      const packages = await api.listMyPackages();

      set({ packages, loaded: true, loading: false });

      // Thème actif créé par l'utilisateur : rafraîchit le cache local.
      // S'il n'appartient pas à ce compte (autre compte sur cet appareil,
      // thème supprimé), on revient au thème par défaut.
      const activeId = getActiveColorThemeId();

      if (!findBuiltinTheme(activeId)) {
        const active = packages.find((p) => p.id === activeId);

        if (active) {
          setActiveColorTheme(active.id, active.theme);
        } else {
          resetColorTheme();
        }
      }
    } catch (e) {
      set({ loading: false, loadError: e });
    }
  },

  createTheme: async (input) => {
    const created = await api.createThemePackage(input);

    set({ packages: [created, ...get().packages] });

    return created;
  },

  updateTheme: async (id, input) => {
    const updated = await api.updateThemePackage(id, input);

    set({
      packages: [updated, ...get().packages.filter((p) => p.id !== id)],
    });

    // Thème en cours d'utilisation : les nouvelles couleurs s'appliquent.
    if (getActiveColorThemeId() === id) {
      setActiveColorTheme(id, updated.theme);
    }

    return updated;
  },

  deletePackage: async (id) => {
    await api.deletePackage(id);

    set({ packages: get().packages.filter((p) => p.id !== id) });

    // Le thème supprimé était utilisé : retour au thème par défaut.
    if (getActiveColorThemeId() === id) {
      resetColorTheme();
    }
  },

  reset: () => {
    set({ packages: [], loaded: false, loading: false, loadError: null });
  },
}));
