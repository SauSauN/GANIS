import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { UnsavedChangesDialog } from "@/components/layout/UnsavedChangesDialog";
import { useUnsavedQueue } from "@/components/layout/useUnsavedQueue";
import { isTauri } from "@/lib/api";
import { useUnsavedStore } from "@/lib/unsavedChanges";

/** Ferme réellement la fenêtre, sans repasser par la question. */
function closeWindow() {
  if (isTauri()) {
    void getCurrentWindow().destroy();
  } else {
    window.close();
  }
}

/**
 * Garde globale : avant de quitter une page ou de fermer GANIS avec des
 * modifications non enregistrées, demande quoi en faire, pour chaque
 * élément l'un après l'autre (voir `useUnsavedQueue`). Une fois tous les
 * éléments réglés, on quitte ; « Annuler » arrête tout et on reste.
 *
 * - Fermeture de la fenêtre (bouton ×, Alt+F4, barre des tâches) : la
 *   demande de fermeture de Tauri est interceptée.
 * - Navigation et déconnexion : passent par `requestLeave` (voir
 *   `useGuardedNavigate`).
 * - Hors de Tauri (navigateur), l'avertissement standard du navigateur.
 *
 * Montée une seule fois, dans `App`.
 */
export function UnsavedChangesGuard() {
  const pending = useUnsavedStore((s) => s.pending);
  const requestLeave = useUnsavedStore((s) => s.requestLeave);
  const clearPending = useUnsavedStore((s) => s.clearPending);

  const queue = useUnsavedQueue();

  // --- Fermeture de la fenêtre --------------------------------------------
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    getCurrentWindow()
      .onCloseRequested((event) => {
        const { entries: current } = useUnsavedStore.getState();

        if (Object.keys(current).length > 0) {
          event.preventDefault();
          requestLeave("quit", closeWindow);
        }
        // Sinon, rien à faire : la fenêtre se ferme normalement.
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [requestLeave]);

  // --- Navigateur (développement hors Tauri) ------------------------------
  useEffect(() => {
    if (isTauri()) {
      return;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (Object.keys(useUnsavedStore.getState().entries).length > 0) {
        event.preventDefault();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);

    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // Demande de sortie : la question est posée pour chaque élément non
  // enregistré, l'un après l'autre. S'il n'y en a plus (enregistrement
  // automatique entre-temps), on quitte sans rien demander.
  useEffect(() => {
    if (!pending) {
      return;
    }

    const { proceed } = pending;

    queue.start(Object.keys(useUnsavedStore.getState().entries), {
      onFinished: () => {
        clearPending();
        proceed();
      },
      onCancelled: clearPending,
    });
    // Une seule file par demande de sortie.
  }, [pending]);

  if (!pending) {
    return null;
  }

  return (
    <UnsavedChangesDialog
      reason={pending.kind}
      question={queue.question}
      busy={queue.busy}
      failed={queue.failed}
      onSave={queue.save}
      onDiscard={queue.discard}
      onCancel={queue.cancel}
    />
  );
}

/**
 * `navigate` qui demande d'abord quoi faire des modifications non
 * enregistrées. À utiliser pour les sorties de page (barre du haut,
 * menu du compte, boutons « Retour »).
 */
export function useGuardedNavigate() {
  const navigate = useNavigate();
  const requestLeave = useUnsavedStore((s) => s.requestLeave);

  return (to: string, options?: { replace?: boolean }) =>
    requestLeave("leave", () => navigate(to, options));
}
