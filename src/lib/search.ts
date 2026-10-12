import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { characterTabId } from "@/lib/characters";
import { locationTabId } from "@/lib/locations";
import { noteTabId } from "@/lib/notes";
import { structureNodeTabId } from "@/lib/structure";
import type { HistoryKind, SearchHit } from "@/types";

/** Onglet qui montre un élément (fiche, note…). `null` : pas d'onglet propre. */
export function itemTabId(kind: HistoryKind, id: string): string | null {
  switch (kind) {
    case "character":
      return characterTabId(id);
    case "location":
      return locationTabId(id);
    case "structureNode":
      return structureNodeTabId(id);
    case "note":
      return noteTabId(id);
    case "noteFolder":
      return "notes.list";
    case "sticky":
      return "notes.wall";
    case "synopsis":
      return "synopsis.edit";
    default:
      return null;
  }
}

/** Ordre des groupes de résultats. */
export const SEARCH_ORDER: SearchHit["kind"][] = ["character", "location", "structureNode", "note", "noteFolder", "sticky"];

/**
 * Résultats de recherche dans le projet, relus 200 ms après la dernière
 * frappe. Un ancien résultat arrivé en retard est ignoré.
 */
export function useProjectSearch(projectId: string, query: string) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setHits([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      api
        .searchProject(projectId, text)
        .then((result) => {
          if (!cancelled) {
            setHits(result);
            setError(null);
          }
        })
        .catch((cause) => {
          if (!cancelled) setError(cause instanceof ApiError ? cause.message : String(cause));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [projectId, query]);

  return { hits, loading, error };
}
