import { useTranslation } from "react-i18next";
import {
  Folder,
  ListTree,
  MapPinned,
  NotebookText,
  Paperclip,
  StickyNote,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { SEARCH_ORDER } from "@/lib/search";
import { cn } from "@/lib/utils";
import type { SearchHit } from "@/types";

export const SEARCH_ICONS: Record<SearchHit["kind"], LucideIcon> = {
  character: UserRound,
  location: MapPinned,
  structureNode: ListTree,
  document: Paperclip,
  note: NotebookText,
  noteFolder: Folder,
  sticky: StickyNote,
};

/** Met en évidence les mots cherchés (sans tenir compte des accents). */
export function Highlight({ text, query }: { text: string; query: string }) {
  const fold = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length || !text) return <>{text}</>;

  // Correspondance caractère par caractère entre le texte et sa version sans accents.
  const folded: string[] = [];
  for (const char of text) folded.push(fold(char));
  const flat = folded.join("");
  const marks = new Array<boolean>(folded.length).fill(false);

  for (const word of words) {
    let from = 0;
    for (;;) {
      const at = flat.indexOf(word, from);
      if (at < 0) break;
      // Position (en caractères d'origine) de l'indice `at` du texte replié.
      let offset = 0;
      for (let i = 0; i < folded.length; i++) {
        const end = offset + folded[i].length;
        if (end > at && offset < at + word.length) marks[i] = true;
        offset = end;
      }
      from = at + word.length;
    }
  }

  const chars = [...text];
  const parts: Array<{ text: string; mark: boolean }> = [];
  chars.forEach((char, index) => {
    const last = parts[parts.length - 1];
    if (last && last.mark === marks[index]) last.text += char;
    else parts.push({ text: char, mark: marks[index] });
  });

  return (
    <>
      {parts.map((part, index) =>
        part.mark ? (
          <mark key={index} className="rounded-sm bg-primary/20 px-px text-inherit">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

interface SearchResultsProps {
  hits: SearchHit[];
  query: string;
  /** Résultat sélectionné au clavier (palette). */
  activeIndex?: number;
  onOpen: (hit: SearchHit) => void;
  compact?: boolean;
}

/** Résultats regroupés par type (personnages, lieux, découpage, notes…). */
export function SearchResults({ hits, query, activeIndex = -1, onOpen, compact }: SearchResultsProps) {
  const { t } = useTranslation("search");
  const tt = t as unknown as (key: string) => string;
  const ordered = SEARCH_ORDER.flatMap((kind) => hits.filter((hit) => hit.kind === kind));
  let index = -1;

  return (
    <div className="space-y-3">
      {SEARCH_ORDER.map((kind) => {
        const group = ordered.filter((hit) => hit.kind === kind);
        if (!group.length) return null;
        const Icon = SEARCH_ICONS[kind];
        return (
          <section key={kind}>
            <h3 className="px-2 pb-1 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
              {tt(`kinds.${kind}`)} ({group.length})
            </h3>
            <ul>
              {group.map((hit) => {
                index++;
                const active = index === activeIndex;
                return (
                  <li key={`${hit.kind}:${hit.id}`}>
                    <button
                      type="button"
                      data-active={active || undefined}
                      onClick={() => onOpen(hit)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                        active && "bg-accent",
                      )}
                    >
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate", !hit.title && "text-muted-foreground italic")}>
                          <Highlight text={hit.title || tt(`untitled.${kind}`)} query={query} />
                        </span>
                        {hit.snippet && (
                          <span className={cn("block text-xs text-muted-foreground", compact ? "truncate" : "line-clamp-2")}>
                            <Highlight text={hit.snippet} query={query} />
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
