import type { KeyboardEvent, MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { enUS, fr } from "date-fns/locale";
import {
  Archive,
  ArchiveRestore,
  Copy,
  FileText,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";

/** Format des dates de date-fns pour chaque langue de l'interface. */
const DATE_LOCALES = { fr, en: enUS } as const;

interface ProjectCardProps {
  project: Project;
  busy?: boolean;
  onOpen: (project: Project) => void;
  onToggleFavorite: (project: Project) => void;
  onToggleArchive: (project: Project) => void;
  onEdit: (project: Project) => void;
  onDuplicate: (project: Project) => void;
  onDelete: (project: Project) => void;
}

/**
 * Carte d'un projet sur le tableau de bord.
 *
 * Un clic sur la carte ouvre le projet. Les boutons d'action
 * bloquent la propagation pour ne pas déclencher l'ouverture.
 */
export function ProjectCard({
  project,
  busy = false,
  onOpen,
  onToggleFavorite,
  onToggleArchive,
  onEdit,
  onDuplicate,
  onDelete,
}: ProjectCardProps) {
  const { t, i18n } = useTranslation("projects");

  const dateLocale =
    i18n.resolvedLanguage === "en" ? DATE_LOCALES.en : DATE_LOCALES.fr;

  const favoriteLabel = project.isFavorite
    ? t("card.removeFavorite")
    : t("card.addFavorite");

  const archiveLabel = project.isArchived
    ? t("card.unarchive")
    : t("card.archive");

  function action(handler: (project: Project) => void) {
    return (event: MouseEvent) => {
      event.stopPropagation();
      handler(project);
    };
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(project);
    }
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={t("card.open", { name: project.name })}
      onClick={() => onOpen(project)}
      onKeyDown={onKeyDown}
      className={cn(
        "cursor-pointer transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        project.isArchived && "opacity-70",
        busy && "pointer-events-none opacity-50",
      )}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </div>

          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title={favoriteLabel}
              aria-label={favoriteLabel}
              aria-pressed={project.isFavorite}
              onClick={action(onToggleFavorite)}
            >
              <Star
                className={cn(
                  "h-4 w-4",
                  project.isFavorite &&
                    "fill-warning text-warning",
                )}
              />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title={t("card.edit")}
              aria-label={t("card.edit")}
              onClick={action(onEdit)}
            >
              <Pencil className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title={t("card.duplicate")}
              aria-label={t("card.duplicate")}
              onClick={action(onDuplicate)}
            >
              <Copy className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title={archiveLabel}
              aria-label={archiveLabel}
              onClick={action(onToggleArchive)}
            >
              {project.isArchived ? (
                <ArchiveRestore className="h-4 w-4" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title={t("card.delete")}
              aria-label={t("card.delete")}
              onClick={action(onDelete)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        <CardTitle className="mt-2 truncate">
          {project.name}
        </CardTitle>

        <CardDescription className="line-clamp-2">
          {project.description || t("card.noDescription")}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>{t(`types.${project.type}`)}</span>
          <span>{t(`statuses.${project.status}`)}</span>
        </div>

        <p>
          {t("card.updatedAt", {
            date: format(new Date(project.updatedAt), "d MMM yyyy", {
              locale: dateLocale,
            }),
          })}
          {project.isArchived ? ` · ${t("card.archived")}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}