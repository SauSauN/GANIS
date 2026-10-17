import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { characterTabId } from "@/lib/characters";
import { locationTabId } from "@/lib/locations";
import { noteTabId } from "@/lib/notes";
import { structureNodeTabId } from "@/lib/structure";
import { usePlotStore } from "@/stores/plotStore";
import type { HistoryKind, SearchHit } from "@/types";

/** Onglet qui montre un élément (fiche, note…). `null` : pas d'onglet propre. */
export function itemTabId(kind: HistoryKind | SearchHit["kind"], id: string): string | null {
  switch (kind) {
    case "character":
      return characterTabId(id);
    case "location":
      return locationTabId(id);
    case "structureNode":
    // Document : `id` est celui de l'élément du découpage qui le contient.
    case "document":
      return structureNodeTabId(id);
    case "note":
      return noteTabId(id);
    case "noteFolder":
      return "notes.list";
    case "sticky":
      return "notes.wall";
    case "synopsis":
      return "synopsis.edit";
    case "plot":
    case "plotEvent":
      return "plot.board";
    default:
      return null;
  }
}

/**
 * Ouvre un résultat de recherche : son onglet, et pour un événement de la
 * trame, le plateau centré sur lui.
 */
export function openSearchHit(hit: SearchHit, onOpenFeature: (featureId: string) => void) {
  if (hit.kind === "plotEvent") usePlotStore.getState().requestFocus(hit.id);
  const tab = itemTabId(hit.kind, hit.id);
  if (tab) onOpenFeature(tab);
}

/** Ordre des groupes de résultats. */
export const SEARCH_ORDER: SearchHit["kind"][] = ["character", "location", "structureNode", "document", "plotEvent", "note", "noteFolder", "sticky"];

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
