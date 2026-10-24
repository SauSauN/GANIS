import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Loader2, Plus, Search, Settings2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { PageShell, fieldClass } from "@/components/workspace/views/PageShell";
import { WorldThumb, WorldTypeBadge } from "@/components/world/WorldVisuals";
import { useWorldLabels } from "@/components/world/useWorldLabels";
import { MODULE_ICONS } from "@/components/world/worldStyle";
import { cn } from "@/lib/utils";
import {
  buildWorldTree,
  catalogOf,
  createFeatureOf,
  findType,
  flattenWorldTree,
  hasNature,
  worldSettingsTab,
  worldTabId,
} from "@/lib/world";
import { useWorldEntries, useWorldStore } from "@/stores/worldStore";
import type { SpeciesNature, WorldEntry, WorldModule } from "@/types";

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Onglet d'un module désactivé (ouvert avant la désactivation) : rien n'est perdu. */
export function WorldDisabledNotice({
  module,
  title,
  onOpenFeature,
}: {
  module: WorldModule;
  title: string;
  onOpenFeature: (featureId: string) => void;
}) {
  const { t } = useTranslation("world");
  const Icon = MODULE_ICONS[module];

  return (
    <PageShell title={title}>
      <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
        <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-7" aria-hidden="true" />
        </span>
        <h2 className="text-lg font-semibold">{t(`${module}.disabled.title`)}</h2>
        <p className="mt-2 mb-6 max-w-md text-sm text-muted-foreground">{t(`${module}.disabled.description`)}</p>
        <Button variant="outline" onClick={() => onOpenFeature(worldSettingsTab(module))}>
          <Settings2 />
          {t("disabled.open")}
        </Button>
      </div>
    </PageShell>
  );
}

/**
 * Tous les objets (ou toute la faune et la flore) du projet, en
 * arborescence. Recherche par nom ou autre nom, filtre par catégorie et,
 * pour la faune et la flore, par nature (espèces / individus).
 */
