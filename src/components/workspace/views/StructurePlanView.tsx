import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  IdCard,
  ListOrdered,
  ListTree,
  Loader2,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StructureLevelsEditor } from "@/components/structure/StructureLevelsEditor";
import { StructureTemplatePicker } from "@/components/structure/StructureTemplatePicker";
import { useStructureLabels } from "@/components/structure/useProjectStructure";
import { useStructureStore } from "@/stores/structureStore";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { api } from "@/lib/api";
import {
  buildStructureTree,
  countByLevel,
  flattenVisible,
  levelOf,
  MAX_NUMBER,
  structureNodeTabId,
  type StructureTreeNode,
} from "@/lib/structure";
import { useUnsavedChanges } from "@/lib/unsavedChanges";
import { cn } from "@/lib/utils";
import type { Project, StructureNode, StructureTemplateId } from "@/types";

const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

interface StructurePlanViewProps {
  project: Project;
  feature: WorkspaceFeature;
  /** Ouvre un onglet (fiche d'un élément). */
  onOpenFeature?: (featureId: string) => void;
}

/** Élément en cours de modification (titre, résumé, numérotation). */
interface Draft {
  id: string;
  title: string;
  summary: string;
  numbered: boolean;
  /** Numéro choisi (numérotation non automatique), en texte. */
  number: string;
  /** Valeurs enregistrées, pour savoir s'il y a des modifications. */
  savedTitle: string;
  savedSummary: string;
  savedNumbered: boolean;
  savedNumber: string;
}

/**
 * Plan du récit : le découpage du projet, en arbre.
 *
 * Les niveaux portent les noms du modèle de découpage (Partie › Chapitre ›
 * Scène pour un roman, Acte › Séquence › Scène pour un film…) ou ceux
 * choisis par l'utilisateur (« Personnaliser » : noms, numérotation, 1 à 5
 * niveaux).
 *
 * Numéros (« Chapitre 3 ») : par défaut, chaque élément garde celui reçu
 * à sa création (modifiable ; « Renuméroter » les remet dans l'ordre). Avec
 * la numérotation automatique (paramètres du projet), ils suivent l'ordre
 * du plan. Le titre est facultatif.
 *
 * Chaque action (ajout, déplacement, suppression) est enregistrée tout de
 * suite. Seule la modification du titre et du résumé passe par
 * « Enregistrer », avec le point ● sur l'onglet tant qu'elle est en cours.
 */
