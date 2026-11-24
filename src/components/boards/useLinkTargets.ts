import { useMemo } from "react";
import { Drama, Flag, ListTree, MapPinned, NotebookText, Package, PawPrint, UserRound, Zap, type LucideIcon } from "lucide-react";
import { usePlotLinks } from "@/components/plot/usePlotLinks";
import { BOARD_LINK_KINDS, type BoardLink, type BoardLinkKind } from "@/lib/boards";
import { characterTabId, fullName } from "@/lib/characters";
import { locationTabId } from "@/lib/locations";
import { noteTabId } from "@/lib/notes";
import { structureNodeTabId } from "@/lib/structure";
import { worldTabId } from "@/lib/world";
import { useWorldEntries } from "@/stores/worldStore";

/** Icône de chaque sorte d'élément lié (les mêmes que dans le reste de GANIS). */
export const BOARD_LINK_ICONS: Record<BoardLinkKind, LucideIcon> = {
  character: UserRound,
  location: MapPinned,
  item: Package,
  species: PawPrint,
  faction: Flag,
  people: Drama,
  magic: Zap,
  node: ListTree,
  note: NotebookText,
};

export interface LinkTarget extends BoardLink {
  name: string;
  /** Onglet de l'élément. */
  tabId: string;
}

/**
 * Tous les éléments du projet auxquels une planche peut être liée, par
 * sorte : personnages, lieux, fiches du monde, éléments du découpage (dans
 * l'ordre du plan) et notes. `find` retrouve un lien (`undefined` : élément
 * supprimé depuis).
 */
export function useLinkTargets(projectId: string) {
  const links = usePlotLinks(projectId);
  const item = useWorldEntries(projectId, "item").entries;
  const species = useWorldEntries(projectId, "species").entries;
  const faction = useWorldEntries(projectId, "faction").entries;
  const people = useWorldEntries(projectId, "people").entries;
  const magic = useWorldEntries(projectId, "magic").entries;

  return useMemo(() => {
    const byName = (a: LinkTarget, b: LinkTarget) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    const world = (kind: "item" | "species" | "faction" | "people" | "magic", list: Array<{ id: string; name: string }>) =>
      list.map((entry) => ({ kind, id: entry.id, name: entry.name, tabId: worldTabId(kind, entry.id) })).sort(byName);

    const byKind: Record<BoardLinkKind, LinkTarget[]> = {
      character: links.characters.map((c) => ({ kind: "character" as const, id: c.id, name: fullName(c), tabId: characterTabId(c.id) })).sort(byName),
      location: links.locations.map((l) => ({ kind: "location" as const, id: l.id, name: l.name, tabId: locationTabId(l.id) })).sort(byName),
      item: world("item", item),
      species: world("species", species),
      faction: world("faction", faction),
      people: world("people", people),
      magic: world("magic", magic),
      // Découpage : dans l'ordre du plan, avec son parent (« Chapitre 1 › Page 3 »).
      node: links.nodes.map((n) => ({ kind: "node" as const, id: n.id, name: links.nodePath(n.id) ?? "", tabId: structureNodeTabId(n.id) })),
      note: links.notes.map((n) => ({ kind: "note" as const, id: n.id, name: n.title || "—", tabId: noteTabId(n.id) })).sort(byName),
    };
    const index = new Map(BOARD_LINK_KINDS.flatMap((kind) => byKind[kind].map((target) => [`${kind}:${target.id}`, target] as const)));
    return {
      byKind,
      find: (link: BoardLink) => index.get(`${link.kind}:${link.id}`),
    };
  }, [links, item, species, faction, people, magic]);
}
