import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { api } from "@/lib/api";
import { characterTabId, fullName } from "@/lib/characters";
import { locationTabId } from "@/lib/locations";
import { noteTabId } from "@/lib/notes";
import { structureNodeTabId } from "@/lib/structure";
import { WORLD_MODULES, worldTabId } from "@/lib/world";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectLocations } from "@/stores/locationStore";
import { useProjectNotes } from "@/stores/noteStore";
import { useEnabledWorldModules, useWorldEntries } from "@/stores/worldStore";
import type { ProjectImage, WorldModule } from "@/types";

/*
 * Ce qu'une note (ou le texte d'une scène de roman) peut citer avec « $ » :
 * personnages, lieux, éléments du découpage, fiches de l'univers, notes et
 * images de la galerie, avec de quoi retrouver leur nom actuel et ouvrir
 * leur fiche.
 */

export type MentionKind = "character" | "location" | "node" | WorldModule | "note" | "image";

export const MENTION_KINDS: MentionKind[] = ["character", "location", "node", ...WORLD_MODULES, "note", "image"];

/**
 * Lettre tapée entre deux « $ » (`$c$`, `$l$`…) → sortes d'éléments
 * proposées. Lettres anglaises par défaut, lettres françaises en plus
 * (`$p$` personnage, `$d$` découpage, `$u$` univers). « $$ » : tout.
 */
export const MENTION_TRIGGERS: Record<string, readonly MentionKind[]> = {
  c: ["character"],
  p: ["character"],
  l: ["location"],
  s: ["node"],
  d: ["node"],
  w: WORLD_MODULES,
  u: WORLD_MODULES,
  n: ["note"],
  i: ["image"],
};

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

function isWorldModule(kind: MentionKind): kind is WorldModule {
  return (WORLD_MODULES as MentionKind[]).includes(kind);
}

/** Images de la galerie du projet (sans leur contenu), lues à l'ouverture de l'éditeur. */
function useGalleryImages(projectId: string): ProjectImage[] {
  const [images, setImages] = useState<ProjectImage[]>([]);
  useEffect(() => {
    let alive = true;
    api
      .listProjectGallery(projectId)
      .then((list) => alive && setImages(list))
      .catch(() => alive && setImages([]));
    return () => {
      alive = false;
    };
  }, [projectId]);
  return images;
}

