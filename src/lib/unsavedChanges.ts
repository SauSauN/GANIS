import { createContext, useContext, useEffect, useRef } from "react";
import { create } from "zustand";
import { getAutoSave, useAutoSave } from "@/lib/preferences";

/**
 * Modifications non enregistrées.
 *
 * Chaque écran qui demande un enregistrement (synopsis, informations du
 * projet, éditeur de thème…) déclare ici, avec `useUnsavedChanges`, qu'il
 * a des modifications en attente et comment les enregistrer.
 *
 * Ce registre sert à :
 * - afficher un point ● sur l'onglet au lieu de la croix (comme VS Code) ;
 * - demander « Enregistrer / Ne pas enregistrer / Annuler » avant de fermer
 *   un onglet, de quitter la page ou de fermer GANIS ;
 * - enregistrer automatiquement après un délai, si l'option est activée.
 */

export interface UnsavedEntry {
  /** Nom affiché dans la fenêtre de confirmation (ex. « Synopsis »). */
  label: string;
  /** Enregistre ; renvoie `false` si l'enregistrement a échoué. */
  save: () => Promise<boolean>;
}

/** Motif d'une demande de sortie : fermer GANIS ou quitter la page. */
export type LeaveKind = "quit" | "leave";

interface PendingLeave {
  kind: LeaveKind;
  /** Action à exécuter une fois la question réglée. */
  proceed: () => void;
}

interface UnsavedState {
  entries: Record<string, UnsavedEntry>;
  pending: PendingLeave | null;

  register: (id: string, entry: UnsavedEntry) => void;
  unregister: (id: string) => void;

  /**
   * Quitte (navigation, déconnexion, fermeture de GANIS) : immédiatement
   * s'il n'y a rien à enregistrer, sinon après la question de
   * `UnsavedChangesGuard`.
   */
  requestLeave: (kind: LeaveKind, proceed: () => void) => void;
  clearPending: () => void;
}

export const useUnsavedStore = create<UnsavedState>((set, get) => ({
  entries: {},
  pending: null,

  register: (id, entry) => {
    set({ entries: { ...get().entries, [id]: entry } });
  },

  unregister: (id) => {
    if (!(id in get().entries)) {
      return;
    }

    const entries = { ...get().entries };
    delete entries[id];
    set({ entries });
  },

  requestLeave: (kind, proceed) => {
    if (Object.keys(get().entries).length === 0) {
      proceed();
      return;
    }

    set({ pending: { kind, proceed } });
  },

  clearPending: () => set({ pending: null }),
}));

/** Vrai si l'élément `id` a des modifications non enregistrées. */
export function useIsUnsaved(id: string): boolean {
  return useUnsavedStore((s) => id in s.entries);
}

/**
 * Enregistre les éléments demandés, l'un après l'autre.
 * Renvoie ceux dont l'enregistrement a échoué (liste vide : tout est bon).
 */
export async function saveEntries(ids: string[]): Promise<string[]> {
  const failed: string[] = [];

  for (const id of ids) {
    const entry = useUnsavedStore.getState().entries[id];

    if (!entry) {
      continue; // déjà enregistré entre-temps
    }

    let ok = false;

    try {
      ok = await entry.save();
    } catch {
      ok = false;
    }

    if (!ok) {
      failed.push(id);
    }
  }

  return failed;
}

/** Abandonne les modifications : les éléments ne sont plus signalés. */
export function discardEntries(ids: string[]) {
  const { unregister } = useUnsavedStore.getState();

  ids.forEach(unregister);
}

// ----------------------------------------------------------------------------
// Onglet courant
// ----------------------------------------------------------------------------

/**
 * Onglet de l'espace de travail qui contient l'écran : fourni par
 * `Workspace` autour de chaque vue. Une vue n'a donc pas à connaître
 * l'identifiant de son onglet.
 */
export const UnsavedTabContext = createContext<{ id: string; label: string } | null>(null);

// ----------------------------------------------------------------------------
// Hook des écrans
// ----------------------------------------------------------------------------

interface UseUnsavedChangesOptions {
  /** Vrai tant que des modifications ne sont pas enregistrées. */
  dirty: boolean;
  /** Enregistre ; renvoie `false` en cas d'échec (le message est affiché par l'écran). */
  save: () => Promise<boolean>;
  /**
   * Valeur qui change à chaque modification : relance le délai de
   * l'enregistrement automatique (comme une frappe au clavier).
   */
  revision?: unknown;
  /** Identifiant et nom, si l'écran n'est pas dans un onglet. */
  id?: string;
  label?: string;
  /** Faux pour un écran qui ne doit jamais s'enregistrer seul. */
  autoSave?: boolean;
}

/**
 * Déclare les modifications non enregistrées d'un écran.
 *
 * Les modifications sont retirées du registre quand elles sont
 * enregistrées (`dirty` redevient faux) ou quand l'écran disparaît.
 */
export function useUnsavedChanges({
  dirty,
  save,
  revision,
  id: ownId,
  label: ownLabel,
  autoSave = true,
}: UseUnsavedChangesOptions) {
  const tab = useContext(UnsavedTabContext);
  const id = ownId ?? tab?.id;
  const label = ownLabel ?? tab?.label ?? "";

  const register = useUnsavedStore((s) => s.register);
  const unregister = useUnsavedStore((s) => s.unregister);
  const settings = useAutoSave();

  // Toujours la dernière fonction d'enregistrement, sans réenregistrer.
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (!id) {
      return;
    }

    if (dirty) {
      register(id, { label, save: () => saveRef.current() });
    } else {
      unregister(id);
    }
  }, [id, label, dirty, register, unregister]);

  // L'écran disparaît (onglet fermé, page quittée) : plus rien à signaler.
  useEffect(() => {
    if (!id) {
      return;
    }

    return () => unregister(id);
  }, [id, unregister]);

  // Enregistrement automatique, après le délai choisi sans modification.
  useEffect(() => {
    if (!autoSave || !dirty || !settings.enabled) {
      return;
    }

    const timer = window.setTimeout(() => {
      // Réglage relu au dernier moment : il a pu être désactivé entre-temps.
      if (getAutoSave().enabled) {
        void saveRef.current();
      }
    }, settings.delay * 1000);

    return () => window.clearTimeout(timer);
  }, [autoSave, dirty, revision, settings.enabled, settings.delay]);
}
