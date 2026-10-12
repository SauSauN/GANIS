import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  nodeColor,
  nodeHeading,
  numberNodes,
  resolveLevels,
  type NodeHeading,
  type ResolvedLevel,
  type TemplateLevelName,
} from "@/lib/structure";
import { useProjectStructureData } from "@/stores/structureStore";
import type { Structure, StructureNode } from "@/types";

const TEMPLATE_INDEXES = ["0", "1", "2"] as const;

/** Noms traduits des niveaux du modèle. */
export function useTemplateLevelName(): TemplateLevelName {
  const { t } = useTranslation("structure");

  return useCallback<TemplateLevelName>(
    (template, index, form) => {
      const key = TEMPLATE_INDEXES[index];

      return key
        ? t(`templates.${template}.levels.${key}.${form}`)
        : t("levels.fallback", { number: index + 1 });
    },
    [t],
  );
}

export interface StructureLabels {
  /** Niveaux avec leurs noms (traduits ou personnalisés). */
  levels: ResolvedLevel[];
  /** Numéro calculé de chaque élément numéroté. */
  numbers: Map<string, number>;
  /** Morceaux du nom d'un élément. */
  headingOf: (node: Pick<StructureNode, "id" | "level" | "title">) => NodeHeading;
  /** Nom complet : « Chapitre 3 — Le départ ». */
  labelOf: (node: Pick<StructureNode, "id" | "level" | "title">) => string;
  /** Couleur d'un élément (celle de son niveau). */
  colorOf: (node: Pick<StructureNode, "level">) => string;
}

/** Noms et numéros des éléments d'un découpage déjà chargé. */
export function useStructureLabels(structure: Structure | null): StructureLabels {
  const templateName = useTemplateLevelName();

  return useMemo(() => {
    const levels = structure ? resolveLevels(structure, templateName) : [];
    const numbers = structure
      ? numberNodes(structure.nodes, levels, structure.autoNumbering)
      : new Map<string, number>();
    const headingOf: StructureLabels["headingOf"] = (node) => nodeHeading(node, levels, numbers);

    return {
      levels,
      numbers,
      headingOf,
      labelOf: (node) => headingOf(node).label,
      colorOf: (node) => nodeColor(node, levels),
    };
  }, [structure, templateName]);
}

/**
 * Découpage d'un projet (partagé, voir `structureStore`), avec les noms et
 * numéros de ses éléments (relations, fiches, liens, arborescence…).
 */
export function useProjectStructure(projectId: string) {
  const { structure, error, reload } = useProjectStructureData(projectId);

  return { structure, failed: error !== null, reload, ...useStructureLabels(structure) };
}
