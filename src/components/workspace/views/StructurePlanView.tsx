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
  ListTree,
  Loader2,
  Pencil,
  Plus,
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
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { api } from "@/lib/api";
import {
  buildStructureTree,
  countAtLevel,
  countByLevel,
  flattenVisible,
  LEVEL_KEYS,
  levelKey,
  STRUCTURE_LEVELS,
  STRUCTURE_TEMPLATES,
  templateForProjectType,
  type StructureTreeNode,
} from "@/lib/structure";
import { useUnsavedChanges } from "@/lib/unsavedChanges";
import { cn } from "@/lib/utils";
import type { Project, Structure, StructureTemplateId } from "@/types";

const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/** Couleur du repère de chaque niveau (du plus large au plus fin). */
const LEVEL_DOT = ["bg-primary", "bg-primary/60", "bg-primary/30"];

/** Valeur du sélecteur quand le modèle suit le type du projet. */
const AUTO = "auto";

interface StructurePlanViewProps {
  project: Project;
  feature: WorkspaceFeature;
}

/** Élément en cours de modification (titre et résumé). */
interface Draft {
  id: string;
  title: string;
  summary: string;
  /** Valeurs enregistrées, pour savoir s'il y a des modifications. */
  savedTitle: string;
  savedSummary: string;
}

/**
 * Plan du récit : le découpage du projet, en arbre.
 *
 * Les niveaux portent les noms du modèle de découpage (Partie › Chapitre ›
 * Scène pour un roman, Acte › Séquence › Scène pour un film…). Le modèle
 * suit le type du projet, ou un autre choisi ici : changer de modèle ne
 * renomme que les niveaux, aucune donnée n'est touchée.
 *
 * Chaque action (ajout, déplacement, suppression) est enregistrée tout de
 * suite. Seule la modification du titre et du résumé passe par
 * « Enregistrer », avec le point ● sur l'onglet tant qu'elle est en cours.
 */
export function StructurePlanView({ project, feature }: StructurePlanViewProps) {
  const { t } = useTranslation(["structure", "common"]);

  const [structure, setStructure] = useState<Structure | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<StructureTreeNode | null>(null);

  const titleInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Chargement
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    try {
      const next = await api.getStructure(project.id);
      setStructure(next);
      setLoadError(null);
      return next;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("plan.loadFailed"));
      return null;
    }
  }, [project.id, t]);

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
    (draft.title !== draft.savedTitle || draft.summary !== draft.savedSummary);

  async function saveDraft(): Promise<boolean> {
    if (!draft) return true;

    setDraftError(null);

    try {
      const saved = await api.updateStructureNode(project.id, draft.id, {
        title: draft.title,
        summary: draft.summary,
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
    revision: draft ? `${draft.title}\u0000${draft.summary}` : null,
  });

  function startEditing(node: StructureTreeNode) {
    setDraftError(null);
    setDraft({
      id: node.id,
      title: node.title,
      summary: node.summary,
      savedTitle: node.title,
      savedSummary: node.summary,
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

  const template = structure?.template ?? templateForProjectType(project.type);

  const levelLabel = (level: number, form: "one" | "other" | "add" | "new") =>
    t(`templates.${template}.levels.${levelKey(level)}.${form}`);

  async function addNode(parentId: string | null, level: number) {
    if (!structure) return;

    const number = countAtLevel(structure.nodes, parentId, level) + 1;

    const created = await run(() =>
      api.createStructureNode(project.id, {
        parentId,
        level,
        title: `${levelLabel(level, "new")} ${number}`,
      }),
    );

    if (created) {
      if (parentId) {
        setCollapsed((current) => {
          const next = new Set(current);
          next.delete(parentId);
          return next;
        });
      }

      // Le nouvel élément s'ouvre tout de suite pour être renommé.
      setDraft({
        id: created.id,
        title: created.title,
        summary: "",
        savedTitle: created.title,
        savedSummary: "",
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

  async function changeTemplate(value: string) {
    await run(() =>
      api.setStructureTemplate(project.id, value === AUTO ? null : value),
    );
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
    () => (structure ? countByLevel(structure.nodes) : []),
    [structure],
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

  const autoName = t(`templates.${templateForProjectType(project.type)}.name`);

  return (
    <Shell feature={feature}>
      {/* =====================================================================
          MODÈLE DE DÉCOUPAGE
          ===================================================================== */}
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-lg border bg-card p-4">
        <div className="min-w-56 flex-1 space-y-2">
          <Label htmlFor="structure-template">{t("template.label")}</Label>

          <select
            id="structure-template"
            value={structure.templateChosen ? structure.template : AUTO}
            disabled={busy}
            onChange={(e) => void changeTemplate(e.target.value)}
            className={`${fieldClass} h-9 max-w-xs`}
          >
            <option value={AUTO}>{t("template.auto", { name: autoName })}</option>
            {STRUCTURE_TEMPLATES.map((id: StructureTemplateId) => (
              <option key={id} value={id}>
                {t(`templates.${id}.name`)}
              </option>
            ))}
          </select>

          <p className="text-xs text-muted-foreground">{t("template.hint")}</p>
        </div>

        {/* Niveaux du modèle, avec le nombre d'éléments de chacun */}
        <ol className="flex flex-wrap items-center gap-1.5 text-sm" aria-label={t("template.label")}>
          {LEVEL_KEYS.map((key, level) => (
            <li key={key} className="flex items-center gap-1.5">
              {level > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1">
                <span className={cn("h-2 w-2 rounded-full", LEVEL_DOT[level])} />
                {levelLabel(level, "other")}
                <span className="text-xs text-muted-foreground">{counts[level] ?? 0}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* =====================================================================
          AJOUT À LA RACINE
          ===================================================================== */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t("plan.addAtRoot")}</span>
        {LEVEL_KEYS.map((key, level) => (
          <Button
            key={key}
            size="sm"
            variant={level === 0 ? "default" : "outline"}
            disabled={busy}
            onClick={() => void addNode(null, level)}
          >
            <Plus className="h-3.5 w-3.5" />
            {levelLabel(level, "add")}
          </Button>
        ))}
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

            return (
              <div
                key={node.id}
                role="treeitem"
                aria-level={node.depth + 1}
                aria-expanded={node.children.length > 0 ? !isCollapsed : undefined}
                aria-selected={editing}
              >
                <div
                  className={cn(
                    "group flex min-h-10 items-center gap-2 pr-2",
                    editing && "bg-muted/40",
                  )}
                  style={{ paddingLeft: `${0.5 + node.depth * 1.5}rem` }}
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

                  <span className={cn("h-2 w-2 shrink-0 rounded-full", LEVEL_DOT[node.level])} />

                  <span className="shrink-0 text-xs text-muted-foreground">
                    {levelLabel(node.level, "one")}
                  </span>

                  <button
                    type="button"
                    onClick={() => startEditing(node)}
                    className="min-w-0 truncate text-left text-sm font-medium hover:underline"
                  >
                    {node.title || t("plan.untitled")}
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
                      {childLevel < STRUCTURE_LEVELS && (
                        <IconButton
                          label={levelLabel(childLevel, "add")}
                          disabled={busy}
                          onClick={() => void addNode(node.id, childLevel)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </IconButton>
                      )}
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
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      />
                    </div>

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
          CONFIRMATION DE SUPPRESSION
          ===================================================================== */}
      <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogHeader>
          <DialogTitle>{t("plan.delete.title", { title: toDelete?.title ?? "" })}</DialogTitle>
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