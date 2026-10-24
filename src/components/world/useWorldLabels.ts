import { useTranslation } from "react-i18next";
import { findType, isBuiltinType, isDefaultStatus } from "@/lib/world";
import type { CustomLocationType, SpeciesNature, WorldLinkKind, WorldModule } from "@/types";

/** `t` sans typage des clés : les clés viennent des catalogues. */
type LooseT = (key: string, options?: Record<string, unknown>) => string;

/**
 * Libellés d'un module dans la langue courante : catégories, types (par
 * défaut traduits, ajoutés par l'auteur tels quels), statuts, champs,
 * natures. Clés de `world.json`, sous `item.` ou `species.`.
 */
export function useWorldLabels(module: WorldModule, customTypes: CustomLocationType[]) {
  const { t: typed } = useTranslation("world");
  const t = typed as unknown as LooseT;
  const p = `${module}.`;

  return {
    /** Texte propre au module (`item.list.empty`…). */
    text: (key: string, options?: Record<string, unknown>) => t(`${p}${key}`, options),
    category: (id: string) => t(`${p}categories.${id}.label`),
    categoryDescription: (id: string) => t(`${p}categories.${id}.description`),
    type: (type: string) => {
      if (isBuiltinType(module, type)) return t(`${p}types.${type}`);
      return findType(module, type, customTypes)?.customName ?? t("type.unknown");
    },
    status: (value: string) => (isDefaultStatus(module, value) ? t(`${p}statuses.${value}`) : value),
    field: (key: string) => t(`${p}fields.${key}`),
    placeholder: (key: string) => t(`${p}placeholders.${key}`, { defaultValue: "" }) || undefined,
    option: (field: string, value: string) => t(`${p}options.${field}.${value}`, { defaultValue: value }),
    nature: (nature: SpeciesNature) => t(`natures.${nature}.label`),
  };
}

export type WorldLabels = ReturnType<typeof useWorldLabels>;

/** Libellés des liens entre éléments (nature, dans un sens ou dans l'autre ; sortes). */
export function useWorldLinkLabels() {
  const { t: typed } = useTranslation("world");
  const t = typed as unknown as LooseT;

  return {
    type: (type: string, forward: boolean) => t(`links.types.${type}.${forward ? "forward" : "backward"}`),
    kind: (kind: WorldLinkKind) => t(`links.kinds.${kind}`),
  };
}
