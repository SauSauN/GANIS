import { useCallback, useMemo, useState } from "react";

/**
 * Sélection multiple dans une liste (corbeille, notes, documents…).
 *
 * `ids` : éléments actuellement affichés. La sélection ne garde que ceux-là :
 * un élément qui disparaît (supprimé, filtré) sort de la sélection.
 */
export function useSelection(ids: string[]) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  const shown = useMemo(() => new Set(ids), [ids]);
  const selected = useMemo(() => ids.filter((id) => picked.has(id)), [ids, picked]);

  const toggle = useCallback((id: string) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = ids.length > 0 && selected.length === ids.length;

  const toggleAll = useCallback(() => {
    setPicked(allSelected ? new Set() : new Set(shown));
  }, [allSelected, shown]);

  const clear = useCallback(() => setPicked(new Set()), []);

  /** Retire des éléments de la sélection (traités, supprimés). */
  const drop = useCallback((done: string[]) => {
    setPicked((current) => new Set([...current].filter((id) => !done.includes(id))));
  }, []);

  return {
    /** Éléments sélectionnés, dans l'ordre de la liste. */
    selected,
    count: selected.length,
    allSelected,
    /** Une partie seulement est sélectionnée (case « tout » indéterminée). */
    partial: selected.length > 0 && !allSelected,
    isSelected: (id: string) => picked.has(id) && shown.has(id),
    toggle,
    toggleAll,
    clear,
    drop,
  };
}

export type Selection = ReturnType<typeof useSelection>;
