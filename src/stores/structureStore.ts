import { useEffect } from "react";
import { create } from "zustand";
import { api } from "@/lib/api";
import type { NodeCharacterRole, NodeLocationRole, Structure, StructureLinks, StructureNode } from "@/types";

/*
 * Découpage du projet ouvert, partagé par le plan, l'arborescence du
 * panneau latéral, les fiches et les relations : une modification faite
 * dans le plan se voit partout.
 *
 * Le store sait à quel projet appartient son découpage (`projectId`) ; il
 * est vidé en quittant le projet et à la déconnexion (voir `projectStore`).
 */

interface StructureState {
  projectId: string | null;
  structure: Structure | null;
  error: string | null;
  /** Personnages et lieux liés aux éléments (`null` : pas encore chargés). */
  links: StructureLinks | null;
  /**
   * Élément à montrer dans le plan (clic dans l'arborescence) ; `nonce`
   * change à chaque demande, même pour le même élément.
   */
  focus: { nodeId: string; nonce: number } | null;

  /** Recharge le découpage (après chaque modification). */
  fetchStructure: (projectId: string) => Promise<Structure | null>;
  /** Recharge les personnages et lieux liés. */
  fetchLinks: (projectId: string) => Promise<StructureLinks | null>;
  linkCharacter: (projectId: string, nodeId: string, characterId: string, role: NodeCharacterRole) => Promise<void>;
  unlinkCharacter: (projectId: string, nodeId: string, characterId: string) => Promise<void>;
  linkLocation: (projectId: string, nodeId: string, locationId: string, role: NodeLocationRole) => Promise<void>;
  unlinkLocation: (projectId: string, nodeId: string, locationId: string) => Promise<void>;
  /**
   * Remplace un élément par sa version enregistrée (texte d'une scène,
   * réglages du romancier) sans tout recharger.
   */
  applyNode: (projectId: string, node: StructureNode) => void;
  /** Objectif de mots du manuscrit (roman). */
  setManuscriptGoal: (projectId: string, goal: number | null) => Promise<void>;
  /** Demande au plan de montrer un élément. */
  focusNode: (nodeId: string) => void;
  /** Demande traitée par le plan. */
  clearFocus: () => void;
  reset: () => void;
}

const initial = {
  projectId: null,
  structure: null,
  error: null,
  links: null,
  focus: null,
};

/** Une seule demande à la fois par projet. */
const inflight = new Map<string, Promise<Structure | null>>();

export const useStructureStore = create<StructureState>()((set, get) => ({
  ...initial,

  fetchStructure: (projectId) => {
    const running = inflight.get(projectId);
    if (running) return running;

    const request = api
      .getStructure(projectId)
      .then((structure) => {
        // Projet quitté entre-temps : réponse ignorée.
        if (get().projectId !== null && get().projectId !== projectId) return null;
        // Autre projet : ses liens ne sont pas encore chargés.
        const sameProject = get().projectId === projectId;
        set((state) => ({
          projectId,
          structure,
          error: null,
          links: state.projectId === projectId ? state.links : null,
        }));
        // Un élément supprimé emporte ses liens : on les relit.
        if (sameProject && get().links) void get().fetchLinks(projectId).catch(() => {});
        return structure;
      })
      .catch((e: unknown) => {
        set({ projectId, error: e instanceof Error ? e.message : String(e) });
        return null;
      })
      .finally(() => inflight.delete(projectId));

    inflight.set(projectId, request);
    return request;
  },

  fetchLinks: async (projectId) => {
    const links = await api.listStructureLinks(projectId);
    if (get().projectId === projectId) set({ links });
    return links;
  },

  linkCharacter: async (projectId, nodeId, characterId, role) => {
    await api.linkStructureCharacter(projectId, nodeId, characterId, role);
    await get().fetchLinks(projectId);
  },

  unlinkCharacter: async (projectId, nodeId, characterId) => {
    await api.unlinkStructureCharacter(projectId, nodeId, characterId);
    await get().fetchLinks(projectId);
  },

  linkLocation: async (projectId, nodeId, locationId, role) => {
    await api.linkStructureLocation(projectId, nodeId, locationId, role);
    await get().fetchLinks(projectId);
  },

  unlinkLocation: async (projectId, nodeId, locationId) => {
    await api.unlinkStructureLocation(projectId, nodeId, locationId);
    await get().fetchLinks(projectId);
  },

  applyNode: (projectId, node) => {
    const { structure } = get();
    if (get().projectId !== projectId || !structure) return;
    set({ structure: { ...structure, nodes: structure.nodes.map((n) => (n.id === node.id ? node : n)) } });
  },

  setManuscriptGoal: async (projectId, goal) => {
    const saved = await api.setManuscriptGoal(projectId, goal);
    const { structure } = get();
    if (get().projectId === projectId && structure) set({ structure: { ...structure, manuscriptGoal: saved } });
  },

  focusNode: (nodeId) => set({ focus: { nodeId, nonce: Date.now() } }),

  clearFocus: () => set({ focus: null }),

  reset: () => {
    inflight.clear();
    set(initial);
  },
}));

/**
 * Découpage d'un projet : chargé au premier besoin, puis partagé. Ne
 * renvoie jamais le découpage d'un autre projet.
 */
export function useProjectStructureData(projectId: string) {
  const sameProject = useStructureStore((state) => state.projectId === projectId);
  const structure = useStructureStore((state) => (state.projectId === projectId ? state.structure : null));
  const error = useStructureStore((state) => (state.projectId === projectId ? state.error : null));
  const fetchStructure = useStructureStore((state) => state.fetchStructure);

  useEffect(() => {
    if (!sameProject || (!structure && !error)) {
      void fetchStructure(projectId);
    }
    // Chargé une fois par projet ; les modifications rechargent elles-mêmes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sameProject]);

  return { structure, error, reload: () => fetchStructure(projectId) };
}

/**
 * Personnages et lieux liés aux éléments du découpage d'un projet,
 * chargés au premier besoin (avec le découpage).
 */
export function useProjectStructureLinks(projectId: string) {
  const { structure } = useProjectStructureData(projectId);
  const links = useStructureStore((state) => (state.projectId === projectId ? state.links : null));
  const fetchLinks = useStructureStore((state) => state.fetchLinks);

  useEffect(() => {
    if (structure && !links) {
      void fetchLinks(projectId).catch(() => {});
    }
  }, [projectId, structure, links, fetchLinks]);

  return links;
}