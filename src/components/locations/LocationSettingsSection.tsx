import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CATEGORY_ICONS, categoryTint } from "@/components/locations/locationStyle";
import { useLocationLabels } from "@/components/locations/useLocationLabels";
import {
  cardClass,
  cardContentClass,
  cardHeaderClass,
  fieldClass,
} from "@/components/workspace/views/PageShell";
import { LOCATION_CATEGORIES, statusValues, type LocationCategory } from "@/lib/locations";
import { cn } from "@/lib/utils";
import { useLocationStore, useProjectLocations } from "@/stores/locationStore";

/**
 * Paramètres du projet › Lieux : types ajoutés par l'auteur (chacun dans
 * une catégorie) et liste des statuts. Chaque changement est enregistré
 * tout de suite.
 */
export function LocationSettingsSection({ projectId }: { projectId: string }) {
  const { t } = useTranslation("locations");
  const { settings, loaded } = useProjectLocations(projectId);
  const labels = useLocationLabels(settings.customTypes);
  const setCustomTypes = useLocationStore((state) => state.setCustomTypes);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<LocationCategory>("built");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const types = settings.customTypes;

  async function save(next: typeof types | Array<{ name: string; category: string; id?: string }>) {
    setBusy(true);
    setError(null);

    try {
      await setCustomTypes(projectId, next);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const value = name.trim();
    if (!value) return;

    if (await save([...types, { name: value, category }])) setName("");
  }

  const locked = !loaded || busy;

  return (
    <div className="space-y-8">
      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("settings.types.title")}</CardTitle>
          <CardDescription>{t("settings.types.description")}</CardDescription>
        </CardHeader>

        <CardContent className={`${cardContentClass} space-y-5`}>
          {types.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("settings.types.empty")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {types.map((item) => {
                const itemCategory = item.category as LocationCategory;
                const Icon = CATEGORY_ICONS[itemCategory];

                return (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                    <span
                      className="flex size-7 shrink-0 items-center justify-center rounded-md"
                      style={categoryTint(itemCategory)}
                    >
                      {Icon && <Icon className="size-3.5" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {labels.category(itemCategory)}
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      disabled={locked}
                      onClick={() => void save(types.filter((other) => other.id !== item.id))}
                      aria-label={t("settings.types.remove", { name: item.name })}
                      title={t("settings.types.remove", { name: item.name })}
                    >
                      <X />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_14rem_auto]">
            <Input
              value={name}
              maxLength={60}
              placeholder={t("settings.types.namePlaceholder")}
              aria-label={t("settings.types.name")}
              disabled={locked}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void add();
                }
              }}
            />
            <select
              value={category}
              aria-label={t("settings.types.category")}
              disabled={locked}
              onChange={(e) => setCategory(e.target.value as LocationCategory)}
              className={cn(fieldClass, "h-9")}
            >
              {LOCATION_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {labels.category(item)}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" disabled={locked || !name.trim()} onClick={() => void add()}>
              <Plus />
              {t("settings.types.add")}
            </Button>
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <StatusListCard projectId={projectId} />
    </div>
  );
}

/** Liste des statuts : valeurs retirables, champ pour en ajouter. */
function StatusListCard({ projectId }: { projectId: string }) {
  const { t } = useTranslation("locations");
  const { settings, loaded } = useProjectLocations(projectId);
  const labels = useLocationLabels(settings.customTypes);
  const setStatusList = useLocationStore((state) => state.setStatusList);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const values = statusValues(settings.lists);
  const customized = settings.lists.status !== undefined;

  async function save(next: string[] | null) {
    setBusy(true);
    setError(null);

    try {
      await setStatusList(projectId, next);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const value = draft.trim();
    if (!value) return;

    if (values.some((item) => labels.status(item).toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }

    if (await save([...values, value])) setDraft("");
  }

  const locked = !loaded || busy;

  return (
    <Card className={cardClass}>
      <CardHeader className={`${cardHeaderClass} flex flex-row items-start justify-between gap-4`}>
        <span className="min-w-0">
          <CardTitle>{t("settings.statuses.title")}</CardTitle>
          <CardDescription>{t("settings.statuses.description")}</CardDescription>
        </span>
        {customized && (
          <Button type="button" size="xs" variant="ghost" disabled={locked} onClick={() => void save(null)}>
            <RotateCcw />
            {t("settings.statuses.reset")}
          </Button>
        )}
      </CardHeader>

      <CardContent className={`${cardContentClass} space-y-3`}>
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs font-medium"
            >
              {labels.status(value)}
              <button
                type="button"
                disabled={locked || values.length <= 1}
                onClick={() => void save(values.filter((item) => item !== value))}
                aria-label={t("settings.statuses.remove", { value: labels.status(value) })}
                className="rounded hover:text-destructive disabled:opacity-40"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            value={draft}
            maxLength={60}
            placeholder={t("settings.statuses.placeholder")}
            disabled={locked}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
          />
          <Button type="button" variant="outline" disabled={locked || !draft.trim()} onClick={() => void add()}>
            <Plus />
            {t("settings.statuses.add")}
          </Button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
