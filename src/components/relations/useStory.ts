import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { storyOrder } from "@/lib/relations";
import { levelKey } from "@/lib/structure";
import type { Structure, StructureNode } from "@/types";

/**
 * Découpage du récit dans l'ordre de lecture (parties, chapitres,
 * scènes…), pour la période des relations.
 */
export function useStory(projectId: string) {
  const { t } = useTranslation("structure");
  const [structure, setStructure] = useState<Structure | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .getStructure(projectId)
      .then((next) => !cancelled && setStructure(next))
      .catch(() => !cancelled && setStructure(null));

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return useMemo(() => {
    const order: StructureNode[] = structure ? storyOrder(structure.nodes) : [];
    const positionOf = new Map(order.map((node, index) => [node.id, index]));

    /** « Chapitre · Le port d'Ysmir » */
    const labelOf = (node: StructureNode) =>
      structure
        ? `${t(`templates.${structure.template}.levels.${levelKey(node.level)}.one`)} · ${node.title}`
        : node.title;

    return { order, positionOf, labelOf, loaded: structure !== null };
  }, [structure, t]);
}
