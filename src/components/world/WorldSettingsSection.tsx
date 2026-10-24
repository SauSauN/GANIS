import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LevelPicker } from "@/components/characters/LevelPicker";
import { cardClass, cardContentClass, cardHeaderClass, fieldClass } from "@/components/workspace/views/PageShell";
import { useWorldLabels } from "@/components/world/useWorldLabels";
import { categoryIcon, categoryTint, MODULE_ICONS } from "@/components/world/worldStyle";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { catalogOf, statusValues } from "@/lib/world";
import { useWorldEntries, useWorldStore } from "@/stores/worldStore";
import type { CharacterDetailLevel, WorldModule } from "@/types";

/**
 * Paramètres du projet › Objets (ou Faune et flore).
 *
 * Le module est désactivé par défaut : l'activer l'ajoute à la barre de
 * gauche. On choisit ensuite les catégories utilisées (armes, véhicules,
 * magie… ; faune, flore), le niveau de détail des fiches, ses propres
 * types et la liste des statuts. Désactiver le module ne supprime rien.
 */
export function WorldSettingsSection({ projectId, module }: { projectId: string; module: WorldModule }) {
  const { t } = useTranslation("world");
  const switchLabel = useId();
  const { entries, settings, loaded } = useWorldEntries(projectId, module);
  const labels = useWorldLabels(module, settings.customTypes);
  const setEnabled = useWorldStore((state) => state.setEnabled);
  const setCategories = useWorldStore((state) => state.setCategories);
  const setDetailLevel = useWorldStore((state) => state.setDetailLevel);

  const [busy, setBusy] = useState<"enabled" | "categories" | "level" | null>(null);
  // Erreurs en notification : la page ne bouge pas.
  const setError = (message: string | null) => {
    if (message) notifyError(message, "settings:world");
  };
  const ModuleIcon = MODULE_ICONS[module];

  async function run(kind: "enabled" | "categories" | "level", action: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  function toggleCategory(category: string) {
    const next = settings.categories.includes(category)
      ? settings.categories.filter((item) => item !== category)
      : [...settings.categories, category];
    if (next.length === 0) return;
    void run("categories", () => setCategories(projectId, module, next));
  }

  const locked = !loaded || busy !== null;

  return (
    <div className="space-y-8">
      {/* Activation */}
      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{labels.text("settings.title")}</CardTitle>
          <CardDescription>{labels.text("settings.description")}</CardDescription>
        </CardHeader>
        <CardContent className={`${cardContentClass} space-y-3`}>
          <div className="flex items-start gap-4 rounded-lg border p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ModuleIcon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p id={switchLabel} className="text-sm font-medium">
                {labels.text("settings.enable")}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                {settings.enabled ? labels.text("settings.enabledHint") : labels.text("settings.disabledHint")}
              </p>
              {!settings.enabled && entries.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">{labels.text("settings.kept", { count: entries.length })}</p>
              )}
            </div>
            {busy === "enabled" && <Loader2 className="mt-1 size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
            <button
              type="button"
              role="switch"
              aria-checked={settings.enabled}
              aria-labelledby={switchLabel}
              disabled={locked}
              onClick={() => void run("enabled", () => setEnabled(projectId, module, !settings.enabled))}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50",
                settings.enabled ? "bg-primary" : "bg-input",
              )}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 rounded-full bg-background shadow transition-transform",
                  settings.enabled ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {settings.enabled && (
        <>
          {/* Catégories */}
          <Card className={cardClass}>
            <CardHeader className={cardHeaderClass}>
              <CardTitle>{t("settings.categories.title")}</CardTitle>
              <CardDescription>{labels.text("settings.categories")}</CardDescription>
            </CardHeader>
            <CardContent className={cardContentClass}>
              <div className="grid gap-2 sm:grid-cols-2">
                {catalogOf(module).categories.map((category) => {
                  const Icon = categoryIcon(module, category);
                  const checked = settings.categories.includes(category);
                  const last = checked && settings.categories.length === 1;

                  return (
                    <label
                      key={category}
                      title={last ? t("settings.categories.lastOne") : undefined}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                        checked ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50",
                        (locked || last) && "cursor-not-allowed",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 accent-primary"
                        checked={checked}
                        disabled={locked || last}
                        onChange={() => toggleCategory(category)}
                      />
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md" style={categoryTint(module, category)}>
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{labels.category(category)}</span>
                        <span className="block text-xs leading-5 text-muted-foreground">{labels.categoryDescription(category)}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Niveau de détail */}
          <Card className={cardClass}>
            <CardHeader className={cardHeaderClass}>
              <CardTitle>{t("settings.level.title")}</CardTitle>
              <CardDescription>{t("settings.level.description")}</CardDescription>
            </CardHeader>
            <CardContent className={cardContentClass}>
              <LevelPicker
                namespace="world"
                prefix={`${module}.`}
                value={settings.detailLevel}
                onChange={(level: CharacterDetailLevel) => void run("level", () => setDetailLevel(projectId, module, level))}
                disabled={locked}
              />
            </CardContent>
          </Card>

          <CustomTypesCard projectId={projectId} module={module} />
          <StatusListCard projectId={projectId} module={module} />
        </>
      )}
    </div>
  );
}

/** Types ajoutés par l'auteur, chacun dans une catégorie. */
function CustomTypesCard({ projectId, module }: { projectId: string; module: WorldModule }) {
  const { t } = useTranslation("world");
  const { settings, loaded } = useWorldEntries(projectId, module);
  const labels = useWorldLabels(module, settings.customTypes);
  const setCustomTypes = useWorldStore((state) => state.setCustomTypes);
  const categories = catalogOf(module).categories;

  const [name, setName] = useState("");
  const [category, setCategory] = useState(settings.categories[0] ?? categories[0]);
  const [busy, setBusy] = useState(false);
  // Erreurs en notification : la page ne bouge pas.
  const setError = (message: string | null) => {
    if (message) notifyError(message, "settings:world");
  };
  const types = settings.customTypes;

  async function save(next: Array<{ name: string; category: string; id?: string }>) {
    setBusy(true);
    setError(null);
    try {
      await setCustomTypes(projectId, module, next);
      return true;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const value = name.trim();
    if (value && (await save([...types, { name: value, category }]))) setName("");
  }

  const locked = !loaded || busy;

  return (
    <Card className={cardClass}>
      <CardHeader className={cardHeaderClass}>
        <CardTitle>{t("settings.types.title")}</CardTitle>
        <CardDescription>{labels.text("settings.types")}</CardDescription>
      </CardHeader>
      <CardContent className={`${cardContentClass} space-y-5`}>
        {types.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("settings.types.empty")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {types.map((item) => {
              const Icon = categoryIcon(module, item.category);
              return (
                <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md" style={categoryTint(module, item.category)}>
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{labels.category(item.category)}</span>
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
            placeholder={labels.text("settings.typePlaceholder")}
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
            onChange={(e) => setCategory(e.target.value)}
            className={cn(fieldClass, "h-9")}
          >
            {categories.map((item) => (
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

      </CardContent>
    </Card>
  );
}

/** Liste des statuts : valeurs retirables, champ pour en ajouter. */
function StatusListCard({ projectId, module }: { projectId: string; module: WorldModule }) {
  const { t } = useTranslation("world");
  const { settings, loaded } = useWorldEntries(projectId, module);
  const labels = useWorldLabels(module, settings.customTypes);
  const setStatusList = useWorldStore((state) => state.setStatusList);

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // Erreurs en notification : la page ne bouge pas.
  const setError = (message: string | null) => {
    if (message) notifyError(message, "settings:world");
  };

  const values = statusValues(module, settings.lists);
  const customized = settings.lists.status !== undefined;

  async function save(next: string[] | null) {
    setBusy(true);
    setError(null);
    try {
      await setStatusList(projectId, module, next);
      return true;
    } catch (e) {
      setError(errorText(e));
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
            <span key={value} className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs font-medium">
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
      </CardContent>
    </Card>
  );
}
