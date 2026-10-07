import { useState, type FormEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  Copy,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  PROJECT_SETTINGS_SECTIONS,
  type ProjectSettingsId,
} from "@/components/project-settings/sections";
import { useProjectStore } from "@/stores/projectStore";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  type Project,
  type ProjectStatus,
  type ProjectType,
} from "@/types";

const PROJECT_TYPES = Object.keys(
  PROJECT_TYPE_LABELS,
) as ProjectType[];

const PROJECT_STATUSES = Object.keys(
  PROJECT_STATUS_LABELS,
) as ProjectStatus[];

const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;

const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

interface Feedback {
  kind: "success" | "error";
  text: string;
}

const errorMessage = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : fallback;

function FeedbackMessage({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;

  return (
    <p
      role={feedback.kind === "error" ? "alert" : "status"}
      className={
        feedback.kind === "error"
          ? "text-sm text-destructive"
          : "text-sm text-success"
      }
    >
      {feedback.text}
    </p>
  );
}

interface ProjectSettingsPanelProps {
  project: Project;
  section: ProjectSettingsId;
}

/**
 * Contenu d'une section des paramètres du projet, affiché dans la zone
 * centrale de l'espace de travail.
 */
export function ProjectSettingsPanel({
  project,
  section,
}: ProjectSettingsPanelProps) {
  const meta =
    PROJECT_SETTINGS_SECTIONS.find((item) => item.id === section) ??
    PROJECT_SETTINGS_SECTIONS[0];

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h2 className="text-xl font-semibold">{meta.label}</h2>
          <p className="text-sm text-muted-foreground">
            {meta.description}
          </p>
        </div>

        {section === "info" && (
          <InfoSection key={project.id} project={project} />
        )}
        {section === "status" && <StatusSection project={project} />}
        {section === "danger" && <DangerSection project={project} />}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Informations
// ----------------------------------------------------------------------------

function InfoSection({ project }: { project: Project }) {
  const updateProject = useProjectStore((state) => state.updateProject);

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [projectType, setProjectType] = useState<ProjectType>(project.type);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const unchanged =
    name.trim() === project.name &&
    description.trim() === project.description &&
    projectType === project.type;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (!trimmedName) {
      setFeedback({ kind: "error", text: "Le nom du projet est requis." });
      return;
    }

    if (trimmedName.length > MAX_NAME_LENGTH) {
      setFeedback({
        kind: "error",
        text: `Le nom ne peut pas dépasser ${MAX_NAME_LENGTH} caractères.`,
      });
      return;
    }

    if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
      setFeedback({
        kind: "error",
        text: `La description ne peut pas dépasser ${MAX_DESCRIPTION_LENGTH} caractères.`,
      });
      return;
    }

    setSaving(true);

    try {
      await updateProject({
        id: project.id,
        name: trimmedName,
        description: trimmedDescription,
        projectType,
      });

      setName(trimmedName);
      setDescription(trimmedDescription);
      setFeedback({ kind: "success", text: "Modifications enregistrées." });
    } catch (e) {
      setFeedback({
        kind: "error",
        text: errorMessage(e, "Impossible d'enregistrer les modifications."),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>Informations du projet</CardTitle>
          <CardDescription>
            Ces informations apparaissent sur le tableau de bord.
          </CardDescription>
        </CardHeader>

        <CardContent className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="settings-project-name">Nom du projet</Label>
            <Input
              id="settings-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-project-description">
              Description
            </Label>
            <textarea
              id="settings-project-description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${fieldClass} resize-none py-2`}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="settings-project-type">Type de création</Label>
            <select
              id="settings-project-type"
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

          <FeedbackMessage feedback={feedback} />
        </CardContent>

        <CardFooter className="mt-4">
          <Button type="submit" disabled={saving || unchanged}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Statut et organisation
// ----------------------------------------------------------------------------

function StatusSection({ project }: { project: Project }) {
  const updateProject = useProjectStore((state) => state.updateProject);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(changes: {
    status?: ProjectStatus;
    isFavorite?: boolean;
    isArchived?: boolean;
  }) {
    setBusy(true);
    setError(null);

    try {
      await updateProject({ id: project.id, ...changes });
    } catch (e) {
      setError(errorMessage(e, "Impossible de modifier le projet."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Statut</CardTitle>
          <CardDescription>
            Où en est ce projet ? Le changement est enregistré
            immédiatement.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Label htmlFor="settings-project-status" className="sr-only">
            Statut du projet
          </Label>
          <select
            id="settings-project-status"
            value={project.status}
            disabled={busy}
            onChange={(e) =>
              void apply({ status: e.target.value as ProjectStatus })
            }
            className={`${fieldClass} h-9 max-w-xs`}
          >
            {PROJECT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {PROJECT_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organisation</CardTitle>
          <CardDescription>
            Les favoris sont mis en avant sur le tableau de bord. Un
            projet archivé n'apparaît plus dans la liste principale.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            aria-pressed={project.isFavorite}
            onClick={() => void apply({ isFavorite: !project.isFavorite })}
          >
            <Star
              className={
                project.isFavorite
                  ? "mr-2 h-4 w-4 fill-warning text-warning"
                  : "mr-2 h-4 w-4"
              }
            />
            {project.isFavorite
              ? "Retirer des favoris"
              : "Ajouter aux favoris"}
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void apply({ isArchived: !project.isArchived })}
          >
            {project.isArchived ? (
              <ArchiveRestore className="mr-2 h-4 w-4" />
            ) : (
              <Archive className="mr-2 h-4 w-4" />
            )}
            {project.isArchived ? "Désarchiver" : "Archiver le projet"}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Duplication et suppression
// ----------------------------------------------------------------------------

function DangerSection({ project }: { project: Project }) {
  const duplicateProject = useProjectStore(
    (state) => state.duplicateProject,
  );
  const deleteProject = useProjectStore((state) => state.deleteProject);

  const [duplicating, setDuplicating] = useState(false);
  const [duplicateFeedback, setDuplicateFeedback] =
    useState<Feedback | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDuplicate() {
    setDuplicating(true);
    setDuplicateFeedback(null);

    try {
      const copy = await duplicateProject(project.id);

      setDuplicateFeedback({
        kind: "success",
        text: `La copie « ${copy.name} » a été créée. Retrouvez-la sur le tableau de bord.`,
      });
    } catch (e) {
      setDuplicateFeedback({
        kind: "error",
        text: errorMessage(e, "Impossible de dupliquer le projet."),
      });
    } finally {
      setDuplicating(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);

    try {
      // Une fois le projet retiré du store, l'espace de travail
      // redirige tout seul vers le tableau de bord.
      await deleteProject(project.id);
    } catch (e) {
      setDeleteError(errorMessage(e, "Impossible de supprimer le projet."));
      setConfirmOpen(false);
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Dupliquer le projet</CardTitle>
          <CardDescription>
            Crée une copie avec le même nom (suivi de « (copie) »), la
            même description et le même type.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-2">
          <Button
            type="button"
            variant="outline"
            disabled={duplicating}
            onClick={() => void handleDuplicate()}
          >
            <Copy className="mr-2 h-4 w-4" />
            {duplicating ? "Duplication…" : "Dupliquer"}
          </Button>

          <FeedbackMessage feedback={duplicateFeedback} />
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">
            Supprimer le projet
          </CardTitle>
          <CardDescription>
            La suppression est définitive et ne peut pas être annulée.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-2">
          <Button
            type="button"
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Supprimer le projet
          </Button>

          {deleteError && (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!deleting) setConfirmOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce projet ?</DialogTitle>
            <DialogDescription>
              Le projet « {project.name} » sera supprimé définitivement.
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-6 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting ? "Suppression…" : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}