export function useNoteLinks(
  projectId: string,
  onOpenFeature?: (featureId: string) => void,
  onViewImage?: (image: MentionItem) => void,
): NoteLinks {
  const { characters } = useProjectCharacters(projectId);
  const { locations } = useProjectLocations(projectId);
  const { structure, labelOf } = useProjectStructure(projectId);
  const { notes } = useProjectNotes(projectId);
  const images = useGalleryImages(projectId);
  const enabled = useEnabledWorldModules(projectId);
  const world = {
    item: useWorldEntries(projectId, "item").entries,
    species: useWorldEntries(projectId, "species").entries,
    faction: useWorldEntries(projectId, "faction").entries,
    people: useWorldEntries(projectId, "people").entries,
    magic: useWorldEntries(projectId, "magic").entries,
  };
  // Toujours la dernière fonction, sans recalculer les liens : l'espace de
  // travail la recrée à chaque rendu (ex. note modifiée ↔ enregistrée), ce
  // qui relançait l'orthographe et redessinait la note, qui sautait.
  const openRef = useRef(onOpenFeature);
  openRef.current = onOpenFeature;
  const viewRef = useRef(onViewImage);
  viewRef.current = onViewImage;

  return useMemo(() => {
    const items: MentionItem[] = [
      ...characters.map((c) => ({ kind: "character" as const, id: c.id, label: fullName(c) })),
      ...locations.map((l) => ({ kind: "location" as const, id: l.id, label: l.name })),
      ...(structure?.nodes ?? []).map((n) => ({ kind: "node" as const, id: n.id, label: labelOf(n) })),
      // Modules du monde désactivés : rien à proposer (leurs fiches restent citées).
      ...WORLD_MODULES.flatMap((module) =>
        enabled[module] ? world[module].map((e) => ({ kind: module, id: e.id, label: e.name })) : [],
      ),
      ...notes.map((n) => ({ kind: "note" as const, id: n.id, label: n.title })),
      // Image sans nom : rien à taper pour la trouver.
      ...images.map((img) => ({ kind: "image" as const, id: img.id, label: img.caption ?? "" })),
    ].filter((item) => item.label.trim());

    const byKey = new Map(items.map((item) => [`${item.kind}:${item.id}`, item.label]));
    // Fiches d'un module désactivé : leur nom reste lisible dans la note.
    for (const module of WORLD_MODULES) {
      if (!enabled[module]) for (const e of world[module]) byKey.set(`${module}:${e.id}`, e.name);
    }
    const names = new Set<string>();
    for (const item of items) {
      if (item.kind === "node" || item.kind === "note" || item.kind === "image") continue;
      for (const word of item.label.split(/[^\p{L}\p{M}'’-]+/u)) if (word) names.add(word.toLowerCase());
    }

    return {
      items,
      resolve: (kind, id) => byKey.get(`${kind}:${id}`) ?? null,
      open: (kind, id) => {
        if (kind === "image") {
          viewRef.current?.({ kind, id, label: byKey.get(`image:${id}`) ?? "" });
          return;
        }
        const onOpenFeature = openRef.current;
        if (!onOpenFeature) return;
        onOpenFeature(
          kind === "character"
            ? characterTabId(id)
            : kind === "location"
              ? locationTabId(id)
              : kind === "note"
                ? noteTabId(id)
                : isWorldModule(kind)
                  ? worldTabId(kind, id)
                  : structureNodeTabId(id),
        );
      },
      names,
    };
    // `world` est recréé à chaque rendu : on suit ses listes une par une.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characters, locations, structure, labelOf, notes, images, enabled.item, enabled.species, enabled.faction, enabled.people, enabled.magic, world.item, world.species, world.faction, world.people, world.magic]);
}

/** Sans accents ni majuscules, pour comparer. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Lit ce qui suit le premier « $ » : `$jul` (après « $$ ») cherche dans
 * tout, `c$jul` (après « $c$ ») parmi les personnages… Autre chose (un
 * prix, « $c » pas encore fermé) : `null`, rien n'est proposé.
 */
export function parseMentionQuery(query: string): { kinds: readonly MentionKind[] | null; text: string } | null {
  if (query.startsWith("$")) return { kinds: null, text: query.slice(1) };
  const match = /^([a-z])\$/i.exec(query);
  const kinds = match ? MENTION_TRIGGERS[match[1].toLowerCase()] : undefined;
  return kinds ? { kinds, text: query.slice(2) } : null;
}

/** Vrai si le texte tapé est (ou commence par) un déclencheur : « $$ », « $c$ »… */
export function isMentionTrigger(text: string): boolean {
  return text.startsWith("$") && parseMentionQuery(text.slice(1)) !== null;
}

/**
 * Éléments qui correspondent à ce qui suit « $$ » ou « $c$ » : le nom
 * commence par la saisie, puis un de ses mots, puis il la contient. Aucun
 * résultat : rien n'est proposé (on continue d'écrire normalement).
 */
export function matchMentions(items: MentionItem[], query: string, limit = 8): MentionItem[] {
  const parsed = parseMentionQuery(query);
  if (!parsed) return [];
  const pool = parsed.kinds ? items.filter((item) => parsed.kinds!.includes(item.kind)) : items;
  const q = fold(parsed.text.trim());
  if (parsed.text.length > 60) return [];
  if (!q) return pool.slice(0, limit);
  const scored: Array<[number, MentionItem]> = [];
  for (const item of pool) {
    const label = fold(item.label);
    const score = label.startsWith(q) ? 0 : label.split(/[\s'’—-]+/).some((w) => w.startsWith(q)) ? 1 : label.includes(q) ? 2 : -1;
    if (score >= 0) scored.push([score, item]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].label.localeCompare(b[1].label));
  return scored.slice(0, limit).map(([, item]) => item);
}
