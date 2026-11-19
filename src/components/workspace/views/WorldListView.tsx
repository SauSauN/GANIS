import { FilterResults } from "@/components/common/FilterResults";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { portraitFrameKey } from "@/lib/imageFrame";
import { useImageFrame } from "@/stores/imageFrameStore";
import { ChevronDown, ChevronRight, LayoutGrid, ListTree, Loader2, Plus, Search, Settings2, UserRound } from "lucide-react";
import { ProfileCard } from "@/components/common/ProfileCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { PageShell, fieldClass } from "@/components/workspace/views/PageShell";
import { WorldThumb, WorldTypeBadge } from "@/components/world/WorldVisuals";
import { useWorldLabels } from "@/components/world/useWorldLabels";
import { MODULE_ICONS, categoryBackdrop, typeIcon } from "@/components/world/worldStyle";
import type { WorldLabels } from "@/components/world/useWorldLabels";
import { parseList } from "@/lib/characters";
import { cn } from "@/lib/utils";
import { TreeGuides } from "@/components/common/TreeGuides";
import {
  buildWorldTree,
  catalogOf,
  createFeatureOf,
  defaultStatus,
  findType,
  flattenWorldTree,
  hasNature,
  worldSettingsTab,
  worldTabId,
} from "@/lib/world";
import { useWorldEntries, useWorldImageUrl, useWorldStore } from "@/stores/worldStore";
import type { CustomLocationType, SpeciesNature, WorldEntry, WorldModule } from "@/types";

type Layout = "tree" | "grid";

/** Niveaux d'imbrication au maximum (même limite côté application). */
const MAX_NESTING = 15;

/** Affichage choisi pour chaque module, mémorisé sur l'appareil. */
const layoutKey = (module: WorldModule) => `ganis.world.${module}.layout`;

function loadLayout(module: WorldModule): Layout {
  try {
    return localStorage.getItem(layoutKey(module)) === "grid" ? "grid" : "tree";
  } catch {
    return "tree";
  }
}

function saveLayout(module: WorldModule, layout: Layout) {
  try {
    localStorage.setItem(layoutKey(module), layout);
  } catch {
    // Stockage indisponible : choix gardé pour cette session seulement.
  }
}

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
 * Toutes les fiches d'un module du monde (objets, faune et flore,
 * factions, peuples, magie), en arborescence ou en cartes. Recherche par
 * nom ou autre nom, filtre par catégorie et, pour la faune et la flore,
 * par nature (espèces / individus).
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
  const [layout, setLayout] = useState<Layout>(() => loadLayout(module));

  function chooseLayout(next: Layout) {
    setLayout(next);
    saveLayout(module, next);
  }

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

  /** Cartes : les fiches trouvées seulement, par nom. */
  const cards = entries
    .filter(matches)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const byId = new Map(entries.map((entry) => [entry.id, entry]));

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

  const ModuleIcon = MODULE_ICONS[module];

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

        <div className="inline-flex rounded-md border p-0.5" role="group" aria-label={t("list.layout")}>
          {(
            [
              ["tree", ListTree],
              ["grid", LayoutGrid],
            ] as const
          ).map(([item, Icon]) => (
            <button
              key={item}
              type="button"
              aria-pressed={layout === item}
              onClick={() => chooseLayout(item)}
              title={t(`list.${item}`)}
              aria-label={t(`list.${item}`)}
              className={cn(
                "flex size-7 items-center justify-center rounded transition-colors",
                layout === item ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      {filtering && (
        <FilterResults
          count={cards.length}
          onClear={() => {
            setQuery("");
            setCategory(null);
            setNature(null);
          }}
        />
      )}

      {(layout === "tree" ? rows.length : cards.length) === 0 ? (
<div className="rounded-xl border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">
          <ModuleIcon className="mx-auto mb-3 size-8 opacity-40" aria-hidden="true" />
          {entries.length === 0 ? labels.text("list.emptyTitle") : t("list.noResult")}
        </div>
      ) : layout === "grid" ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 min-[112.5rem]:grid-cols-4">
          {cards.map((entry) => (
            <WorldCard
              key={entry.id}
              projectId={projectId}
              module={module}
              entry={entry}
              parent={entry.parentId ? byId.get(entry.parentId) : undefined}
              customTypes={customTypes}
              labels={labels}
              onOpen={() => onOpenFeature(worldTabId(module, entry.id))}
            />
          ))}
        </ul>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card" role="tree">
          {rows.map(({ entry, depth, children }) => {
            const open = !collapsed.has(entry.id);
            const dimmed = visible !== null && !matches(entry);

            return (
              <li
                key={entry.id}
                role="treeitem"
                aria-level={depth + 1}
                aria-expanded={children.length > 0 ? open : undefined}
                className={cn("group relative flex items-center gap-2 px-3 py-2 hover:bg-muted/40", dimmed && "opacity-50")}
                style={{ paddingLeft: `${0.75 + depth * 1.5}rem` }}
              >
                {/* Lignes verticales vers les fiches qui contiennent celle-ci (sous la flèche de chacune). */}
                <TreeGuides depth={depth} step={1.5} offset={1.5} subtle />
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
                    <span className="flex items-center gap-1.5 truncate text-sm font-medium group-hover:text-primary">
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

                {(!hasNature(module) || entry.nature === "species") && depth + 1 < MAX_NESTING && (
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

// ----------------------------------------------------------------------------
// Carte
// ----------------------------------------------------------------------------

function WorldCard({
  projectId,
  module,
  entry,
  parent,
  customTypes,
  labels,
  onOpen,
}: {
  projectId: string;
  module: WorldModule;
  entry: WorldEntry;
  parent: WorldEntry | undefined;
  customTypes: CustomLocationType[];
  labels: WorldLabels;
  onOpen: () => void;
}) {
  const { t } = useTranslation("world");
  const url = useWorldImageUrl(projectId, module, entry);
  const frame = useImageFrame(projectId, portraitFrameKey(module, entry.id));
  const category = findType(module, entry.type, customTypes)?.category;
  const summary = entry.fields.description?.trim();
  const unusualStatus = entry.status && entry.status !== defaultStatus(module, entry.nature);

  return (
    <ProfileCard
      url={url}
      frame={frame}
      palette={parseList(entry.fields.colorPalette)}
      backdrop={categoryBackdrop(module, category)}
      icon={typeIcon(module, entry.type, category)}
      onOpen={onOpen}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-lg font-semibold group-hover:text-primary">
          <span className="truncate">{entry.name}</span>
          {entry.characterId && (
            <UserRound className="size-4 shrink-0 text-primary" aria-label={t("animalCharacter.badge")} />
          )}
        </span>
        {entry.fields.aliases && (
          <span className="block truncate text-sm text-muted-foreground">{entry.fields.aliases}</span>
        )}
      </span>
      <span className="flex flex-wrap items-center gap-1.5">
        <WorldTypeBadge module={module} type={entry.type} customTypes={customTypes} labels={labels} />
        {entry.nature && (
          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{labels.nature(entry.nature)}</span>
        )}
        {unusualStatus && (
          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{labels.status(entry.status)}</span>
        )}
      </span>
      {parent && <span className="truncate text-xs text-muted-foreground">{t("list.inside", { name: parent.name })}</span>}
      {summary && <span className="line-clamp-3 text-sm leading-6 text-muted-foreground">{summary}</span>}
    </ProfileCard>
  );
}