export function StructurePlanView({ project, feature, onOpenFeature }: StructurePlanViewProps) {
  const { t } = useTranslation(["structure", "common"]);

  const structure = useStructureStore((state) =>
    state.projectId === project.id ? state.structure : null,
  );
  const loadError = useStructureStore((state) =>
    state.projectId === project.id ? state.error : null,
  );
  const fetchStructure = useStructureStore((state) => state.fetchStructure);
  const focus = useStructureStore((state) => state.focus);
  const clearFocus = useStructureStore((state) => state.clearFocus);

  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<StructureTreeNode | null>(null);
  const [customizing, setCustomizing] = useState(false);
  const [renumbering, setRenumbering] = useState(false);
  /** Élément montré après un clic dans l'arborescence du panneau latéral. */
  const [highlight, setHighlight] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Chargement
  // ---------------------------------------------------------------------------

  // Découpage partagé (voir `structureStore`) : l'arborescence du panneau
  // latéral, les fiches et les relations voient chaque modification.
  const load = useCallback(() => fetchStructure(project.id), [fetchStructure, project.id]);

  // Rechargé aussi quand le type du projet change (paramètres du projet) :
  // un modèle qui suit le type change avec lui.
  useEffect(() => {
    void load();
  }, [load, project.type]);

  /** Exécute une action puis recharge le découpage. */
  async function run<T>(action: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setActionError(null);

    try {
      const result = await action();
      await load();
      return result;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Modification du titre et du résumé
  // ---------------------------------------------------------------------------

  const dirty =
    draft !== null &&
    (draft.title !== draft.savedTitle ||
      draft.summary !== draft.savedSummary ||
      draft.numbered !== draft.savedNumbered ||
      draft.number !== draft.savedNumber);

  async function saveDraft(): Promise<boolean> {
    if (!draft) return true;

    setDraftError(null);

    try {
      const number = draft.number.trim() === "" ? undefined : Number(draft.number);

      if (number !== undefined && (!Number.isInteger(number) || number < 0 || number > MAX_NUMBER)) {
        setDraftError(t("plan.edit.numberInvalid", { max: MAX_NUMBER }));
        return false;
      }

      const saved = await api.updateStructureNode(project.id, draft.id, {
        title: draft.title,
        summary: draft.summary,
        numbered: draft.numbered,
        number: draft.number !== draft.savedNumber ? number : undefined,
      });

      setDraft(null);
      await load();

      return saved.id === draft.id;
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  // Point ● sur l'onglet et question à la fermeture tant qu'une
  // modification est en cours.
  useUnsavedChanges({
    dirty,
    save: saveDraft,
    revision: draft
      ? `${draft.title}\u0000${draft.summary}\u0000${draft.numbered}\u0000${draft.number}`
      : null,
  });

  function startEditing(node: StructureNode) {
    setDraftError(null);
    const number = numbers.get(node.id);
    const shown = number === undefined ? "" : String(number);

    setDraft({
      id: node.id,
      title: node.title,
      summary: node.summary,
      numbered: node.numbered,
      number: shown,
      savedTitle: node.title,
      savedSummary: node.summary,
      savedNumbered: node.numbered,
      savedNumber: shown,
    });
  }

  useEffect(() => {
    if (draft) {
      titleInputRef.current?.focus();
    }
    // Seulement à l'ouverture d'un nouvel élément.
  }, [draft?.id]);

  function onDraftSubmit(event: FormEvent) {
    event.preventDefault();
    void saveDraft();
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const { levels, numbers, headingOf, colorOf } = useStructureLabels(structure);
  const autoNumbering = structure?.autoNumbering ?? false;

  // Clic dans l'arborescence du panneau latéral : l'élément est déplié,
  // montré et ouvert (sauf modification en cours sur un autre élément).
  useEffect(() => {
    if (!focus || !structure) return;

    const node = structure.nodes.find((n) => n.id === focus.nodeId);
    clearFocus();
    if (!node) return;

    const byId = new Map(structure.nodes.map((n) => [n.id, n]));
    setCollapsed((current) => {
      const next = new Set(current);
      for (let parent = node.parentId; parent; parent = byId.get(parent)?.parentId ?? null) {
        next.delete(parent);
      }
      return next;
    });
    setHighlight(node.id);

    if (!dirty) {
      startEditing(node);
    }

    requestAnimationFrame(() =>
      document
        .getElementById(`structure-node-${node.id}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" }),
    );
    // Seulement à chaque nouvelle demande.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, structure]);

  // Le repère disparaît après quelques secondes.
  useEffect(() => {
    if (!highlight) return;
    const timer = window.setTimeout(() => setHighlight(null), 2500);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  /** « Renuméroter » : remet tous les numéros dans l'ordre du plan. */
  async function renumber() {
    setRenumbering(false);
    await run(() => api.renumberStructure(project.id));
  }

  /** Nom d'un niveau (« Chapitre »), même au-delà du dernier niveau. */
  const levelName = (level: number) => levelOf(levels, level)?.one ?? "";

  /**
   * Ajoute un élément sans titre (il s'appelle « Chapitre 4 » d'après sa
   * place). `afterId` : juste après cet élément, sinon à la fin du parent.
   */
  async function addNode(parentId: string | null, level: number, afterId: string | null = null) {
    if (!structure) return;

    const created = await run(() =>
      api.createStructureNode(project.id, { parentId, level, afterId }),
    );

    if (created && parentId) {
      setCollapsed((current) => {
        const next = new Set(current);
        next.delete(parentId);
        return next;
      });
    }
  }

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }

  async function confirmDelete() {
    if (!toDelete) return;

    const id = toDelete.id;
    setToDelete(null);

    if (draft?.id === id) {
      setDraft(null);
    }

    await run(() => api.deleteStructureNode(project.id, id));
  }

  async function changeTemplate(template: StructureTemplateId | null) {
    await run(() => api.setStructureTemplate(project.id, template));
  }

  // ---------------------------------------------------------------------------
  // Affichage
  // ---------------------------------------------------------------------------

  const roots = useMemo(
    () => (structure ? buildStructureTree(structure.nodes) : []),
    [structure],
  );
  const rows = useMemo(() => flattenVisible(roots, collapsed), [roots, collapsed]);
  const counts = useMemo(
    () => (structure ? countByLevel(structure.nodes, Math.max(levels.length, 1)) : []),
    [structure, levels.length],
  );

  /** Frères (même parent), pour savoir si on peut monter ou descendre. */
  const siblingsOf = (node: StructureTreeNode) =>
    node.parentId
      ? (structure?.nodes ?? []).filter((n) => n.parentId === node.parentId)
      : roots;

  if (loadError && !structure) {
    return (
      <Shell feature={feature}>
        <div className="rounded-lg border p-6 text-sm">
          <p role="alert" className="text-destructive">
            {loadError}
          </p>
          <Button variant="outline" className="mt-4" onClick={() => void load()}>
            {t("plan.retry")}
          </Button>
        </div>
      </Shell>
    );
  }

  if (!structure) {
    return (
      <Shell feature={feature}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("plan.loading")}
        </p>
      </Shell>
    );
  }

  return (
    <Shell feature={feature}>
      {/* =====================================================================
          MODÈLE ET NIVEAUX
          ===================================================================== */}
      <section className="space-y-4 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <StructureTemplatePicker
            structure={structure}
            projectType={project.type}
            disabled={busy}
            onChange={(template) => void changeTemplate(template)}
            className="min-w-56 flex-1"
          />

          <Button
            type="button"
            size="sm"
            variant={customizing ? "secondary" : "outline"}
            aria-expanded={customizing}
            onClick={() => setCustomizing((open) => !open)}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {t("levels.customize")}
          </Button>
        </div>

        {/* Niveaux, avec le nombre d'éléments de chacun */}
        <ol className="flex flex-wrap items-center gap-1.5 text-sm" aria-label={t("levels.title")}>
          {levels.map((level, index) => (
            <li key={level.id} className="flex items-center gap-1.5">
              {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: level.color }} />
                {level.other}
                <span className="text-xs text-muted-foreground tabular-nums">{counts[index] ?? 0}</span>
              </span>
            </li>
          ))}
          {structure.levelsCustom && (
            <li className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
              {t("template.custom")}
            </li>
          )}
        </ol>

        {customizing && (
          <div className="space-y-3 border-t pt-4">
            <div>
              <h3 className="text-sm font-semibold">{t("levels.title")}</h3>
              <p className="text-xs text-muted-foreground">{t("levels.description")}</p>
            </div>
            <StructureLevelsEditor
              projectId={project.id}
              structure={structure}
              levels={levels}
              onSaved={load}
              onCancel={() => setCustomizing(false)}
              onOpenColorSettings={onOpenFeature ? () => onOpenFeature("settings:structure") : undefined}
            />
          </div>
        )}
      </section>

      {/* =====================================================================
          AJOUT À LA RACINE
          ===================================================================== */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("plan.addAtRoot")}</span>
        {levels.map((level, index) => (
          <Button
            key={level.id}
            size="sm"
            variant={index === 0 ? "default" : "outline"}
            disabled={busy}
            aria-label={t("plan.add", { name: level.one })}
            onClick={() => void addNode(null, index)}
          >
            <Plus className="h-3.5 w-3.5" />
            {level.one}
          </Button>
        ))}

        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {autoNumbering ? (
            t("numbering.autoOn")
          ) : (
            <>
              {t("numbering.autoOff")}
              <Button
                size="sm"
                variant="outline"
                disabled={busy || structure.nodes.length === 0}
                title={t("numbering.renumberHint")}
                onClick={() => setRenumbering(true)}
              >
                <ListOrdered className="h-3.5 w-3.5" />
                {t("numbering.renumber")}
              </Button>
            </>
          )}
        </span>
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}

      {/* =====================================================================
          PLAN
          ===================================================================== */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center">
          <ListTree className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">{t("plan.empty.title")}</p>
          <p className="max-w-md text-sm text-muted-foreground">{t("plan.empty.description")}</p>
        </div>
      ) : (
        <div role="tree" aria-label={feature.label} className="divide-y rounded-lg border bg-card">
          {rows.map((node) => {
            const siblings = siblingsOf(node);
            const index = siblings.findIndex((n) => n.id === node.id);
            const isCollapsed = collapsed.has(node.id);
            const editing = draft?.id === node.id;
            const childLevel = node.level + 1;
            const heading = headingOf(node);

            return (
              <div
                key={node.id}
                id={`structure-node-${node.id}`}
                role="treeitem"
                aria-level={node.depth + 1}
                aria-expanded={node.children.length > 0 ? !isCollapsed : undefined}
                aria-selected={editing}
              >
                <div
                  className={cn(
                    "group flex min-h-10 items-center gap-2 pr-2 transition-colors duration-700",
                    editing && "bg-muted/40",
                    highlight === node.id && "bg-primary/10",
                  )}
                  // Fine bande de la couleur de l'élément (ou de son niveau).
                  style={{
                    paddingLeft: `${0.5 + node.depth * 1.5}rem`,
                    boxShadow: `inset 3px 0 0 ${colorOf(node)}`,
                  }}
                >
                  {node.children.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => toggle(node.id)}
                      title={isCollapsed ? t("plan.toggle.expand") : t("plan.toggle.collapse")}
                      aria-label={isCollapsed ? t("plan.toggle.expand") : t("plan.toggle.collapse")}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  ) : (
                    <span className="w-6 shrink-0" />
                  )}

                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(node) }} />

                  <button
                    type="button"
                    onClick={() => startEditing(node)}
                    className="flex min-w-0 items-baseline gap-1.5 truncate text-left text-sm hover:underline"
                  >
                    {heading.number !== null ? (
                      <>
                        <span className="shrink-0 font-semibold">{heading.prefix}</span>
                        {heading.title && (
                          <span className="truncate">
                            <span className="text-muted-foreground">— </span>
                            {heading.title}
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="truncate font-semibold">{heading.label}</span>
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.7rem] font-normal text-muted-foreground">
                          {heading.title ? `${levelName(node.level)} · ` : ""}
                          {t("plan.unnumbered")}
                        </span>
                      </>
                    )}
                  </button>

                  {node.summary && (
                    <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground md:inline">
                      — {node.summary}
                    </span>
                  )}

                  <span className="ml-auto flex shrink-0 items-center gap-0.5">
                    {node.descendants > 0 && (
                      <span className="mr-2 text-xs text-muted-foreground">
                        {t("plan.contains", { count: node.descendants })}
                      </span>
                    )}

                    <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                      {childLevel < levels.length && (
                        <IconButton
                          label={t("plan.add", { name: levelName(childLevel) })}
                          disabled={busy}
                          onClick={() => void addNode(node.id, childLevel)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </IconButton>
                      )}
                      <IconButton
                        label={t("plan.insertAfter", { name: levelName(node.level) })}
                        disabled={busy}
                        onClick={() => void addNode(node.parentId, node.level, node.id)}
                      >
                        <CornerDownRight className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton
                        label={t("plan.actions.moveUp")}
                        disabled={busy || index <= 0}
                        onClick={() => void run(() => api.moveStructureNode(project.id, node.id, "up"))}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton
                        label={t("plan.actions.moveDown")}
                        disabled={busy || index < 0 || index >= siblings.length - 1}
                        onClick={() => void run(() => api.moveStructureNode(project.id, node.id, "down"))}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </IconButton>
                      {onOpenFeature && (
                        <IconButton
                          label={t("plan.actions.open")}
                          onClick={() => onOpenFeature(structureNodeTabId(node.id))}
                        >
                          <IdCard className="h-3.5 w-3.5" />
                        </IconButton>
                      )}
                      <IconButton label={t("plan.actions.edit")} onClick={() => startEditing(node)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton
                        label={t("plan.actions.delete")}
                        disabled={busy}
                        onClick={() => setToDelete(node)}
                        className="hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </span>
                  </span>
                </div>

                {/* Modification du titre et du résumé */}
                {editing && draft && (
                  <form
                    onSubmit={onDraftSubmit}
                    className="space-y-3 border-t bg-muted/20 py-4 pr-4"
                    style={{ paddingLeft: `${2.75 + node.depth * 1.5}rem` }}
                  >
                    <div className="max-w-xl space-y-1.5">
                      <Label htmlFor={`node-title-${node.id}`}>{t("plan.edit.title")}</Label>
                      <Input
                        id={`node-title-${node.id}`}
                        ref={titleInputRef}
                        value={draft.title}
                        maxLength={200}
                        placeholder={t("plan.edit.titlePlaceholder", {
                          label: headingOf({ ...node, title: "" }).label,
                        })}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      />
                    </div>

                    {!autoNumbering &&
                      draft.numbered &&
                      levelOf(levels, node.level)?.numbering !== "none" && (
                        <div className="max-w-40 space-y-1.5">
                          <Label htmlFor={`node-number-${node.id}`}>{t("plan.edit.number")}</Label>
                          <Input
                            id={`node-number-${node.id}`}
                            type="number"
                            min={0}
                            max={MAX_NUMBER}
                            value={draft.number}
                            onChange={(e) => setDraft({ ...draft, number: e.target.value })}
                          />
                        </div>
                      )}

                    <label className="flex max-w-xl items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-primary"
                        checked={draft.numbered}
                        onChange={(e) => setDraft({ ...draft, numbered: e.target.checked })}
                      />
                      <span>
                        {t("plan.edit.numbered")}
                        <span className="block text-xs text-muted-foreground">
                          {t("plan.edit.numberedHint")}
                        </span>
                      </span>
                    </label>

                    <div className="max-w-xl space-y-1.5">
                      <Label htmlFor={`node-summary-${node.id}`}>{t("plan.edit.summary")}</Label>
                      <textarea
                        id={`node-summary-${node.id}`}
                        rows={3}
                        value={draft.summary}
                        placeholder={t("plan.edit.summaryPlaceholder")}
                        onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                        className={`${fieldClass} resize-y py-2 leading-6`}
                      />
                    </div>

                    {draftError && (
                      <p role="alert" className="text-sm text-destructive">
                        {draftError}
                      </p>
                    )}

                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={!dirty}>
                        {t("plan.edit.save")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDraft(null);
                          setDraftError(null);
                        }}
                      >
                        {t("plan.edit.cancel")}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          CONFIRMATION DE RENUMÉROTATION
          ===================================================================== */}
      <Dialog open={renumbering} onOpenChange={(open) => !open && setRenumbering(false)}>
        <DialogHeader>
          <DialogTitle>{t("numbering.confirmTitle")}</DialogTitle>
          <DialogDescription>{t("numbering.confirmDescription")}</DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-6 gap-2">
          <Button variant="ghost" onClick={() => setRenumbering(false)}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={() => void renumber()}>{t("numbering.renumber")}</Button>
        </DialogFooter>
      </Dialog>

      {/* =====================================================================
          CONFIRMATION DE SUPPRESSION
          ===================================================================== */}
      <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogHeader>
          <DialogTitle>{t("plan.delete.title", { title: toDelete ? headingOf(toDelete).label : "" })}</DialogTitle>
          <DialogDescription>
            {toDelete && toDelete.descendants > 0
              ? t("plan.delete.withChildren", { count: toDelete.descendants })
              : null}{" "}
            {t("plan.delete.description")}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-6 gap-2">
          <Button variant="ghost" onClick={() => setToDelete(null)}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="destructive" onClick={() => void confirmDelete()}>
            {t("plan.delete.confirm")}
          </Button>
        </DialogFooter>
      </Dialog>
    </Shell>
  );
}

/** Cadre de la vue : titre, description, contenu (plus large que `ViewShell`). */
function Shell({ feature, children }: { feature: WorkspaceFeature; children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <div>
          <h2 className="sr-only">{feature.label}</h2>
          <p className="text-sm text-muted-foreground">{feature.description}</p>
        </div>

        {children}
      </div>
    </div>
  );
}

/** Petit bouton d'action d'une ligne, avec son nom en infobulle. */
function IconButton({
  label,
  className,
  ...props
}: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30",
        className,
      )}
      {...props}
    />
  );
}