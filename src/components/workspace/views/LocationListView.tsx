import { FilterResults } from "@/components/common/FilterResults";
import { SEGMENTED_GROUP, SEGMENTED_ITEM, SEGMENTED_ON } from "@/components/common/segmented";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { portraitFrameKey } from "@/lib/imageFrame";
import { useImageFrame } from "@/stores/imageFrameStore";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  LayoutGrid,
  ListTree,
  Loader2,
  MapPinned,
  Plus,
  Search,
} from "lucide-react";
import { ProfileCard } from "@/components/common/ProfileCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  categoryBackdrop,
  typeIcon,
} from "@/components/locations/locationStyle";
import { LocationThumb, TypeBadge } from "@/components/locations/LocationVisuals";
import { useLocationLabels, type LocationLabels } from "@/components/locations/useLocationLabels";
import { PageShell, fieldClass } from "@/components/workspace/views/PageShell";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import {
  DEFAULT_STATUS,
  LOCATION_CATEGORIES,
  buildLocationTree,
  findType,
  flattenTree,
  locationTabId,
  type LocationCategory,
  type LocationNode,
} from "@/lib/locations";
import { parseList } from "@/lib/characters";
import { cn } from "@/lib/utils";
import { TreeGuides } from "@/components/common/TreeGuides";
import { useLocationImageUrl, useLocationStore, useProjectLocations } from "@/stores/locationStore";
import type { CustomLocationType, Location } from "@/types";

interface LocationListViewProps {
  projectId: string;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

type Layout = "tree" | "grid";

/** Niveaux d'imbrication au maximum (même limite côté application). */
const MAX_NESTING = 15;

/** Affichage choisi, mémorisé sur l'appareil. */
const LAYOUT_KEY = "ganis.locations.layout";

function loadLayout(): Layout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "grid" ? "grid" : "tree";
  } catch {
    return "tree";
  }
}

