import { useEffect } from "react";
import { create } from "zustand";
import { api } from "@/lib/api";
import type { WritingStats } from "@/types";

/*
 * Écriture au jour le jour d'un roman ouvert : mots écrits aujourd'hui,
 * objectif quotidien, série (calculés par Rust), et séance en cours.
 *
 * La séance commence à l'ouverture du projet (ou sur « Nouvelle séance ») :
 * ses mots sont ceux écrits aujourd'hui depuis ce moment. Elle n'est pas
 * enregistrée, c'est un repère pour l'auteur.
 */

interface Session {
  /** Jour et mots du jour au début de la séance. */
  day: string;
  baseWords: number;
  startedAt: number;
}

interface WritingState {
  /** Roman ouvert dans l'espace de travail (`null` : aucun). */
  projectId: string | null;
  stats: WritingStats | null;
  session: Session | null;

  open: (projectId: string) => void;
  close: (projectId: string) => void;
  /** Relit les mots du jour (après un enregistrement de texte). */
  refresh: (projectId: string) => Promise<void>;
  setGoal: (projectId: string, goal: number | null) => Promise<void>;
  newSession: () => void;
}

let latest = 0;

export const useWritingStore = create<WritingState>((set, get) => ({
  projectId: null,
  stats: null,
  session: null,

  open: (projectId) => {
    if (get().projectId === projectId) return;
    set({ projectId, stats: null, session: null });
    void get().refresh(projectId);
  },

  close: (projectId) => {
    if (get().projectId === projectId) set({ projectId: null, stats: null, session: null });
  },

  refresh: async (projectId) => {
    if (get().projectId !== projectId) return;
    const request = ++latest;
    try {
      const stats = await api.getWritingStats(projectId);
      if (request !== latest || get().projectId !== projectId) return;
      const session = get().session;
      set({
        stats,
        session:
          session && session.day === stats.today
            ? session
            : { day: stats.today, baseWords: session ? 0 : stats.wordsToday, startedAt: session?.startedAt ?? Date.now() },
      });
    } catch {
      // Statistiques indisponibles : l'écriture continue sans compteur.
    }
  },

  setGoal: async (projectId, goal) => {
    const stats = await api.setDailyGoal(projectId, goal);
    if (get().projectId === projectId) set({ stats });
  },

  newSession: () => {
    const stats = get().stats;
    if (stats) set({ session: { day: stats.today, baseWords: stats.wordsToday, startedAt: Date.now() } });
  },
}));

/** Mots de la séance en cours (jamais négatif). */
export function sessionWords(stats: WritingStats | null, session: Session | null): number {
  if (!stats || !session || session.day !== stats.today) return 0;
  return Math.max(0, stats.wordsToday - session.baseWords);
}

/** Ouvre le suivi de l'écriture d'un roman tant que son espace de travail est affiché. */
export function useWritingTracker(projectId: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const { open, close } = useWritingStore.getState();
    open(projectId);
    return () => close(projectId);
  }, [projectId, enabled]);
}

/** Relit les mots du jour du roman ouvert (sans effet pour un autre projet). */
export function refreshWriting(projectId: string) {
  void useWritingStore.getState().refresh(projectId);
}
