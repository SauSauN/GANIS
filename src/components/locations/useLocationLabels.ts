import { useTranslation } from "react-i18next";
import {
  findType,
  isBuiltinType,
  isDefaultStatus,
  type LocationCategory,
} from "@/lib/locations";
import type { CustomLocationType } from "@/types";

/** `t` sans typage des clés : les clés des lieux viennent du catalogue. */
type LooseT = (key: string, options?: Record<string, unknown>) => string;

/**
 * Libellés des lieux dans la langue courante : catégories, types (par
 * défaut traduits, ajoutés par l'auteur tels quels), statuts, champs.
 */
export function useLocationLabels(customTypes: CustomLocationType[]) {
  const { t: typed } = useTranslation("locations");
  const t = typed as unknown as LooseT;

  return {
    category: (id: LocationCategory) => t(`categories.${id}.label`),
    categoryDescription: (id: LocationCategory) => t(`categories.${id}.description`),
    type: (type: string) => {
      if (isBuiltinType(type)) return t(`types.${type}`);
      return findType(type, customTypes)?.customName ?? t("type.unknown");
    },
    status: (value: string) => (isDefaultStatus(value) ? t(`statuses.${value}`) : value),
    field: (key: string) => t(`fields.${key}`),
    placeholder: (key: string) => t(`placeholders.${key}`, { defaultValue: "" }) || undefined,
    option: (field: string, value: string) => t(`options.${field}.${value}`, { defaultValue: value }),
  };
}

export type LocationLabels = ReturnType<typeof useLocationLabels>;
