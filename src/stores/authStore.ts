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
  login: (username: string, password: string) => Promise<boolean>;
  register: (input: { username: string; password: string; email?: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  devLogin: () => void; // développement uniquement, à supprimer en Phase 3
}

const messageOf = (e: unknown) => (e instanceof ApiError ? e.message : "Une erreur inattendue est survenue.");

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  error: null,

  login: async (username, password) => {
    set({ loading: true, error: null });
    try {
      const user = await api.login({ username, password });
      set({ user, loading: false });
      return true;
    } catch (e) {
      set({ loading: false, error: messageOf(e) });
      return false;
    }
  },

  register: async (input) => {
    set({ loading: true, error: null });
    try {
      await api.register(input);
      set({ loading: false });
      return true;
    } catch (e) {
      set({ loading: false, error: messageOf(e) });
      return false;
    }
  },

  logout: async () => {
    try {
      await api.logout();
    } catch {
      /* on déconnecte l'interface dans tous les cas */
    }
    useProjectStore.getState().reset();
    set({ user: null, error: null });
  },

  clearError: () => set({ error: null }),

  devLogin: () => {
    if (!import.meta.env.DEV) return;
    useProjectStore.getState().seedDemo();
    set({ user: { id: "dev-user", username: "demo", email: null, role: "user" }, error: null });
  },
}));
