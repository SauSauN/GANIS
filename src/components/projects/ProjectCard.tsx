import type { KeyboardEvent, MouseEvent } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
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
import {
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  type Project,
} from "@/types";

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
      aria-label={`Ouvrir le projet ${project.name}`}
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
              title={
                project.isFavorite
                  ? "Retirer des favoris"
                  : "Ajouter aux favoris"
              }
              aria-label={
                project.isFavorite
                  ? "Retirer des favoris"
                  : "Ajouter aux favoris"
              }
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
              title="Modifier le projet"
              aria-label="Modifier le projet"
              onClick={action(onEdit)}
            >
              <Pencil className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Dupliquer le projet"
              aria-label="Dupliquer le projet"
              onClick={action(onDuplicate)}
            >
              <Copy className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title={
                project.isArchived
                  ? "Désarchiver le projet"
                  : "Archiver le projet"
              }
              aria-label={
                project.isArchived
                  ? "Désarchiver le projet"
                  : "Archiver le projet"
              }
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
              title="Supprimer le projet"
              aria-label="Supprimer le projet"
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
          {project.description || "Aucune description."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>{PROJECT_TYPE_LABELS[project.type]}</span>
          <span>{PROJECT_STATUS_LABELS[project.status]}</span>
        </div>

        <p>
          Modifié le{" "}
          {format(new Date(project.updatedAt), "d MMM yyyy", {
            locale: fr,
          })}
          {project.isArchived ? " · Archivé" : ""}
        </p>
      </CardContent>
    </Card>
  );
}