import { useMemo } from "react";
import { isHexColor, useThemeRelationColors } from "@/lib/colorTheme";
import { RELATION_COLORS, RELATION_TYPES } from "@/lib/relations";
import type { RelationType } from "@/types";

/**
 * Couleur de chaque type de relation : celle du thème actif (package de
 * thème) si elle est définie, sinon la couleur par défaut. Suit les
 * changements de thème.
 */
export function useRelationColors(): Record<RelationType, string> {
  const custom = useThemeRelationColors();

  return useMemo(() => {
    const colors = { ...RELATION_COLORS };

    for (const type of RELATION_TYPES) {
      const color = custom[type];

      if (isHexColor(color)) {
        colors[type] = color;
      }
    }

    return colors;
  }, [custom]);
}
