import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { UnsavedChangesDialog } from "@/components/layout/UnsavedChangesDialog";
import { isTauri } from "@/lib/api";
import {
  discardEntries,
  saveEntries,
  useUnsavedStore,
  type LeaveKind,
} from "@/lib/unsavedChanges";

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
 * modifications non enregistrées, demande quoi en faire.
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
  const { t } = useTranslation("unsaved");
  const entries = useUnsavedStore((s) => s.entries);
  const pending = useUnsavedStore((s) => s.pending);
  const requestLeave = useUnsavedStore((s) => s.requestLeave);
  const clearPending = useUnsavedStore((s) => s.clearPending);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Plus rien à enregistrer pendant que la question est affichée
  // (enregistrement automatique) : on continue sans demander.
  useEffect(() => {
    if (pending && !busy && Object.keys(entries).length === 0) {
      const { proceed } = pending;
      clearPending();
      proceed();
    }
  }, [pending, busy, entries, clearPending]);

  if (!pending) {
    return null;
  }

  const ids = Object.keys(entries);
  const labels = ids.map((id) => entries[id].label);

  function finish() {
    const { proceed } = pending!;
    setError(null);
    clearPending();
    proceed();
  }

  async function handleSave() {
    setBusy(true);
    setError(null);

    const failed = await saveEntries(ids);

    setBusy(false);

    if (failed.length === 0) {
      finish();
      return;
    }

    const names = failed.map((id) => entries[id]?.label ?? id).join(", ");
    setError(t("failed", { count: failed.length, names }));
  }

  function handleDiscard() {
    discardEntries(ids);
    finish();
  }

  function handleCancel() {
    setError(null);
    clearPending();
  }

  return (
    <UnsavedChangesDialog
      open
      reason={pending.kind satisfies LeaveKind}
      items={labels}
      busy={busy}
      error={error}
      onSave={() => void handleSave()}
      onDiscard={handleDiscard}
      onCancel={handleCancel}
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