export function WorldListView({
  projectId,
  module,
  feature,
  onOpenFeature,
}: {
  projectId: string;
  module: WorldModule;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}) {
  const { t } = useTranslation("world");
  const { entries, settings, loaded, error, reload } = useWorldEntries(projectId, module);
  const labels = useWorldLabels(module, settings.customTypes);
  const setCreatePreset = useWorldStore((state) => state.setCreatePreset);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [nature, setNature] = useState<SpeciesNature | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const customTypes = settings.customTypes;
  const categoryOf = (entry: WorldEntry) => findType(module, entry.type, customTypes)?.category;

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const entry of entries) {
      const item = findType(module, entry.type, customTypes)?.category;
      if (item) result[item] = (result[item] ?? 0) + 1;
    }
    return result;
  }, [entries, customTypes, module]);

  const needle = normalize(query.trim());
  const filtering = needle !== "" || category !== null || nature !== null;

  const matches = (entry: WorldEntry) =>
    (!category || categoryOf(entry) === category) &&
    (!nature || entry.nature === nature) &&
    (!needle || normalize(entry.name).includes(needle) || normalize(entry.fields.aliases ?? "").includes(needle));

  /** En filtrant, les parents des fiches trouvées restent visibles (estompés). */
  const visible = useMemo(() => {
    if (!filtering) return null;
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const ids = new Set<string>();
    for (const entry of entries.filter(matches)) {
      let current: WorldEntry | undefined = entry;
      while (current && !ids.has(current.id)) {
        ids.add(current.id);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
    }
    return ids;
    // `matches` découle de ces valeurs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtering, entries, needle, category, nature]);

  const rows = flattenWorldTree(buildWorldTree(entries), filtering ? new Set() : collapsed).filter(
    (node) => !visible || visible.has(node.entry.id),
  );

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addInside(parent: WorldEntry | null) {
    setCreatePreset(module, { parentId: parent?.id ?? null, nature: parent ? "individual" : undefined });
    onOpenFeature(createFeatureOf(module));
  }

  const createButton = (
    <Button onClick={() => addInside(null)}>
      <Plus />
      {labels.text("list.create")}
    </Button>
  );

  if (!loaded) {
    return (
      <PageShell title={feature.label}>
        {error ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
            <Button variant="outline" onClick={() => void reload()}>
              {t("list.retry")}
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("list.loading")}
          </p>
        )}
      </PageShell>
    );
  }

  if (!settings.enabled) {
    return <WorldDisabledNotice module={module} title={feature.label} onOpenFeature={onOpenFeature} />;
  }

  if (entries.length === 0) {
    const Icon = MODULE_ICONS[module];
    return (
      <PageShell title={feature.label} description={feature.description}>
        <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
          <span className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-7" aria-hidden="true" />
          </span>
          <h2 className="text-lg font-semibold">{labels.text("list.emptyTitle")}</h2>
          <p className="mt-2 mb-6 max-w-md text-sm text-muted-foreground">{labels.text("list.emptyDescription")}</p>
          {createButton}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title={feature.label} description={labels.text("list.count", { count: entries.length })} actions={createButton}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("list.search")}
            aria-label={t("list.search")}
            className="pl-8"
          />
        </div>

        <select
          aria-label={t("list.categoryFilter")}
          value={category ?? ""}
          onChange={(e) => setCategory(e.target.value || null)}
          className={cn(fieldClass, "h-9 w-52")}
        >
          <option value="">
            {t("list.allCategories")} ({entries.length})
          </option>
          {catalogOf(module)
            .categories.filter((item) => counts[item])
            .map((item) => (
              <option key={item} value={item}>
                {labels.category(item)} ({counts[item]})
              </option>
            ))}
        </select>

        {hasNature(module) && (
          <select
            aria-label={t("natures.title")}
            value={nature ?? ""}
            onChange={(e) => setNature((e.target.value || null) as SpeciesNature | null)}
            className={cn(fieldClass, "h-9 w-48")}
          >
            <option value="">{t("natures.all")}</option>
            <option value="species">{labels.nature("species")}</option>
            <option value="individual">{labels.nature("individual")}</option>
          </select>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("list.noResult")}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card" role="tree">
          {rows.map(({ entry, depth, children }) => {
            const open = !collapsed.has(entry.id);
            const dimmed = visible !== null && !matches(entry);

            return (
              <li
                key={entry.id}
                role="treeitem"
                aria-level={depth + 1}
                aria-expanded={children.length > 0 ? open : undefined}
                className={cn("group flex items-center gap-2 px-3 py-2", dimmed && "opacity-50")}
                style={{ paddingLeft: `${0.75 + depth * 1.5}rem` }}
              >
                <button
                  type="button"
                  tabIndex={children.length > 0 && !filtering ? 0 : -1}
                  onClick={() => toggle(entry.id)}
                  aria-label={open ? t("list.collapse") : t("list.expand")}
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted",
                    (children.length === 0 || filtering) && "invisible",
                  )}
                >
                  {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => onOpenFeature(worldTabId(module, entry.id))}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <WorldThumb projectId={projectId} module={module} entry={entry} customTypes={customTypes} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {entry.name}
                      {entry.characterId && (
                        <UserRound className="size-3.5 shrink-0 text-primary" aria-label={t("animalCharacter.badge")} />
                      )}
                    </span>
                    {entry.fields.aliases && (
                      <span className="block truncate text-xs text-muted-foreground">{entry.fields.aliases}</span>
                    )}
                  </span>
                  <WorldTypeBadge module={module} type={entry.type} customTypes={customTypes} labels={labels} className="hidden sm:inline-flex" />
                  {entry.nature && (
                    <span className="hidden rounded-full border px-2 py-0.5 text-xs text-muted-foreground md:inline">
                      {labels.nature(entry.nature)}
                    </span>
                  )}
                  <span className="hidden w-24 truncate text-right text-xs text-muted-foreground lg:inline">
                    {labels.status(entry.status)}
                  </span>
                </button>

                {(!hasNature(module) || entry.nature === "species") && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => addInside(entry)}
                    aria-label={labels.text("list.addInside", { name: entry.name })}
                    title={labels.text("list.addInside", { name: entry.name })}
                  >
                    <Plus />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
