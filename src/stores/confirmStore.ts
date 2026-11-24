import { create } from "zustand";

/*
 * Question de confirmation posée depuis du code hors React (ouverture d'un
 * document reçu, export d'un projet privé…). La fenêtre est affichée par
 * `GlobalConfirm` (monté une fois dans `App`).
 */

export interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel: string;
  /** Ton de l'action : `danger` pour un risque de sécurité. */
  tone?: "default" | "danger";
  /**
   * Avec une clé, la fenêtre propose « Ne plus demander » ; le choix est
   * gardé dans cet appareil (`localStorage`).
   */
  dontAskAgainKey?: string;
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (confirmed: boolean) => void;
}

interface ConfirmState {
  pending: PendingConfirm | null;
  answer: (confirmed: boolean, dontAskAgain?: boolean) => void;
}

const DONT_ASK_PREFIX = "ganis-dont-ask:";

function alreadyAccepted(key: string | undefined): boolean {
  if (!key) return false;
  try {
    return localStorage.getItem(DONT_ASK_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  pending: null,

  answer: (confirmed, dontAskAgain = false) => {
    const pending = get().pending;
    if (!pending) return;

    if (confirmed && dontAskAgain && pending.dontAskAgainKey) {
      try {
        localStorage.setItem(DONT_ASK_PREFIX + pending.dontAskAgainKey, "1");
      } catch {
        /* stockage indisponible : la question reviendra */
      }
    }

    set({ pending: null });
    pending.resolve(confirmed);
  },
}));

/**
 * Pose une question ; `true` si l'utilisateur confirme. Une question déjà
 * ouverte est refusée (réponse `false`) au profit de la nouvelle.
 */
export function askConfirm(request: ConfirmRequest): Promise<boolean> {
  if (alreadyAccepted(request.dontAskAgainKey)) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    useConfirmStore.getState().pending?.resolve(false);
    useConfirmStore.setState({ pending: { ...request, resolve } });
  });
}
