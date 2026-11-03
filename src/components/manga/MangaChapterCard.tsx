import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clapperboard, Plus } from "lucide-react";
import { ProgressBar } from "@/components/novel/NovelSheetCards";
import { Button } from "@/components/ui/button";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { goalPercent } from "@/lib/novel";
import { cn } from "@/lib/utils";
import { useStructureStore } from "@/stores/structureStore";
import { SCRIPT_STATUSES, type MangaChapterFields, type ScriptStatus, type StructureNode } from "@/types";

/** Couleur de chaque statut du scénario. */
export const SCRIPT_STATUS_COLORS: Record<ScriptStatus, string> = {
  todo: "#94a3b8",
  progress: "#e3a21a",
  review: "#e0483d",
  final: "#1fa37a",
};

export const scriptStatusOf = (node: Pick<StructureNode, "scriptStatus">): ScriptStatus => node.scriptStatus ?? "todo";

/** Pages ajoutées en une fois (comme dans Rust). */
const MAX_NEW_PAGES = 200;

interface MangaChapterCardProps {
  projectId: string;
  node: StructureNode;
  /** Pages du chapitre, et celles qui ont au moins une case. */
  pages: number;
  writtenPages: number;
}

/**
 * Scénario d'un chapitre de manga / BD : objectif narratif, nombre de
 * pages visé, statut. Chaque changement est enregistré aussitôt.
 */
export function MangaChapterCard({ projectId, node, pages, writtenPages }: MangaChapterCardProps) {
  const { t } = useTranslation(["manga", "common"]);
  const [open, setOpen] = useCollapsible("ganis.nodeSheet.mangaChapter.collapsed");
  const applyNode = useStructureStore((s) => s.applyNode);
  const [goal, setGoal] = useState(node.narrativeGoal);
  const [pageGoal, setPageGoal] = useState(node.pageGoal ? String(node.pageGoal) : "");
  // Erreurs en notification : la page ne bouge pas.
  const setError = (message: string | null) => {
    if (message) notifyError(message, "manga:chapter");
  };
  const [busy, setBusy] = useState(false);
  const fetchStructure = useStructureStore((s) => s.fetchStructure);
  // Pages à ajouter : par défaut, ce qu'il manque pour atteindre l'objectif.
  const [editedNewPages, setNewPages] = useState<string | null>(null);
  const newPages = editedNewPages ?? String(Math.min(MAX_NEW_PAGES, Math.max(1, (node.pageGoal ?? 0) - pages)));
  const newPageCount = Math.min(MAX_NEW_PAGES, Number.parseInt(newPages, 10) || 0);

  useEffect(() => setGoal(node.narrativeGoal), [node.narrativeGoal]);
  useEffect(() => setPageGoal(node.pageGoal ? String(node.pageGoal) : ""), [node.pageGoal]);

  const fields: MangaChapterFields = { narrativeGoal: node.narrativeGoal, pageGoal: node.pageGoal, scriptStatus: node.scriptStatus };

  async function save(changes: Partial<MangaChapterFields>) {
    setBusy(true);
    setError(null);
    try {
      applyNode(projectId, await api.setMangaChapter(projectId, node.id, { ...fields, ...changes }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function commitPageGoal() {
    const value = pageGoal.trim() === "" ? null : Number.parseInt(pageGoal, 10);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setPageGoal(node.pageGoal ? String(node.pageGoal) : "");
      return;
    }
    if ((value || null) !== node.pageGoal) void save({ pageGoal: value || null });
  }

  async function addPages() {
    if (newPageCount < 1) return;
    setBusy(true);
    setError(null);
    try {
      await api.createMangaPages(projectId, node.id, newPageCount);
      await fetchStructure(projectId);
      setNewPages(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const percent = goalPercent(writtenPages, node.pageGoal);
  const status = scriptStatusOf(node);

  return (
    <CollapsibleCard open={open} onOpenChange={setOpen} icon={Clapperboard} title={t("chapter.title")} description={t("chapter.description")}>
      <div className="space-y-5">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t("chapter.goal")}</span>
          <textarea
            rows={3}
            value={goal}
            placeholder={t("chapter.goalPlaceholder")}
            onChange={(e) => setGoal(e.target.value)}
            onBlur={() => goal !== node.narrativeGoal && void save({ narrativeGoal: goal })}
            className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t("progress.pages")}</p>
            <p className="flex h-9 items-center text-lg font-semibold tabular-nums">
              {node.pageGoal ? t("chapter.pages", { written: writtenPages, goal: node.pageGoal }) : t("chapter.pagesNoGoal", { count: pages })}
            </p>
            {percent !== null && <ProgressBar percent={percent} />}
          </div>
          <label className="space-y-1.5">
            <span className="block text-sm font-medium">{t("chapter.pageGoal")}</span>
            <input
              type="number"
              min={0}
              value={pageGoal}
              placeholder={t("chapter.pageGoalPlaceholder")}
              disabled={busy}
              onChange={(e) => setPageGoal(e.target.value)}
              onBlur={commitPageGoal}
              onKeyDown={(e) => e.key === "Enter" && commitPageGoal()}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1.5">
            <span className="block text-sm font-medium">{t("chapter.addPages")}</span>
            <input
              type="number"
              placeholder={t("common:placeholders.number")}
              min={1}
              max={MAX_NEW_PAGES}
              value={newPages}
              disabled={busy}
              onChange={(e) => setNewPages(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void addPages()}
              className="h-9 w-24 rounded-md border border-input bg-background px-3 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <Button variant="outline" disabled={busy || newPageCount < 1} onClick={() => void addPages()}>
            <Plus />
            {t("chapter.addPagesButton", { count: newPageCount })}
          </Button>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t("chapter.status")}</p>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("chapter.status")}>
            {SCRIPT_STATUSES.map((value) => {
              const selected = status === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy}
                  onClick={() => !selected && void save({ scriptStatus: value })}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted",
                    selected && "border-transparent font-medium text-white hover:opacity-90",
                  )}
                  style={selected ? { backgroundColor: SCRIPT_STATUS_COLORS[value] } : undefined}
                >
                  {!selected && <span className="size-2 rounded-full" style={{ backgroundColor: SCRIPT_STATUS_COLORS[value] }} aria-hidden="true" />}
                  {t(`status.${value}`)}
                </button>
              );
            })}
          </div>
        </div>

      </div>
    </CollapsibleCard>
  );
}
