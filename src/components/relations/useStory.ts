import { useMemo } from "react";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { storyOrder } from "@/lib/relations";
import type { StructureNode } from "@/types";

/**
 * Découpage du récit dans l'ordre de lecture (parties, chapitres,
 * scènes…), pour la période des relations.
 */
export function useStory(projectId: string) {
  const { structure, failed, labelOf } = useProjectStructure(projectId);

  return useMemo(() => {
    const order: StructureNode[] = structure ? storyOrder(structure.nodes) : [];
    const positionOf = new Map(order.map((node, index) => [node.id, index]));

    return { order, positionOf, labelOf, loaded: structure !== null || failed };
  }, [structure, failed, labelOf]);
}
