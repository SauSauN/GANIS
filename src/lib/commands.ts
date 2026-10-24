import { useEffect, useRef } from "react";
import { create } from "zustand";

/*
 * Commandes de l'application, partagées par les menus (Fichier, Édition…)
 * et les raccourcis clavier.
 *
 * Chaque écran déclare les commandes qu'il sait exécuter
 * (`useRegisterCommands`) : l'espace de travail sait enregistrer l'onglet
 * actif ou en fermer un, le tableau de bord sait créer un projet… Un menu
 * ou un raccourci ne fait qu'appeler `runCommand` ; une commande qu'aucun
 * écran ne propose est grisée dans les menus et sans effet au clavier.
 */

export type CommandId =
  // Fichier
  | "new"
  | "save"
  | "saveAll"
  | "closeTab"
  | "exportProject"
  | "importGanix"
  // Affichage
  | "togglePanel"
  | "toggleRail"
  | "nextTab"
  | "previousTab"
  // Projet
  | "openHome"
  | "openSynopsis"
  | "openProjectSettings"
  | "openTrash"
  | "openHistory"
  /** Bouton ▶ : lecture complète de l'histoire (ou retour à l'édition). */
  | "readStory"
  | "palette";

export interface CommandHandler {
  run: () => void;
  /** Libellé propre à l'écran (« Nouveau personnage »…). */
  label?: string;
  /** Vrai : visible mais grisée (ex. rien à enregistrer). */
  disabled?: boolean;
  /** Vrai : commande à bascule actuellement enclenchée (lecture en cours). */
  active?: boolean;
}

type Handlers = Partial<Record<CommandId, CommandHandler>>;

interface CommandState {
  /** Commandes de chaque écran, par identifiant d'écran. */
  owners: Record<string, Handlers>;
  set: (owner: string, handlers: Handlers) => void;
  remove: (owner: string) => void;
}

export const useCommandStore = create<CommandState>((set, get) => ({
  owners: {},
  set: (owner, handlers) => set({ owners: { ...get().owners, [owner]: handlers } }),
  remove: (owner) => {
    const owners = { ...get().owners };
    delete owners[owner];
    set({ owners });
  },
}));

function findHandler(owners: Record<string, Handlers>, id: CommandId): CommandHandler | undefined {
  // Le dernier écran déclaré l'emporte.
  const list = Object.values(owners);
  for (let i = list.length - 1; i >= 0; i--) {
    const handler = list[i][id];
    if (handler) return handler;
  }
  return undefined;
}

/** Commande disponible (et non grisée) ? Pour les menus. */
export function useCommand(id: CommandId): CommandHandler | undefined {
  return useCommandStore((state) => findHandler(state.owners, id));
}

/** Exécute une commande ; renvoie `false` si aucun écran ne la propose. */
export function runCommand(id: CommandId): boolean {
  const handler = findHandler(useCommandStore.getState().owners, id);
  if (!handler || handler.disabled) return false;
  handler.run();
  return true;
}

// ----------------------------------------------------------------------------
// Demande au tableau de bord
// ----------------------------------------------------------------------------

/** Action demandée depuis un menu, faite à l'arrivée sur le tableau de bord. */
export type DashboardIntent = "newProject" | "importGanix";

interface IntentState {
  intent: DashboardIntent | null;
  request: (intent: DashboardIntent) => void;
  take: () => DashboardIntent | null;
}

export const useDashboardIntent = create<IntentState>((set, get) => ({
  intent: null,
  request: (intent) => set({ intent }),
  take: () => {
    const intent = get().intent;
    if (intent) set({ intent: null });
    return intent;
  },
}));

let ownerCount = 0;

/**
 * Déclare les commandes d'un écran tant qu'il est affiché. Les fonctions
 * peuvent changer à chaque rendu : la dernière version est toujours
 * appelée.
 */
export function useRegisterCommands(handlers: Handlers) {
  const owner = useRef<string>("");
  if (!owner.current) owner.current = `owner-${++ownerCount}`;

  const latest = useRef(handlers);
  latest.current = handlers;

  // Clé stable : identifiants, libellés et états grisés (pas les fonctions).
  const signature = JSON.stringify(
    Object.entries(handlers).map(([id, h]) => [id, h?.label ?? "", Boolean(h?.disabled), Boolean(h?.active)]),
  );

  useEffect(() => {
    const ids = Object.keys(latest.current) as CommandId[];
    const wrapped: Handlers = {};
    for (const id of ids) {
      const current = latest.current[id];
      if (!current) continue;
      wrapped[id] = {
        label: current.label,
        disabled: current.disabled,
        active: current.active,
        run: () => latest.current[id]?.run(),
      };
    }
    useCommandStore.getState().set(owner.current, wrapped);
  }, [signature]);

  useEffect(() => {
    const id = owner.current;
    return () => useCommandStore.getState().remove(id);
  }, []);
}
