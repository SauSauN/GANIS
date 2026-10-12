import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Search, X } from "lucide-react";
import { SearchResults } from "@/components/search/SearchResults";
import { itemTabId, useProjectSearch } from "@/lib/search";

interface SideBarSearchProps {
  projectId: string;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Module « Recherche » : cherche dans tout le projet (personnages, lieux,
 * découpage, notes, post-it), sans tenir compte des accents ni de la casse.
 */
export function SideBarSearch({ projectId, onOpenFeature }: SideBarSearchProps) {
  const { t } = useTranslation("search");
  const [query, setQuery] = useState("");
  const { hits, loading, error } = useProjectSearch(projectId, query);
  const searching = query.trim().length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-3">
        <Search className="pointer-events-none absolute top-1/2 left-5.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === "Escape" && setQuery("")}
          placeholder={t("placeholder")}
          aria-label={t("placeholder")}
          className="h-9 w-full rounded-md border border-input bg-background pr-8 pl-8 text-sm outline-none focus:ring-2 focus:ring-ring [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("clear")}
            title={t("clear")}
            className="absolute top-1/2 right-4 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <p className="px-4 pt-2 text-xs text-muted-foreground" role="status" aria-live="polite">
        {!searching
          ? t("hint")
          : loading
            ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" /> {t("searching")}
                </span>
              )
            : error
              ? <span className="text-destructive">{error}</span>
              : hits.length === 0
                ? t("none")
                : t("count", { count: hits.length })}
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        <SearchResults
          hits={hits}
          query={query}
          onOpen={(hit) => {
            const tab = itemTabId(hit.kind, hit.id);
            if (tab) onOpenFeature(tab);
          }}
        />
      </div>
    </div>
  );
}
