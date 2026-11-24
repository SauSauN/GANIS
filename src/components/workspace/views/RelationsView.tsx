import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CharactersEmptyState } from "@/components/characters/CharactersEmptyState";
import { SEGMENTED_GROUP, SEGMENTED_ITEM, SEGMENTED_ON } from "@/components/common/segmented";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftRight,
  ArrowRight,
  ExternalLink,
  Grid3x3,
  List,
  Maximize2,
  Minimize2,
  Network,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { LoadingDots } from "@/components/common/LoadingDots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CharacterAvatar } from "@/components/characters/CharacterAvatar";
import { useListLabel } from "@/components/characters/fields/SpecialFields";
import { FamilyTree } from "@/components/relations/FamilyTree";
import { RelationDialog } from "@/components/relations/RelationDialog";
import { useRelationColors } from "@/components/relations/useRelationColors";
import { RelationGraph, type GraphGroup } from "@/components/relations/RelationGraph";
import { useStory } from "@/components/relations/useStory";
import { fieldClass } from "@/components/workspace/views/PageShell";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { characterTabId, fullName, listValues } from "@/lib/characters";
import {
  GRAPH_LAYOUTS,
  RELATION_TYPES,
  circleLayout,
  circularOrder,
  egoLayout,
  emptyRelation,
  forceLayout,
  groupLayout,
  inputFromRelation,
  isActiveAt,
  otherEnd,
  relationsOf,
  type GraphLayout,
  type Positions,
} from "@/lib/relations";
import { cn } from "@/lib/utils";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectRelations } from "@/stores/relationStore";
import type { Character, Relation, RelationInput, RelationType } from "@/types";

type ViewMode = "graph" | "matrix" | "list";

/** Réglages d'affichage mémorisés sur l'appareil. */
const PREFS_KEY = "ganis.relations.view";

interface ViewPrefs {
  mode: ViewMode;
  layout: GraphLayout;
  showLabels: boolean;
  showIsolated: boolean;
}

/** Astuce du graphe fermée par l'utilisateur. */
const HINT_KEY = "ganis.relations.hintDismissed";

