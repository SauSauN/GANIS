import { useEffect, useRef, useState } from "react";
import {
  discardEntries,
  saveEntries,
  useUnsavedStore,
} from "@/lib/unsavedChanges";

/** Ce que l'appelant fait à chaque étape de la file. */
export interface UnsavedQueueHandlers {
  /** L'élément va être demandé (ex. : afficher son onglet). */
  onShow?: (id: string) => void;
  /** L'élément est réglé : enregistré, abandonné, ou déjà enregistré entre-temps. */
  onResolved?: (id: string) => void;
  /** Tous les éléments sont réglés. */
  onFinished?: () => void;
  /** L'utilisateur a choisi « Annuler » : les éléments restants ne sont pas traités. */
  onCancelled?: () => void;
}

interface QueueRun {
  ids: string[];
  /** Position de l'élément demandé dans `ids`. */
  index: number;
  handlers: UnsavedQueueHandlers;
}

/** Données de la question en cours, pour `UnsavedChangesDialog`. */
export interface UnsavedQueueQuestion {
  /** Identifiant de l'élément demandé. */
  id: string;
  /** Nom affiché (ex. « Synopsis »). */
  label: string;
  /** Rang de l'élément (à partir de 1) et nombre total d'éléments. */
  current: number;
  total: number;
  /** Vrai s'il reste d'autres éléments après celui-ci. */
  hasNext: boolean;
}

/**
 * Pose la question « Enregistrer ? » pour plusieurs éléments, **un par un**.
 *
 * Pour chaque élément : Enregistrer, Ne pas enregistrer ou Annuler. Le
 * choix ne vaut que pour cet élément ; on passe ensuite au suivant. Ainsi,
 * l'utilisateur peut enregistrer un onglet et en abandonner un autre.
 *
 * - « Annuler » arrête tout : les éléments déjà réglés le restent, les
 *   suivants ne sont pas touchés.
 * - Un enregistrement qui échoue laisse la question affichée, avec le
 *   message d'erreur : l'utilisateur peut ne pas enregistrer, ou annuler
 *   pour corriger.
 * - Un élément enregistré entre-temps (enregistrement automatique) est
 *   passé sans question.
 */
export function useUnsavedQueue() {
  const entries = useUnsavedStore((s) => s.entries);

  const [run, setRun] = useState<QueueRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Dernière valeur, pour les fonctions appelées après un `await`.
  const runRef = useRef(run);
  runRef.current = run;

  /** Passe au premier élément encore non enregistré à partir de `from`. */
  function advance(base: QueueRun, from: number) {
    const current = useUnsavedStore.getState().entries;
    let index = from;

    while (index < base.ids.length && !(base.ids[index] in current)) {
      base.handlers.onResolved?.(base.ids[index]);
      index += 1;
    }

    setFailed(false);

    if (index >= base.ids.length) {
      runRef.current = null;
      setRun(null);
      base.handlers.onFinished?.();
      return;
    }

    const next = { ...base, index };
    runRef.current = next;
    setRun(next);
    base.handlers.onShow?.(base.ids[index]);
  }

  /** Lance la file pour ces éléments (dans cet ordre). */
  function start(ids: string[], handlers: UnsavedQueueHandlers) {
    advance({ ids, index: 0, handlers }, 0);
  }

  // L'élément demandé a été enregistré entre-temps (enregistrement
  // automatique) : on passe au suivant sans attendre de réponse.
  useEffect(() => {
    if (run && !busy && !(run.ids[run.index] in entries)) {
      const { handlers, ids, index } = run;
      handlers.onResolved?.(ids[index]);
      advance(run, index + 1);
    }
    // `advance` relit l'état au moment de l'appel : inutile en dépendance.
  }, [run, busy, entries]);

  async function save() {
    const base = runRef.current;

    if (!base) return;

    const id = base.ids[base.index];

    setBusy(true);
    setFailed(false);

    const notSaved = await saveEntries([id]);

    setBusy(false);

    if (notSaved.length > 0) {
      setFailed(true);
      return;
    }

    base.handlers.onResolved?.(id);
    advance(base, base.index + 1);
  }

  function discard() {
    const base = runRef.current;

    if (!base) return;

    const id = base.ids[base.index];

    discardEntries([id]);
    base.handlers.onResolved?.(id);
    advance(base, base.index + 1);
  }

  function cancel() {
    const base = runRef.current;

    runRef.current = null;
    setRun(null);
    setFailed(false);
    base?.handlers.onCancelled?.();
  }

  const id = run ? run.ids[run.index] : null;

  const question: UnsavedQueueQuestion | null =
    run && id
      ? {
          id,
          label: entries[id]?.label ?? id,
          current: run.index + 1,
          total: run.ids.length,
          hasNext: run.index + 1 < run.ids.length,
        }
      : null;

  return {
    /** Question en cours, ou `null` si la file est vide. */
    question,
    busy,
    /** Vrai si le dernier enregistrement de l'élément demandé a échoué. */
    failed,
    start,
    save: () => void save(),
    discard,
    cancel,
  };
}
