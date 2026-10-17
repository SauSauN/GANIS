import { createContext, useContext, useMemo } from "react";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { characterTabId, fullName } from "@/lib/characters";
import { locationTabId } from "@/lib/locations";
import { structureNodeTabId } from "@/lib/structure";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectLocations } from "@/stores/locationStore";

/*
 * Ce qu'une note peut citer avec « $$ » : personnages, lieux et éléments
 * du découpage du projet, avec de quoi retrouver leur nom actuel et ouvrir
 * leur fiche.
 */

export type MentionKind = "character" | "location" | "node";

export const MENTION_KINDS: MentionKind[] = ["character", "location", "node"];

export interface MentionItem {
  kind: MentionKind;
  id: string;
  label: string;
}

export interface NoteLinks {
  items: MentionItem[];
  /** Nom actuel d'un élément cité (`null` : il n'existe plus). */
  resolve: (kind: MentionKind, id: string) => string | null;
  open: (kind: MentionKind, id: string) => void;
  /** Mots des noms du projet (le correcteur ne les souligne pas). */
  names: Set<string>;
}

const EMPTY: NoteLinks = { items: [], resolve: () => null, open: () => undefined, names: new Set() };

export const NoteLinksContext = createContext<NoteLinks>(EMPTY);

export const useNoteLinksContext = () => useContext(NoteLinksContext);

export function isMentionKind(value: unknown): value is MentionKind {
  return MENTION_KINDS.includes(value as MentionKind);
}

export function useNoteLinks(projectId: string, onOpenFeature?: (featureId: string) => void): NoteLinks {
  const { characters } = useProjectCharacters(projectId);
  const { locations } = useProjectLocations(projectId);
  const { structure, labelOf } = useProjectStructure(projectId);

  return useMemo(() => {
    const items: MentionItem[] = [
      ...characters.map((c) => ({ kind: "character" as const, id: c.id, label: fullName(c) })),
      ...locations.map((l) => ({ kind: "location" as const, id: l.id, label: l.name })),
      ...(structure?.nodes ?? []).map((n) => ({ kind: "node" as const, id: n.id, label: labelOf(n) })),
    ].filter((item) => item.label.trim());

    const byKey = new Map(items.map((item) => [`${item.kind}:${item.id}`, item.label]));
    const names = new Set<string>();
    for (const item of items) {
      if (item.kind === "node") continue;
      for (const word of item.label.split(/[^\p{L}\p{M}'’-]+/u)) if (word) names.add(word.toLowerCase());
    }

    return {
      items,
      resolve: (kind, id) => byKey.get(`${kind}:${id}`) ?? null,
      open: (kind, id) => {
        if (!onOpenFeature) return;
        onOpenFeature(kind === "character" ? characterTabId(id) : kind === "location" ? locationTabId(id) : structureNodeTabId(id));
      },
      names,
    };
  }, [characters, locations, structure, labelOf, onOpenFeature]);
}

/** Sans accents ni majuscules, pour comparer. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Éléments qui correspondent à ce qui suit « $$ » : le nom commence par la
 * saisie, puis un de ses mots, puis il la contient. Aucun résultat : rien
 * n'est proposé (on continue d'écrire normalement).
 */
export function matchMentions(items: MentionItem[], query: string, limit = 8): MentionItem[] {
  const q = fold(query.trim());
  if (query.length > 60) return [];
  if (!q) return items.slice(0, limit);
  const scored: Array<[number, MentionItem]> = [];
  for (const item of items) {
    const label = fold(item.label);
    const score = label.startsWith(q) ? 0 : label.split(/[\s'’—-]+/).some((w) => w.startsWith(q)) ? 1 : label.includes(q) ? 2 : -1;
    if (score >= 0) scored.push([score, item]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].label.localeCompare(b[1].label));
  return scored.slice(0, limit).map(([, item]) => item);
}