function hintWasDismissed(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

const DEFAULT_PREFS: ViewPrefs = { mode: "graph", layout: "force", showLabels: true, showIsolated: true };

function loadPrefs(): ViewPrefs {
  try {
    const prefs: ViewPrefs = { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
    // Disposition disparue (l'ancienne « libre ») : retour au réseau.
    return GRAPH_LAYOUTS.includes(prefs.layout) ? prefs : { ...prefs, layout: DEFAULT_PREFS.layout };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: ViewPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Stockage indisponible : réglages pour cette session seulement.
  }
}

interface RelationsViewProps {
  projectId: string;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

/** Dialogue ouvert : création (valeurs de départ) ou modification. */
type DialogState = { relationId: string | null; initial: RelationInput } | null;

/**
 * Relations entre personnages : graphe (cinq dispositions), matrice ou
 * liste ; filtres par type, recherche, moment de l'histoire.
 */
export function RelationsView({ projectId, feature, onOpenFeature }: RelationsViewProps) {
  const { t } = useTranslation(["relations", "characters"]);
  const listLabel = useListLabel();
  const { characters, lists, loaded: charactersLoaded } = useProjectCharacters(projectId);
  const { relations, loaded, error, reload } = useProjectRelations(projectId);
  const story = useStory(projectId);

  const [prefs, setPrefs] = useState<ViewPrefs>(loadPrefs);
  const [hiddenTypes, setHiddenTypes] = useState<Set<RelationType>>(() => new Set());
  const [query, setQuery] = useState("");
  const [moment, setMoment] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [centerId, setCenterId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(hintWasDismissed);

  // Échap quitte le plein écran (sauf si un panneau est ouvert).
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !dialog && !filtersOpen) setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen, dialog, filtersOpen]);

  const updatePrefs = (patch: Partial<ViewPrefs>) =>
    setPrefs((current) => {
      const next = { ...current, ...patch };
      savePrefs(next);
      return next;
    });

  // Moment de l'histoire : revient à « toute l'histoire » si l'élément disparaît.
  useEffect(() => {
    if (moment !== null && moment >= story.order.length) setMoment(null);
  }, [moment, story.order.length]);

  const nameOf = useCallback(
    (id: string) => {
      const character = characters.find((c) => c.id === id);
      return character ? fullName(character) : "?";
    },
    [characters],
  );

  const labelOf = useCallback(
    (relation: Relation) => relation.label || t(`types.${relation.type}`),
    [t],
  );

  // ---------------------------------------------------------------------------
  // Filtres
  // ---------------------------------------------------------------------------

  const visibleRelations = useMemo(
    () =>
      relations.filter(
        (r) => !hiddenTypes.has(r.type) && isActiveAt(r, moment, story.positionOf),
      ),
    [relations, hiddenTypes, moment, story.positionOf],
  );

  const linkedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of visibleRelations) {
      ids.add(r.sourceId);
      ids.add(r.targetId);
    }
    return ids;
  }, [visibleRelations]);

  const visibleCharacters = useMemo(
    () => (prefs.showIsolated ? characters : characters.filter((c) => linkedIds.has(c.id))),
    [characters, linkedIds, prefs.showIsolated],
  );

  const highlightIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return new Set<string>();
    return new Set(characters.filter((c) => fullName(c).toLowerCase().includes(q)).map((c) => c.id));
  }, [characters, query]);

  /** Personnage choisi : seuls lui et ses proches restent nets. */
  const dimmedIds = useMemo(() => {
    const focus = selectedId;
    if (!focus) return new Set<string>();

    const keep = new Set([focus]);
    for (const r of visibleRelations) {
      if (r.sourceId === focus) keep.add(r.targetId);
      if (r.targetId === focus) keep.add(r.sourceId);
    }
    return new Set(visibleCharacters.filter((c) => !keep.has(c.id)).map((c) => c.id));
  }, [selectedId, visibleRelations, visibleCharacters]);

  // ---------------------------------------------------------------------------
  // Disposition
  // ---------------------------------------------------------------------------

  const effectiveCenter = centerId ?? selectedId ?? visibleCharacters[0]?.id ?? null;

  const { positions, groups } = useMemo((): { positions: Positions; groups?: GraphGroup[] } => {
    const ids = visibleCharacters.map((c) => c.id);
    const links = visibleRelations.map((r) => ({ source: r.sourceId, target: r.targetId, weight: r.intensity }));

    switch (prefs.layout) {
      case "circle":
        return { positions: circleLayout(circularOrder(ids, links)) };

      case "groups": {
        const order = listValues(lists, "role");
        const roles = [...new Set(visibleCharacters.map((c) => c.role))].sort(
          (a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99),
        );
        const layout = groupLayout(
          roles.map((role) => ({ key: role, ids: visibleCharacters.filter((c) => c.role === role).map((c) => c.id) })),
        );
        return {
          positions: layout.positions,
          groups: roles.map((role) => ({
            key: role,
            label: listLabel("role", role),
            center: layout.centers[role],
            radius: layout.centers[role].radius,
          })),
        };
      }

      case "ego":
        return { positions: effectiveCenter ? egoLayout(effectiveCenter, ids, links).positions : circleLayout(ids) };

      case "tree":
        // Dessiné à part (FamilyTree) : rien à placer ici.
        return { positions: {} };

      default:
        return { positions: forceLayout(ids, links) };
    }
  }, [prefs.layout, visibleCharacters, visibleRelations, lists, listLabel, effectiveCenter]);

  /**
   * Arbre : le personnage choisi, sinon le premier qui a un lien familial
   * précis (pour ne pas ouvrir sur un arbre vide).
   */
  const treeRoot = useMemo(() => {
    const chosen = centerId ?? selectedId;
    if (chosen && characters.some((c) => c.id === chosen)) return chosen;
    const withFamily = new Set(
      relations.filter((r) => r.type === "family" && r.familyLink).flatMap((r) => [r.sourceId, r.targetId]),
    );
    return characters.find((c) => withFamily.has(c.id))?.id ?? characters[0]?.id ?? null;
  }, [centerId, selectedId, characters, relations]);

  // ---------------------------------------------------------------------------
  // Dialogue
  // ---------------------------------------------------------------------------

  const openCreate = (sourceId = "", targetId = "") =>
    setDialog({ relationId: null, initial: emptyRelation(sourceId, targetId) });

  const openEdit = (relationId: string) => {
    const relation = relations.find((r) => r.id === relationId);
    if (relation) setDialog({ relationId, initial: inputFromRelation(relation) });
  };

  // ---------------------------------------------------------------------------
  // Affichage
  // ---------------------------------------------------------------------------

  const ready = loaded && charactersLoaded;
  const selected = selectedId ? characters.find((c) => c.id === selectedId) : undefined;
  const usedTypes = RELATION_TYPES.filter((type) => relations.some((r) => r.type === type));

  const activeFilters =
    hiddenTypes.size + (moment !== null ? 1 : 0) + (query.trim() ? 1 : 0) + (prefs.showIsolated ? 0 : 1);

  return (
    <main
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden bg-background",
        // Plein écran : la vue recouvre toute la fenêtre (barres comprises).
        fullscreen && "fixed inset-0 z-40",
      )}
    >
      {/* En-tête : une seule ligne */}
      {/* Même hauteur que la barre de « Lecture de l'histoire » (py-2, contrôles de 32 px). */}
      <header className="flex shrink-0 items-center gap-3 border-b bg-card/60 px-3 py-2">
        <h1 className="sr-only">{feature.label}</h1>
        {/* Graphe / Matrice / Liste tout à gauche, puis la disposition du graphe. */}
        {ready && characters.length >= 2 && <ModeSwitch mode={prefs.mode} onChange={(mode) => updatePrefs({ mode })} />}

        {/* Disposition du graphe, dans la barre (et non posée sur le graphe) : même hauteur que les autres barres. */}
        {ready && characters.length >= 2 && prefs.mode === "graph" && (
          <div className="flex items-center gap-2">
            <select
              aria-label={t("view.layoutLabel")}
              title={t(`view.layoutHints.${prefs.layout}`)}
              value={prefs.layout}
              onChange={(e) => updatePrefs({ layout: e.target.value as GraphLayout })}
              className={cn(fieldClass, "h-8 w-auto")}
            >
              {GRAPH_LAYOUTS.map((layout) => (
                <option key={layout} value={layout} title={t(`view.layoutHints.${layout}`)}>
                  {t(`view.layouts.${layout}`)}
                </option>
              ))}
            </select>
            {(prefs.layout === "ego" || prefs.layout === "tree") && (
              <select
                aria-label={prefs.layout === "tree" ? t("view.treeOf") : t("view.center")}
                value={(prefs.layout === "tree" ? treeRoot : effectiveCenter) ?? ""}
                onChange={(e) => setCenterId(e.target.value || null)}
                className={cn(fieldClass, "h-8 w-48")}
              >
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>{fullName(c)}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Le reste à droite. */}
        <div className="ml-auto" />

        {ready && characters.length >= 2 && (
          <>
            <div className="relative">
              <Button
                variant={filtersOpen || activeFilters > 0 ? "secondary" : "ghost"}
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <SlidersHorizontal />
                {t("view.filters")}
                {activeFilters > 0 && (
                  <span className="ml-0.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
                    {activeFilters}
                  </span>
                )}
              </Button>

              {filtersOpen && (
                <FiltersPanel
                  onClose={() => setFiltersOpen(false)}
                  query={query}
                  onQuery={setQuery}
                  moment={moment}
                  onMoment={setMoment}
                  story={story}
                  usedTypes={usedTypes}
                  hiddenTypes={hiddenTypes}
                  onToggleType={(type) =>
                    setHiddenTypes((current) => {
                      const next = new Set(current);
                      if (next.has(type)) next.delete(type);
                      else next.add(type);
                      return next;
                    })
                  }
                  showLabels={prefs.showLabels}
                  onShowLabels={(showLabels) => updatePrefs({ showLabels })}
                  showIsolated={prefs.showIsolated}
                  onShowIsolated={(showIsolated) => updatePrefs({ showIsolated })}
                  onReset={() => {
                    setHiddenTypes(new Set());
                    setMoment(null);
                    setQuery("");
                    updatePrefs({ showIsolated: true });
                  }}
                />
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setFullscreen((value) => !value)}
              title={fullscreen ? t("view.exitFullscreen") : t("view.fullscreen")}
              aria-label={fullscreen ? t("view.exitFullscreen") : t("view.fullscreen")}
            >
              {fullscreen ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </>
        )}

        <Button onClick={() => openCreate(selectedId ?? "")} disabled={characters.length < 2}>
          <Plus />
          {t("view.newRelation")}
        </Button>
      </header>

      {!ready ? (
        <div className="p-6">
          {error ? (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={() => void reload()}>{t("view.retry")}</Button>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoadingDots className="size-4" />
              {t("view.loading")}
            </p>
          )}
        </div>
      ) : characters.length < 2 ? (
        // Même écran vide que la liste des personnages (cadre en tirets, bouton pour en créer).
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="mx-auto w-full max-w-5xl px-6 py-8 lg:px-10">
            <CharactersEmptyState message={t("view.noCharacters")} onCreate={() => onOpenFeature("characters.create")} />
          </div>
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          {prefs.mode === "graph" && prefs.layout === "tree" && treeRoot && (
            <FamilyTree
              projectId={projectId}
              characters={characters}
              relations={visibleRelations}
              rootId={treeRoot}
              fitKey={`${fullscreen}`}
              onRoot={setCenterId}
              onOpenCharacter={(id) => onOpenFeature(characterTabId(id))}
              onEditRelation={openEdit}
              onCreate={(initial) => setDialog({ relationId: null, initial })}
            />
          )}

          {prefs.mode === "graph" && prefs.layout !== "tree" && (
            <RelationGraph
              projectId={projectId}
              characters={visibleCharacters}
              relations={visibleRelations}
              positions={positions}
              groups={groups}
              layoutKey={`${prefs.layout}|${effectiveCenter}|${moment}|${prefs.showIsolated}|${[...hiddenTypes].join()}|${fullscreen}`}
              selectedId={selectedId}
              highlightIds={highlightIds}
              dimmedIds={dimmedIds}
              showLabels={prefs.showLabels}
              labelOf={labelOf}
              onSelect={setSelectedId}
              onOpenCharacter={(id) => onOpenFeature(characterTabId(id))}
              onEditRelation={openEdit}
              onConnect={(source, target) => openCreate(source, target)}
            />
          )}

          {prefs.mode === "graph" && (
            <>
              {prefs.layout !== "tree" && relations.length === 0 && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="pointer-events-auto max-w-sm rounded-2xl border bg-card/95 px-8 py-7 text-center shadow-lg">
                    <p className="text-lg font-semibold">{t("view.noRelations")}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{t("view.noRelationsHint")}</p>
                    <Button className="mt-5" size="lg" onClick={() => openCreate()}>
                      <Plus />
                      {t("view.newRelation")}
                    </Button>
                  </div>
                </div>
              )}

              {prefs.layout !== "tree" && relations.length > 0 && !selected && !hintDismissed && (
                <div className="absolute bottom-4 left-1/2 z-10 flex max-w-lg -translate-x-1/2 items-center gap-2 rounded-full border bg-card/95 py-1.5 pr-1.5 pl-4 text-sm text-muted-foreground shadow-sm">
                  <span>{t("view.dragHint")}</span>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={t("view.details.close")}
                    onClick={() => {
                      setHintDismissed(true);
                      try {
                        localStorage.setItem(HINT_KEY, "1");
                      } catch {
                        // Pas de stockage : l'astuce reviendra.
                      }
                    }}
                  >
                    <X />
                  </Button>
                </div>
              )}

              {prefs.layout !== "tree" && selected && (
                <DetailsPanel
                  projectId={projectId}
                  character={selected}
                  relations={relationsOf(visibleRelations, selected.id)}
                  nameOf={nameOf}
                  labelOf={labelOf}
                  roleLabel={listLabel("role", selected.role)}
                  onClose={() => setSelectedId(null)}
                  onOpen={() => onOpenFeature(characterTabId(selected.id))}
                  onEdit={openEdit}
                  onAdd={() => openCreate(selected.id)}
                />
              )}
            </>
          )}

          {prefs.mode === "matrix" && (
            <RelationMatrix
              projectId={projectId}
              characters={characters}
              relations={visibleRelations}
              highlightIds={highlightIds}
              labelOf={labelOf}
              onEdit={openEdit}
              onCreate={openCreate}
            />
          )}

          {prefs.mode === "list" && (
            <RelationList
              projectId={projectId}
              characters={characters}
              relations={visibleRelations.filter(
                (r) => highlightIds.size === 0 || highlightIds.has(r.sourceId) || highlightIds.has(r.targetId),
              )}
              labelOf={labelOf}
              periodOf={(r) => {
                const since = r.sinceNode ? story.order.find((n) => n.id === r.sinceNode) : undefined;
                const until = r.untilNode ? story.order.find((n) => n.id === r.untilNode) : undefined;
                return since || until
                  ? `${since ? story.labelOf(since) : t("form.start")} → ${until ? story.labelOf(until) : t("form.end")}`
                  : "—";
              }}
              onEdit={openEdit}
            />
          )}
        </div>
      )}

      <RelationDialog
        projectId={projectId}
        open={dialog !== null}
        relationId={dialog?.relationId ?? null}
        initial={dialog?.initial ?? null}
        onClose={() => setDialog(null)}
        fullscreen={fullscreen}
      />
    </main>
  );
}

// ----------------------------------------------------------------------------
// Panneau des filtres
// ----------------------------------------------------------------------------

function FiltersPanel({
  onClose,
  query,
  onQuery,
  moment,
  onMoment,
  story,
  usedTypes,
  hiddenTypes,
  onToggleType,
  showLabels,
  onShowLabels,
  showIsolated,
  onShowIsolated,
  onReset,
}: {
  onClose: () => void;
  query: string;
  onQuery: (value: string) => void;
  moment: number | null;
  onMoment: (value: number | null) => void;
  story: ReturnType<typeof useStory>;
  usedTypes: RelationType[];
  hiddenTypes: Set<RelationType>;
  onToggleType: (type: RelationType) => void;
  showLabels: boolean;
  onShowLabels: (value: boolean) => void;
  showIsolated: boolean;
  onShowIsolated: (value: boolean) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation("relations");
  const relationColors = useRelationColors();
  const ref = useRef<HTMLDivElement>(null);

  // Fermé par un clic à l'extérieur ou par Échap.
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 z-30 mt-2 w-[22rem] space-y-5 rounded-xl border bg-card p-5 shadow-xl"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t("view.search")}
          aria-label={t("view.search")}
          className="h-10 pl-9"
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("view.period")}</p>
        <select
          aria-label={t("view.period")}
          value={moment ?? ""}
          disabled={story.order.length === 0}
          onChange={(e) => onMoment(e.target.value === "" ? null : Number(e.target.value))}
          className={cn(fieldClass, "h-10")}
        >
          <option value="">{t("view.wholeStory")}</option>
          {story.order.map((node, index) => (
            <option key={node.id} value={index}>
              {"\u00a0\u00a0".repeat(node.level)}
              {story.labelOf(node)}
            </option>
          ))}
        </select>
      </div>

      {usedTypes.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("view.types")}</p>
          <div className="flex flex-wrap gap-1.5">
            {usedTypes.map((type) => {
              const hidden = hiddenTypes.has(type);
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={!hidden}
                  onClick={() => onToggleType(type)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-opacity",
                    hidden ? "opacity-40 line-through" : "bg-background",
                  )}
                >
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: relationColors[type] }} />
                  {t(`types.${type}`)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2 border-t pt-4">
        <Toggle checked={showLabels} onChange={onShowLabels}>
          {t("view.showLabels")}
        </Toggle>
        <Toggle checked={showIsolated} onChange={onShowIsolated}>
          {t("view.showIsolated")}
        </Toggle>
      </div>

      <Button variant="ghost" size="sm" onClick={onReset}>
        <RotateCcw />
        {t("view.resetFilters")}
      </Button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Petits composants de la barre d'outils
// ----------------------------------------------------------------------------

function ModeSwitch({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  const { t } = useTranslation("relations");
  const icons = { graph: Network, matrix: Grid3x3, list: List };

  return (
    <div role="radiogroup" aria-label="Affichage" className={SEGMENTED_GROUP}>
      {(["graph", "matrix", "list"] as const).map((value) => {
        const Icon = icons[value];
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => onChange(value)}
            className={cn(SEGMENTED_ITEM, mode === value && SEGMENTED_ON)}
          >
            <Icon className="size-4" />
            {t(`view.views.${value}`)}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-primary" />
      {children}
    </label>
  );
}

// ----------------------------------------------------------------------------
// Panneau du personnage choisi
// ----------------------------------------------------------------------------

function DetailsPanel({
  projectId,
  character,
  relations,
  nameOf,
  labelOf,
  roleLabel,
  onClose,
  onOpen,
  onEdit,
  onAdd,
}: {
  projectId: string;
  character: Character;
  relations: Relation[];
  nameOf: (id: string) => string;
  labelOf: (relation: Relation) => string;
  roleLabel: string;
  onClose: () => void;
  onOpen: () => void;
  onEdit: (id: string) => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation("relations");
  const relationColors = useRelationColors();

  return (
    <aside className="absolute top-4 right-4 bottom-4 z-10 flex w-80 flex-col rounded-2xl border bg-card shadow-xl">
      <div className="flex items-start gap-3 border-b p-4">
        <CharacterAvatar projectId={projectId} character={character} size="lg" />
        <div className="min-w-0 flex-1 pt-1">
          <p className="truncate text-lg font-semibold">{fullName(character)}</p>
          <p className="text-sm text-muted-foreground">{roleLabel}</p>
        </div>
        <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label={t("view.details.close")}>
          <X />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <p className="px-2 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("view.details.relations")} ({relations.length})
        </p>

        {relations.length === 0 ? (
          <p className="px-2 py-2 text-sm text-muted-foreground">{t("view.details.none")}</p>
        ) : (
          <ul>
            {relations.map((relation) => {
              const outgoing = relation.sourceId === character.id;
              return (
                <li key={relation.id}>
                  <button
                    type="button"
                    onClick={() => onEdit(relation.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted"
                  >
                    <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: relationColors[relation.type] }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{nameOf(otherEnd(relation, character.id))}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {relation.directed ? (outgoing ? "→ " : "← ") : "↔ "}
                        {labelOf(relation)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex gap-2 border-t p-3">
        <Button size="lg" variant="outline" className="flex-1" onClick={onOpen}>
          <ExternalLink />
          {t("view.details.openSheet")}
        </Button>
        <Button size="lg" className="flex-1" onClick={onAdd}>
          <Plus />
          {t("view.newRelation")}
        </Button>
      </div>
    </aside>
  );
}

// ----------------------------------------------------------------------------
// Matrice
// ----------------------------------------------------------------------------

function RelationMatrix({
  projectId,
  characters,
  relations,
  highlightIds,
  labelOf,
  onEdit,
  onCreate,
}: {
  projectId: string;
  characters: Character[];
  relations: Relation[];
  highlightIds: Set<string>;
  labelOf: (relation: Relation) => string;
  onEdit: (id: string) => void;
  onCreate: (sourceId: string, targetId: string) => void;
}) {
  const { t } = useTranslation("relations");
  const relationColors = useRelationColors();

  const between = (a: string, b: string) =>
    relations.filter((r) => (r.sourceId === a && r.targetId === b) || (r.sourceId === b && r.targetId === a));

  return (
    <div className="absolute inset-0 overflow-auto px-6 pt-2 pb-8 lg:px-10 [scrollbar-gutter:stable]">
      <p className="mb-3 text-xs text-muted-foreground">{t("matrix.hint")}</p>

      <table className="border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky top-0 left-0 z-20 bg-background" />
            {characters.map((c) => (
              <th key={c.id} className="sticky top-0 z-10 h-36 min-w-12 bg-background align-bottom">
                <div className="flex flex-col items-center gap-1 pb-2">
                  <span
                    className={cn(
                      "max-h-24 truncate text-xs font-medium [writing-mode:vertical-rl] rotate-180",
                      highlightIds.has(c.id) && "text-amber-600",
                    )}
                  >
                    {fullName(c)}
                  </span>
                  <CharacterAvatar projectId={projectId} character={c} size="sm" />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {characters.map((row) => (
            <tr key={row.id}>
              <th className="sticky left-0 z-10 bg-background pr-3 text-left">
                <span className={cn("flex items-center gap-2 py-1 whitespace-nowrap", highlightIds.has(row.id) && "text-amber-600")}>
                  <CharacterAvatar projectId={projectId} character={row} size="sm" />
                  <span className="max-w-40 truncate text-xs font-medium">{fullName(row)}</span>
                </span>
              </th>
              {characters.map((col) => {
                if (row.id === col.id) {
                  return <td key={col.id} className="size-12 border bg-muted/50" />;
                }

                const items = between(row.id, col.id);

                return (
                  <td key={col.id} className="size-12 border p-0 text-center">
                    <button
                      type="button"
                      title={items.map(labelOf).join(", ") || undefined}
                      onClick={() => (items.length > 0 ? onEdit(items[0].id) : onCreate(row.id, col.id))}
                      className="group flex size-12 flex-wrap items-center justify-center gap-0.5 p-1 hover:bg-muted"
                    >
                      {items.length === 0 ? (
                        <Plus className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      ) : (
                        items.slice(0, 4).map((r) => (
                          <span
                            key={r.id}
                            className="rounded-full"
                            style={{
                              backgroundColor: relationColors[r.type],
                              width: 6 + r.intensity * 2,
                              height: 6 + r.intensity * 2,
                            }}
                          />
                        ))
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Liste
// ----------------------------------------------------------------------------

function RelationList({
  projectId,
  characters,
  relations,
  labelOf,
  periodOf,
  onEdit,
}: {
  projectId: string;
  characters: Character[];
  relations: Relation[];
  labelOf: (relation: Relation) => string;
  periodOf: (relation: Relation) => string;
  onEdit: (id: string) => void;
}) {
  const { t } = useTranslation("relations");
  const relationColors = useRelationColors();
  const byId = new Map(characters.map((c) => [c.id, c]));

  if (relations.length === 0) {
    return <p className="px-6 py-4 text-sm text-muted-foreground lg:px-10">{t("view.noMatch")}</p>;
  }

  const person = (id: string) => {
    const c = byId.get(id);
    return c ? (
      <span className="flex min-w-0 items-center gap-2">
        <CharacterAvatar projectId={projectId} character={c} size="sm" />
        <span className="truncate font-medium">{fullName(c)}</span>
      </span>
    ) : null;
  };

  return (
    <div className="absolute inset-0 overflow-auto px-6 pt-2 pb-8 lg:px-10 [scrollbar-gutter:stable]">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">{t("list.characters")}</th>
              <th className="px-4 py-2.5 font-medium">{t("list.type")}</th>
              <th className="px-4 py-2.5 font-medium">{t("list.period")}</th>
              <th className="px-4 py-2.5 font-medium">{t("list.intensity")}</th>
            </tr>
          </thead>
          <tbody>
            {relations.map((r) => (
              <tr
                key={r.id}
                onClick={() => onEdit(r.id)}
                className="cursor-pointer border-b last:border-0 hover:bg-muted/40"
              >
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    {person(r.sourceId)}
                    {r.directed ? (
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ArrowLeftRight className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    {person(r.targetId)}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: relationColors[r.type] }} />
                    <span className="whitespace-nowrap">{labelOf(r)}</span>
                    {r.label && (
                      <span className="text-xs whitespace-nowrap text-muted-foreground">· {t(`types.${r.type}`)}</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{periodOf(r)}</td>
                <td className="px-4 py-2.5">
                  <span className="flex gap-0.5" aria-label={t(`intensity.${r.intensity}` as "intensity.1")}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <span
                        key={i}
                        className="h-2 w-3 rounded-sm"
                        style={{ backgroundColor: i <= r.intensity ? relationColors[r.type] : "var(--muted)" }}
                      />
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}