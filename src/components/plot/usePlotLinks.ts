import { useMemo } from "react";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { fullName } from "@/lib/characters";
import { buildStructureTree, flattenVisible } from "@/lib/structure";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectLocations } from "@/stores/locationStore";
import { useProjectNotes } from "@/stores/noteStore";
import type { Character, Location, NoteSummary, StructureNode } from "@/types";

/**
 * Les autres tables du projet, vues depuis la trame : personnages, lieux,
 * éléments du découpage (dans l'ordre du plan) et notes, avec de quoi
 * retrouver un nom à partir d'un identifiant.
 */
export interface PlotLinks {
  characters: Character[];
  locations: Location[];
  /** Éléments du découpage dans l'ordre du plan du récit, avec leur profondeur. */
  nodes: Array<StructureNode & { depth: number }>;
  notes: NoteSummary[];
  /** Position de chaque élément du découpage dans le plan (ordre de lecture). */
  structureOrder: Map<string, number>;
  character: (id: string | null | undefined) => Character | undefined;
  location: (id: string | null | undefined) => Location | undefined;
  node: (id: string | null | undefined) => StructureNode | undefined;
  note: (id: string | null | undefined) => NoteSummary | undefined;
  characterName: (id: string) => string | null;
  locationName: (id: string) => string | null;
  /** « Chapitre 3 — Le départ ». */
  nodeLabel: (id: string) => string | null;
  /** « Chapitre 1 › Scène 2 » : l'élément précédé de son parent. */
  nodePath: (id: string) => string | null;
  nodeColor: (id: string) => string | null;
  noteTitle: (id: string) => string | null;
  ready: boolean;
}

export function usePlotLinks(projectId: string): PlotLinks {
  const { characters, loaded: charactersLoaded } = useProjectCharacters(projectId);
  const { locations, loaded: locationsLoaded } = useProjectLocations(projectId);
  const { notes, loaded: notesLoaded } = useProjectNotes(projectId);
  const { structure, headingOf, colorOf } = useProjectStructure(projectId);

  return useMemo(() => {
    const characterMap = new Map(characters.map((c) => [c.id, c]));
    const locationMap = new Map(locations.map((l) => [l.id, l]));
    const noteMap = new Map(notes.map((n) => [n.id, n]));
    const tree = structure ? flattenVisible(buildStructureTree(structure.nodes), new Set()) : [];
    const nodeMap = new Map(tree.map((n) => [n.id, n]));
    const structureOrder = new Map(tree.map((n, index) => [n.id, index]));

    return {
      characters,
      locations,
      nodes: tree,
      notes,
      structureOrder,
      character: (id) => (id ? characterMap.get(id) : undefined),
      location: (id) => (id ? locationMap.get(id) : undefined),
      node: (id) => (id ? nodeMap.get(id) : undefined),
      note: (id) => (id ? noteMap.get(id) : undefined),
      characterName: (id) => {
        const c = characterMap.get(id);
        return c ? fullName(c) : null;
      },
      locationName: (id) => locationMap.get(id)?.name ?? null,
      nodeLabel: (id) => {
        const n = nodeMap.get(id);
        return n ? headingOf(n).label : null;
      },
      nodePath: (id) => {
        const n = nodeMap.get(id);
        if (!n) return null;
        const parent = n.parentId ? nodeMap.get(n.parentId) : undefined;
        return parent ? `${headingOf(parent).label} › ${headingOf(n).label}` : headingOf(n).label;
      },
      nodeColor: (id) => {
        const n = nodeMap.get(id);
        return n ? colorOf(n) : null;
      },
      noteTitle: (id) => {
        const n = noteMap.get(id);
        return n ? n.title : null;
      },
      ready: charactersLoaded && locationsLoaded && notesLoaded && structure !== null,
    } satisfies PlotLinks;
  }, [characters, locations, notes, structure, headingOf, colorOf, charactersLoaded, locationsLoaded, notesLoaded]);
}
