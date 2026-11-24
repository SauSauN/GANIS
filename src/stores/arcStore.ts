import { useEffect } from "react";
import { create } from "zustand";
import { api } from "@/lib/api";
import { normalizeArc, type CharacterArcData } from "@/lib/arcs";
import { errorText } from "@/lib/errors";
import { onSessionEnd } from "@/lib/sessionCache";
import { toast } from "@/stores/toastStore";

/*
 * Arcs des personnages du projet ouvert (voir `lib/arcs.ts`). Chaque
 * modification est enregistrée 600 ms après le dernier geste, personnage
 * par personnage ; `flush` envoie tout de suite ce qui attend.
 */

const SAVE_DELAY = 600;

interface ArcState {
  projectId: string | null;
  arcs: Record<string, CharacterArcData>;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  /** Personnage affiché dans l'onglet Arcs (choisi dans le panneau du module Personnages). */
  selectedCharacterId: string | null;
  selectCharacter: (characterId: string) => void;
  load: (projectId: string) => Promise<void>;
  update: (projectId: string, characterId: string, fn: (arc: CharacterArcData) => void) => void;
  flush: () => Promise<void>;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const SELECTED_KEY = "ganis.arcs.character";

function savedCharacter(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}
let requestId = 0;

async function send(projectId: string, characterId: string, arc: CharacterArcData) {
  try {
    await api.saveCharacterArc(projectId, characterId, JSON.stringify(arc));
  } catch (error) {
    toast({ message: errorText(error, "characters:arcs.saveFailed"), tone: "error" });
  }
}

export const useArcStore = create<ArcState>((set, get) => ({
  projectId: null,
  arcs: {},
  loaded: false,
  loading: false,
  error: null,
  selectedCharacterId: savedCharacter(),

  selectCharacter: (characterId) => {
    set({ selectedCharacterId: characterId });
    try {
      localStorage.setItem(SELECTED_KEY, characterId);
    } catch {
      // Sans stockage : le choix vaut pour cette séance.
    }
  },

  load: async (projectId) => {
    const state = get();
    if (state.projectId === projectId && (state.loaded || state.loading)) return;
    await get().flush();
    const id = ++requestId;
    set({ projectId, arcs: {}, loaded: false, loading: true, error: null });
    try {
      const rows = await api.listCharacterArcs(projectId);
      if (id !== requestId) return;
      const arcs: Record<string, CharacterArcData> = {};
      for (const row of rows) {
        try {
          arcs[row.characterId] = normalizeArc(row.data ? JSON.parse(row.data) : {});
        } catch {
          arcs[row.characterId] = normalizeArc({});
        }
      }
      set({ arcs, loaded: true, loading: false });
    } catch (error) {
      if (id !== requestId) return;
      set({ loading: false, error: errorText(error, "characters:arcs.loadFailed") });
    }
  },

  update: (projectId, characterId, fn) => {
    const state = get();
    if (state.projectId !== projectId) return;
    const current = state.arcs[characterId] ?? normalizeArc({});
    const draft = structuredClone(current);
    fn(draft);
    set({ arcs: { ...state.arcs, [characterId]: draft } });

    const pending = timers.get(characterId);
    if (pending) clearTimeout(pending);
    timers.set(
      characterId,
      setTimeout(() => {
        timers.delete(characterId);
        void send(projectId, characterId, get().arcs[characterId]);
      }, SAVE_DELAY),
    );
  },

  flush: async () => {
    const { projectId, arcs } = get();
    const waiting = [...timers.keys()];
    for (const characterId of waiting) {
      clearTimeout(timers.get(characterId));
      timers.delete(characterId);
    }
    if (!projectId) return;
    await Promise.all(waiting.filter((id) => arcs[id]).map((id) => send(projectId, id, arcs[id])));
  },
}));

// Fin de session : plus rien de ce projet en mémoire (les enregistrements
// en attente sont abandonnés : l'arc reste tel qu'il a été envoyé).
onSessionEnd(() => {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  useArcStore.setState(useArcStore.getInitialState(), true);
});

/** Arcs du projet, chargés au premier besoin. */
export function useProjectArcs(projectId: string) {
  const arcs = useArcStore((s) => (s.projectId === projectId ? s.arcs : null));
  const loaded = useArcStore((s) => s.projectId === projectId && s.loaded);
  const error = useArcStore((s) => (s.projectId === projectId ? s.error : null));
  const load = useArcStore((s) => s.load);

  useEffect(() => {
    void load(projectId);
  }, [load, projectId]);

  // En quittant la vue : ce qui attend est envoyé tout de suite.
  useEffect(() => () => void useArcStore.getState().flush(), []);

  return { arcs: arcs ?? {}, loaded, error };
}

/** Personnage affiché dans l'onglet Arcs : celui qui a été choisi, sinon le premier. */
export function arcCharacterOf<T extends { id: string }>(characters: T[], selectedId: string | null): T | undefined {
  return characters.find((c) => c.id === selectedId) ?? characters[0];
}
