import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  type Project,
  type ProjectStatus,
  type ProjectType,
} from "@/types";

export interface ProjectFormValues {
  name: string;
  description: string;
  projectType: ProjectType;
  status: ProjectStatus;
}

const PROJECT_TYPES = Object.keys(
  PROJECT_TYPE_LABELS,
) as ProjectType[];

const PROJECT_STATUSES = Object.keys(
  PROJECT_STATUS_LABELS,
) as ProjectStatus[];

const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;

const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Projet à modifier ; `null` pour une création. */
  project: Project | null;
  onSubmit: (values: ProjectFormValues) => Promise<void>;
}

/**
 * Dialogue de création et de modification d'un projet.
 *
 * Le formulaire n'est monté que lorsque le dialogue est ouvert :
 * ses champs sont donc réinitialisés à chaque ouverture.
 */
export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
  onSubmit,
}: ProjectFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ProjectForm
        project={project}
        onSubmit={onSubmit}
        onClose={() => onOpenChange(false)}
      />
    </Dialog>
  );
}

interface ProjectFormProps {
  project: Project | null;
  onSubmit: (values: ProjectFormValues) => Promise<void>;
  onClose: () => void;
}

function ProjectForm({
  project,
  onSubmit,
  onClose,
}: ProjectFormProps) {
  const isEdit = project !== null;

  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(
    project?.description ?? "",
  );
  const [projectType, setProjectType] = useState<ProjectType>(
    project?.type ?? "novel",
  );
  const [status, setStatus] = useState<ProjectStatus>(
    project?.status ?? "preparing",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (!trimmedName) {
      setError("Le nom du projet est requis.");
      return;
    }

    if (trimmedName.length > MAX_NAME_LENGTH) {
      setError(
        `Le nom ne peut pas dépasser ${MAX_NAME_LENGTH} caractères.`,
      );
      return;
    }

    if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
      setError(
        `La description ne peut pas dépasser ${MAX_DESCRIPTION_LENGTH} caractères.`,
      );
      return;
    }

    setSubmitting(true);

    try {
      await onSubmit({
        name: trimmedName,
        description: trimmedDescription,
        projectType,
        status,
      });
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "L'opération a échoué.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? "Modifier le projet"
              : "Créer un nouveau projet"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Mettez à jour les informations du projet."
              : "Donnez un nom à votre projet et choisissez son type."}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Nom du projet</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mon univers"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">
              Description (facultatif)
            </Label>
            <textarea
              id="project-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Un court résumé de votre projet"
              className={`${fieldClass} resize-none py-2`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-type">
              Type de création
            </Label>
            <select
              id="project-type"
              value={projectType}
              onChange={(e) =>
                setProjectType(e.target.value as ProjectType)
              }
              className={`${fieldClass} h-9`}
            >
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PROJECT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="project-status">Statut</Label>
              <select
                id="project-status"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as ProjectStatus)
                }
                className={`${fieldClass} h-9`}
              >
                {PROJECT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {PROJECT_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="mt-6 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting
              ? "Enregistrement…"
              : isEdit
                ? "Enregistrer"
                : "Créer le projet"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}