import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
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

// Les libellés français de `@/types` ne servent plus qu'à lister les valeurs ;
// le texte affiché vient de `projects.json` (types.* et statuses.*).
const PROJECT_TYPES = Object.keys(
  PROJECT_TYPE_LABELS,
) as ProjectType[];

const PROJECT_STATUSES = Object.keys(
  PROJECT_STATUS_LABELS,
) as ProjectStatus[];

const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;

/**
 * Erreur affichée sous le formulaire.
 *
 * On garde une clé (pas le texte) : le message suit la langue si elle
 * change pendant qu'il est affiché. `text` ne sert qu'aux erreurs
 * renvoyées par Rust (encore en français).
 */
type FormError =
  | { key: "nameRequired" | "nameTooLong" | "descriptionTooLong" | "failed" }
  | { text: string };

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
  const { t } = useTranslation(["projects", "common"]);
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
  const [error, setError] = useState<FormError | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (!trimmedName) {
      setError({ key: "nameRequired" });
      return;
    }

    if (trimmedName.length > MAX_NAME_LENGTH) {
      setError({ key: "nameTooLong" });
      return;
    }

    if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
      setError({ key: "descriptionTooLong" });
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
      setError(e instanceof Error ? { text: e.message } : { key: "failed" });
    } finally {
      setSubmitting(false);
    }
  }

  const errorMessage = !error
    ? null
    : "text" in error
      ? error.text
      : t(`form.errors.${error.key}`, {
          max:
            error.key === "descriptionTooLong"
              ? MAX_DESCRIPTION_LENGTH
              : MAX_NAME_LENGTH,
        });

  return (
    <DialogContent>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("form.editTitle") : t("form.createTitle")}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t("form.editDescription")
              : t("form.createDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">{t("form.name.label")}</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("form.name.placeholder")}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">
              {t("form.description.label")}
            </Label>
            <textarea
              id="project-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("form.description.placeholder")}
              className={`${fieldClass} resize-none py-2`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-type">
              {t("form.type")}
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
                  {t(`types.${type}`)}
                </option>
              ))}
            </select>
          </div>

          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="project-status">{t("form.status")}</Label>
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
                    {t(`statuses.${value}`)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {errorMessage && (
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {errorMessage}
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
            {t("common:actions.cancel")}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting
              ? t("common:actions.saving")
              : isEdit
                ? t("common:actions.save")
                : t("form.create")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}