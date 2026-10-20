import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw, Trash2 } from "lucide-react";
import { SelectionBar, SelectionCheckbox } from "@/components/common/SelectionBar";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorText } from "@/lib/errors";
import { useSelection } from "@/lib/useSelection";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/stores/projectStore";
import { toast } from "@/stores/toastStore";
import type { Project } from "@/types";

/** Durée de conservation d'un projet dans la corbeille (comme Rust). */
export const PROJECT_TRASH_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Jours restants avant la suppression définitive (0 = délai écoulé). */
export function daysLeft(deletedAt: string, now: number = Date.now()): number {
  const expires = new Date(deletedAt).getTime() + PROJECT_TRASH_DAYS * DAY_MS;

  return Math.max(0, Math.ceil((expires - now) / DAY_MS));
}

interface ProjectTrashListProps {
  /** Projets de la corbeille à afficher (déjà limités à l'espace courant). */
  projects: Project[];
  loading: boolean;
}

/**
 * Corbeille des projets, sur le tableau de bord.
 *
 * Un projet supprimé y reste 30 jours : il peut être restauré, ou supprimé
 * définitivement (avec confirmation). Passé ce délai, Rust l'efface seul.
 * Plusieurs projets peuvent être sélectionnés pour être restaurés ou
 * supprimés ensemble.
 */
export function ProjectTrashList({ projects, loading }: ProjectTrashListProps) {
  const { t, i18n } = useTranslation(["dashboard", "common"]);
  const restoreProjects = useProjectStore((state) => state.restoreProjects);
  const purgeProjects = useProjectStore((state) => state.purgeProjects);

  const selection = useSelection(projects.map((project) => project.id));
  const [busy, setBusy] = useState(false);
  /** Projets dont la suppression définitive attend une confirmation. */
  const [confirming, setConfirming] = useState<string[] | null>(null);

  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" });

  async function restore(ids: string[]) {
    setBusy(true);

    try {
      const restored = await restoreProjects(ids);
      toast({ tone: "success", message: t("trash.restored", { count: restored.length }) });
    } catch (error) {
      toast({ tone: "error", message: errorText(error, "dashboard:errors.restoreFailed") });
    } finally {
      selection.drop(ids);
      setBusy(false);
    }
  }

  async function purge(ids: string[]) {
    setBusy(true);

    try {
      await purgeProjects(ids);
      toast({ tone: "success", message: t("trash.purged", { count: ids.length }) });
    } catch (error) {
      toast({ tone: "error", message: errorText(error, "dashboard:errors.deleteFailed") });
    } finally {
      selection.drop(ids);
      setConfirming(null);
      setBusy(false);
    }
  }

  if (loading && projects.length === 0) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("trash.loading")}
      </p>
    );
  }

  if (projects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("empty.trash.title")}</CardTitle>
          <CardDescription>{t("empty.trash.description")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("trash.intro")}</p>

      {/* Barre de sélection : actions groupées */}
      <SelectionBar
        selection={selection}
        disabled={busy}
        idle={
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => setConfirming(projects.map((project) => project.id))}
          >
            <Trash2 className="mr-1.5 size-3.5" />
            {t("trash.empty")}
          </Button>
        }
      >
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void restore(selection.selected)}>
          <RotateCcw className="mr-1.5 size-3.5" />
          {t("trash.restoreSelected")}
        </Button>
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => setConfirming(selection.selected)}>
          <Trash2 className="mr-1.5 size-3.5" />
          {t("trash.purgeSelected")}
        </Button>
      </SelectionBar>

      <ul className="divide-y rounded-lg border bg-card" aria-label={t("list.title.trash")}>
        {projects.map((project) => {
          const left = project.deletedAt ? daysLeft(project.deletedAt) : PROJECT_TRASH_DAYS;
          const checked = selection.isSelected(project.id);

          return (
            <li
              key={project.id}
              className={cn("flex flex-wrap items-center gap-3 px-3 py-2.5", checked && "bg-accent/60")}
            >
              <SelectionCheckbox
                selection={selection}
                id={project.id}
                label={t("trash.select", { name: project.name })}
                disabled={busy}
              />

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{project.name}</p>
                <p className="text-xs text-muted-foreground">
                  {project.deletedAt && t("trash.deletedOn", { date: dateFormat.format(new Date(project.deletedAt)) })}
                  {" · "}
                  <span className={cn(left <= 3 && "font-medium text-destructive")}>
                    {left === 0 ? t("trash.expiresToday") : t("trash.expiresIn", { count: left })}
                  </span>
                </p>
              </div>

              <div className="flex shrink-0 gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void restore([project.id])}
                  aria-label={t("trash.restoreNamed", { name: project.name })}
                >
                  <RotateCcw className="mr-1.5 size-3.5" />
                  {t("trash.restore")}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setConfirming([project.id])}
                  aria-label={t("trash.purgeNamed", { name: project.name })}
                  title={t("trash.purge")}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Confirmation de la suppression définitive */}
      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirming(null);
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("trash.confirm.title", { count: confirming?.length ?? 1 })}</DialogTitle>
          <DialogDescription>{t("trash.confirm.description")}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6 gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>
            {t("common:actions.cancel")}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => confirming && void purge(confirming)}>
            {t("trash.confirm.confirm")}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
