import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  CATEGORY_ICONS,
  categoryTint,
} from "@/components/locations/locationStyle";
import type { LocationLabels } from "@/components/locations/useLocationLabels";
import {
  LOCATION_CATEGORIES,
  typesOfCategory,
} from "@/lib/locations";
import { cn } from "@/lib/utils";
import type { CustomLocationType } from "@/types";

interface LocationTypePickerProps {
  value: string;
  onSelect: (type: string) => void;
  customTypes: CustomLocationType[];
  labels: LocationLabels;
  /** Ouvre les paramètres pour ajouter des types (facultatif). */
  onManageTypes?: () => void;
  disabled?: boolean;
}

/** Comparaison sans accents ni majuscules (« ile » trouve « Île »). */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Choix du type d'un lieu : les six catégories, chacune avec un menu
 * déroulant de ses types (par défaut puis ceux ajoutés par l'auteur).
 * Une recherche filtre les types par leur nom (et les catégories vides).
 */
export function LocationTypePicker({
  value,
  onSelect,
  customTypes,
  labels,
  onManageTypes,
  disabled,
}: LocationTypePickerProps) {
  const { t } = useTranslation("locations");
  const [query, setQuery] = useState("");
  const needle = normalize(query.trim());

  const groups = LOCATION_CATEGORIES.map((category) => ({
    category,
    types: typesOfCategory(category, customTypes).filter(
      (item) => !needle || normalize(labels.type(item.id)).includes(needle),
    ),
  })).filter((group) => !needle || group.types.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // Entrée ne doit pas envoyer la fiche autour (formulaire).
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            placeholder={t("picker.search")}
            aria-label={t("picker.search")}
            className="pl-8"
            disabled={disabled}
          />
        </div>

        {onManageTypes && (
          <button
            type="button"
            onClick={onManageTypes}
            className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            {t("picker.manage")}
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("picker.noResult")}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groups.map(({ category, types }) => {
            const CategoryIcon = CATEGORY_ICONS[category];

            return (
              <section key={category} className="rounded-lg border bg-card p-4" aria-label={labels.category(category)}>
                <div className="mb-3 flex items-start gap-3">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-md"
                    style={categoryTint(category)}
                  >
                    <CategoryIcon className="size-4.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{labels.category(category)}</h3>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {labels.categoryDescription(category)}
                    </p>
                  </div>
                </div>

                {/* Types en menu déroulant : une catégorie peut en compter
                    beaucoup (surtout avec les types ajoutés par l'auteur). */}
                <select
                  aria-label={labels.category(category)}
                  disabled={disabled}
                  value={types.some((item) => item.id === value) ? value : ""}
                  onChange={(e) => e.target.value && onSelect(e.target.value)}
                  className={cn(
                    "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none",
                    "focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                    types.some((item) => item.id === value) && "border-primary",
                  )}
                >
                  <option value="" disabled>
                    {t("picker.choose", { count: types.length })}
                  </option>
                  {types.map((item) => (
                    <option key={item.id} value={item.id}>
                      {labels.type(item.id)}
                      {item.customName ? ` — ${t("type.custom")}` : ""}
                    </option>
                  ))}
                </select>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
