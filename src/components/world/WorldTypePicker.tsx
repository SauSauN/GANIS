import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { categoryIcon, categoryTint } from "@/components/world/worldStyle";
import type { WorldLabels } from "@/components/world/useWorldLabels";
import { enabledCategories, typesOfCategory } from "@/lib/world";
import { cn } from "@/lib/utils";
import type { WorldModule, WorldSettings } from "@/types";

/** Comparaison sans accents ni majuscules. */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Choix du type : les catégories choisies par l'auteur dans les paramètres
 * (armes, véhicules… ; faune, flore), chacune avec la liste de ses types.
 * Une recherche filtre les types par leur nom.
 */
export function WorldTypePicker({
  module,
  value,
  onSelect,
  settings,
  labels,
  onManage,
  disabled,
}: {
  module: WorldModule;
  value: string;
  onSelect: (type: string) => void;
  settings: WorldSettings;
  labels: WorldLabels;
  /** Ouvre les paramètres (catégories, types ajoutés). */
  onManage?: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("world");
  const [query, setQuery] = useState("");
  const needle = normalize(query.trim());

  const groups = enabledCategories(module, settings)
    .map((category) => ({
      category,
      types: typesOfCategory(module, category, settings.customTypes).filter(
        (item) => !needle || normalize(labels.type(item.id)).includes(needle),
      ),
    }))
    .filter((group) => !needle || group.types.length > 0);

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
            onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
            placeholder={t("picker.search")}
            aria-label={t("picker.search")}
            className="pl-8"
            disabled={disabled}
          />
        </div>

        {onManage && (
          <button
            type="button"
            onClick={onManage}
            className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
          >
            <Settings2 className="size-3.5" aria-hidden="true" />
            {t("picker.manage")}
          </button>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("picker.noResult")}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groups.map(({ category, types }) => {
            const CategoryIcon = categoryIcon(module, category);
            const selected = types.some((item) => item.id === value);

            return (
              <section key={category} className="rounded-lg border bg-card p-4" aria-label={labels.category(category)}>
                <div className="mb-3 flex items-start gap-3">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-md"
                    style={categoryTint(module, category)}
                  >
                    <CategoryIcon className="size-4.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">{labels.category(category)}</h3>
                    <p className="text-xs leading-5 text-muted-foreground">{labels.categoryDescription(category)}</p>
                  </div>
                </div>

                <select
                  aria-label={labels.category(category)}
                  disabled={disabled}
                  value={selected ? value : ""}
                  onChange={(e) => e.target.value && onSelect(e.target.value)}
                  className={cn(
                    "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none",
                    "focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                    selected && "border-primary",
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