function saveLayout(layout: Layout) {
  try {
    localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    // Stockage indisponible : le choix vaut pour cette session.
  }
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Tous les lieux du projet : en arborescence (les lieux rangés les uns
 * dans les autres) ou en cartes. Recherche par nom ou autre nom, filtre
 * par catégorie.
 */
export function LocationListView({ projectId, feature, onOpenFeature }: LocationListViewProps) {
  const { t } = useTranslation("locations");
  const { locations, settings, loaded, error, reload } = useProjectLocations(projectId);
  const labels = useLocationLabels(settings.customTypes);
  const setCreatePreset = useLocationStore((state) => state.setCreatePreset);

  const [layout, setLayout] = useState<Layout>(loadLayout);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<LocationCategory | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const customTypes = settings.customTypes;
  const categoryOf = (location: Location) => findType(location.type, customTypes)?.category;

  const counts = useMemo(() => {
    const result: Partial<Record<LocationCategory, number>> = {};
    for (const location of locations) {
      const item = findType(location.type, customTypes)?.category;
      if (item) result[item] = (result[item] ?? 0) + 1;
    }
    return result;
  }, [locations, customTypes]);

  const needle = normalize(query.trim());
  const filtering = needle !== "" || category !== null;

  const matches = (location: Location) =>
    (!category || categoryOf(location) === category) &&
    (!needle ||
      normalize(location.name).includes(needle) ||
      normalize(location.fields.aliases ?? "").includes(needle));

  const matching = locations.filter(matches);

  /** En filtrant, les parents des lieux trouvés restent visibles (estompés). */
  const visibleIds = useMemo(() => {
    if (!filtering) return null;

    const byId = new Map(locations.map((location) => [location.id, location]));
    const ids = new Set<string>();

    for (const location of matching) {
      let current: Location | undefined = location;
      while (current && !ids.has(current.id)) {
        ids.add(current.id);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
    }

    return ids;
    // `matching` découle de `locations`, `needle` et `category`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtering, locations, needle, category]);

  const tree = useMemo(() => buildLocationTree(locations), [locations]);
  const rows = flattenTree(tree, filtering ? new Set() : collapsed).filter(
    (node) => !visibleIds || visibleIds.has(node.location.id),
  );
  const parents = tree.length > 0 ? locations.filter((l) => locations.some((c) => c.parentId === l.id)) : [];

  function chooseLayout(next: Layout) {
    setLayout(next);
    saveLayout(next);
  }

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addInside(parentId: string | null) {
    setCreatePreset({ parentId });
    onOpenFeature("locations.create");
  }

  const createButton = (
    <Button onClick={() => addInside(null)}>
      <Plus />
      {t("list.empty.create")}
    </Button>
  );

  // ---------------------------------------------------------------------------
  // Chargement
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Aucun lieu
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Liste
  // ---------------------------------------------------------------------------

  return (
    <PageShell
      title={feature.label}
      description={t("list.count", { count: locations.length })}
      actions={createButton}
    >
      {/* Barre d'outils */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("list.search")}
            aria-label={t("list.search")}
            className="pl-8"
          />
        </div>

        {/* Filtre par catégorie : menu déroulant (avec le nombre de lieux),
            pour ne pas aligner un bouton par catégorie. */}
        <select
          aria-label={t("list.categoryFilter")}
          value={category ?? ""}
          onChange={(e) => setCategory((e.target.value || null) as LocationCategory | null)}
          className={cn(fieldClass, "h-9 w-56")}
        >
          <option value="">
            {t("list.allCategoriesOption")} ({locations.length})
          </option>
          {LOCATION_CATEGORIES.filter((item) => counts[item]).map((item) => (
            <option key={item} value={item}>
              {labels.category(item)} ({counts[item] ?? 0})
            </option>
          ))}
        </select>

        {layout === "tree" && !filtering && parents.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setCollapsed(collapsed.size > 0 ? new Set() : new Set(parents.map((item) => item.id)))
            }
          >
            {collapsed.size > 0 ? <ChevronsUpDown /> : <ChevronsDownUp />}
            {collapsed.size > 0 ? t("list.expandAll") : t("list.collapseAll")}
          </Button>
        )}

        <div className={cn(SEGMENTED_GROUP, "h-9")} role="group">
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
              className={cn(SEGMENTED_ITEM, "aspect-square justify-center px-0", layout === item && SEGMENTED_ON)}
            >
              <Icon className="size-3.5" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>

      {filtering && (
        <FilterResults
          count={matching.length}
          onClear={() => {
            setQuery("");
            setCategory(null);
          }}
        />
      )}

      {matching.length === 0 ? (
<div className="rounded-xl border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">
          <MapPinned className="mx-auto mb-3 size-8 opacity-40" aria-hidden="true" />
          {locations.length === 0 ? t("list.empty.title") : t("list.noResult")}
        </div>
      ) : layout === "tree" ? (
        <ul className="overflow-hidden rounded-xl border bg-card" role="tree" aria-label={feature.label}>
          {rows.map((node) => (
            <TreeRow
              key={node.location.id}
              node={node}
              projectId={projectId}
              customTypes={customTypes}
              labels={labels}
              dimmed={filtering && !matches(node.location)}
              expanded={filtering || !collapsed.has(node.location.id)}
              onToggle={filtering ? undefined : () => toggle(node.location.id)}
              onOpen={() => onOpenFeature(locationTabId(node.location.id))}
              onAddInside={() => addInside(node.location.id)}
            />
          ))}
        </ul>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 min-[112.5rem]:grid-cols-4">
          {matching.map((location) => (
            <GridCard
              key={location.id}
              location={location}
              parent={locations.find((item) => item.id === location.parentId)}
              projectId={projectId}
              customTypes={customTypes}
              labels={labels}
              onOpen={() => onOpenFeature(locationTabId(location.id))}
            />
          ))}
        </ul>
      )}
    </PageShell>
  );
}

// ----------------------------------------------------------------------------
// Éléments
// ----------------------------------------------------------------------------

function TreeRow({
  node,
  projectId,
  customTypes,
  labels,
  dimmed,
  expanded,
  onToggle,
  onOpen,
  onAddInside,
}: {
  node: LocationNode;
  projectId: string;
  customTypes: CustomLocationType[];
  labels: LocationLabels;
  dimmed: boolean;
  expanded: boolean;
  onToggle?: () => void;
  onOpen: () => void;
  onAddInside: () => void;
}) {
  const { t } = useTranslation("locations");
  const { location, depth, children } = node;
  const hasChildren = children.length > 0;

  return (
    <li
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
      aria-level={depth + 1}
      className={cn("group relative flex items-center gap-2 border-b pr-3 last:border-b-0 hover:bg-muted/40", dimmed && "opacity-55")}
      style={{ paddingLeft: `${0.5 + depth * 1.5}rem` }}
    >
      {/* Lignes verticales vers les lieux qui contiennent celui-ci (sous la flèche de chacun). */}
      <TreeGuides depth={depth} step={1.5} offset={1.25} subtle />
      <button
        type="button"
        tabIndex={hasChildren && onToggle ? 0 : -1}
        disabled={!hasChildren || !onToggle}
        onClick={onToggle}
        aria-label={expanded ? t("list.collapse") : t("list.expand")}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary",
          !hasChildren && "invisible",
        )}
      >
        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
      </button>

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <LocationThumb projectId={projectId} location={location} customTypes={customTypes} size="sm" />
        <span className="min-w-0 truncate text-sm font-medium group-hover:text-primary">{location.name}</span>
        <TypeBadge type={location.type} customTypes={customTypes} labels={labels} className="shrink-0" />
        {location.status !== DEFAULT_STATUS && (
          <span className="hidden shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground md:inline">
            {labels.status(location.status)}
          </span>
        )}
        {hasChildren && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{children.length}</span>
        )}
      </button>

      <button
        type="button"
        disabled={depth + 1 >= MAX_NESTING}
        onClick={onAddInside}
        title={t("list.addInside", { name: location.name })}
        aria-label={t("list.addInside", { name: location.name })}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-secondary hover:text-foreground focus-visible:opacity-100 disabled:invisible"
      >
        <Plus className="size-4" />
      </button>
    </li>
  );
}

function GridCard({
  location,
  parent,
  projectId,
  customTypes,
  labels,
  onOpen,
}: {
  location: Location;
  parent: Location | undefined;
  projectId: string;
  customTypes: CustomLocationType[];
  labels: LocationLabels;
  onOpen: () => void;
}) {
  const { t } = useTranslation("locations");
  const url = useLocationImageUrl(projectId, location);
  const frame = useImageFrame(projectId, portraitFrameKey("location", location.id));
  const category = findType(location.type, customTypes)?.category;
  const Icon = typeIcon(location.type, category);
  const summary = location.fields.description?.trim();

  return (
    <ProfileCard
      url={url}
      frame={frame}
      palette={parseList(location.fields.colorPalette)}
      backdrop={categoryBackdrop(category)}
      icon={Icon}
      onOpen={onOpen}
    >
      <span className="truncate text-lg font-semibold group-hover:text-primary">{location.name}</span>
      <span className="flex flex-wrap items-center gap-1.5">
        <TypeBadge type={location.type} customTypes={customTypes} labels={labels} />
        {parent && (
          <span className="truncate text-xs text-muted-foreground">{t("list.inside", { name: parent.name })}</span>
        )}
      </span>
      {summary && <span className="line-clamp-3 text-sm leading-6 text-muted-foreground">{summary}</span>}
    </ProfileCard>
  );
}