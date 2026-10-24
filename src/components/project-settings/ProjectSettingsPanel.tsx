import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Archive,
  ArchiveRestore,
  Copy,
  Download,
  Loader2,
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
import { CharacterSettingsSection } from "@/components/characters/CharacterSettingsSection";
import { LocationSettingsSection } from "@/components/locations/LocationSettingsSection";
import { WorldSettingsSection } from "@/components/world/WorldSettingsSection";
import { StructureSettingsSection } from "@/components/structure/StructureSettingsSection";
import { PlotSettingsSection } from "@/components/plot/PlotSettingsSection";
import { NoteSettingsSection } from "@/components/notes/NoteSettingsSection";
import {
  PROJECT_SETTINGS_SECTIONS,
  type ProjectSettingsId,
} from "@/components/project-settings/sections";
import { VisibilityCard } from "@/components/project-settings/VisibilityCard";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useUnsavedChanges } from "@/lib/unsavedChanges";
import { notifyError, notifySaved } from "@/lib/notify";
import { useProjectStore } from "@/stores/projectStore";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  type Project,
  type ProjectStatus,
  type ProjectType,
} from "@/types";
import { errorText } from "@/lib/errors";

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

const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Cartes à couleur de fond unique (`bg-card`), en-tête et pied compris.
 *
 * - gap-0 / py-0 : pas de bande vide au-dessus de l'en-tête ni sous le pied ;
 * - ring-0 + border : même contour que les blocs de l'accueil du projet.
 */
const cardClass = "gap-0 border py-0 shadow-sm ring-0";
const cardHeaderClass = "border-b px-6 py-5";
const cardFooterClass = "border-t bg-transparent px-6 py-4";

/** Messages de ce panneau (clés de `projectSettings.json`). */
type PanelMessage =
  | "info.saved"
  | "info.saveFailed"
  | "status.failed"
  | "danger.duplicateFailed"
  | "danger.deleteFailed";

/**
 * Retour affiché sous un formulaire.
 *
 * On garde une clé de traduction plutôt qu'un texte : le message suit la
 * langue si elle change pendant qu'il est affiché. `text` ne sert qu'aux
 * erreurs renvoyées par Rust (encore en français).
 */
type Feedback =
  | { kind: "success" | "error"; key: PanelMessage }
  | {
      kind: "error";
      formKey: "nameRequired" | "nameTooLong" | "descriptionTooLong";
    }
  | { kind: "success"; copied: string }
  | { kind: "success"; exported: string }
  | { kind: "error"; text: string };

/** Erreur de Rust si elle a un message, sinon le message de secours traduit. */
const failure = (e: unknown, key: PanelMessage): Feedback =>
  e instanceof Error ? { kind: "error", text: e.message } : { kind: "error", key };

/**
 * Retour d'une action (enregistré, copié, exporté, erreur) : affiché en
 * notification, pas dans la page, pour que rien ne bouge. Le composant ne
 * dessine rien ; il annonce chaque nouveau retour.
 */
function FeedbackMessage({
  feedback,
}: {
  feedback: Feedback | null;
}) {
  const { t } = useTranslation(["projectSettings", "projects", "common"]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const text =
      "key" in feedback
        ? t(feedback.key)
        : "formKey" in feedback
          ? t(`projects:form.errors.${feedback.formKey}`, {
              max:
                feedback.formKey === "descriptionTooLong"
                  ? MAX_DESCRIPTION_LENGTH
                  : MAX_NAME_LENGTH,
            })
          : "copied" in feedback
            ? t("danger.duplicated", { name: feedback.copied })
            : "exported" in feedback
              ? t("projects:ganix.export.done", { file: feedback.exported })
              : feedback.text;

    if (feedback.kind === "error") {
      notifyError(text, "project-settings");
    } else {
      notifySaved(text, "project-settings");
    }
    // Un nouveau retour = un nouvel objet : annoncé une fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback]);

  return null;
}

interface ProjectSettingsPanelProps {
  project: Project;
  section: ProjectSettingsId;
}

/**
 * Contenu d'une section des paramètres du projet.
 *
 * Utilise la même structure et les mêmes dimensions que
 * WorkspaceHome et les autres vues principales du workspace.
 */
export function ProjectSettingsPanel({
  project,
  section,
}: ProjectSettingsPanelProps) {
  // Abonne le panneau aux changements de langue : le titre et la
  // description de la section (lus via `meta`) sont alors relus.
  useTranslation(["projectSettings", "common"]);

  const meta =
    PROJECT_SETTINGS_SECTIONS.find(
      (item) => item.id === section,
    ) ?? PROJECT_SETTINGS_SECTIONS[0];

  return (
    <main className="flex min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-8 pb-24 lg:px-10">
        {/* ================================================================
            EN-TÊTE
            ================================================================ */}

        <header className="mb-6">

          <h1 className="sr-only">{meta.label}</h1>

          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {meta.description}
          </p>
        </header>

        {/* ================================================================
            CONTENU
            ================================================================ */}

        {section === "info" && (
          <InfoSection
            key={project.id}
            project={project}
          />
        )}

        {section === "status" && (
          <StatusSection project={project} />
        )}

        {section === "characters" && (
          <CharacterSettingsSection projectId={project.id} />
        )}

        {section === "locations" && (
          <LocationSettingsSection projectId={project.id} />
        )}

        {section === "items" && <WorldSettingsSection projectId={project.id} module="item" />}

        {section === "species" && <WorldSettingsSection projectId={project.id} module="species" />}

        {section === "structure" && (
          <StructureSettingsSection project={project} />
        )}

        {section === "plot" && (
          <PlotSettingsSection projectId={project.id} />
        )}

        {section === "notes" && <NoteSettingsSection projectId={project.id} />}

        {section === "danger" && (
          <DangerSection project={project} />
        )}
      </div>
    </main>
  );
}

// ----------------------------------------------------------------------------
// Informations
// ----------------------------------------------------------------------------

function InfoSection({ project }: { project: Project }) {
  const { t } = useTranslation(["projectSettings", "projects", "common"]);
  const updateProject = useProjectStore(
    (state) => state.updateProject,
  );

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(
    project.description,
  );
  const [projectType, setProjectType] =
    useState<ProjectType>(project.type);

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] =
    useState<Feedback | null>(null);

  const unchanged =
    name.trim() === project.name &&
    description.trim() === project.description &&
    projectType === project.type;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  /**
   * Enregistre ; renvoie `false` si les champs sont invalides ou si
   * l'enregistrement échoue (le message s'affiche sous le formulaire).
   */
  async function save(): Promise<boolean> {
    setFeedback(null);

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    if (!trimmedName) {
      setFeedback({ kind: "error", formKey: "nameRequired" });
      return false;
    }

    if (trimmedName.length > MAX_NAME_LENGTH) {
      setFeedback({ kind: "error", formKey: "nameTooLong" });
      return false;
    }

    if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
      setFeedback({ kind: "error", formKey: "descriptionTooLong" });
      return false;
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

      setFeedback({ kind: "success", key: "info.saved" });
      return true;
    } catch (e) {
      setFeedback(failure(e, "info.saveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Point sur l'onglet, question à la fermeture, enregistrement automatique.
  useUnsavedChanges({
    dirty: !unchanged,
    save,
    revision: `${name}\u0000${description}\u0000${projectType}`,
  });

  return (
    <Card className={cardClass}>
      <form onSubmit={handleSubmit}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("info.title")}</CardTitle>

          <CardDescription>{t("info.description")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 px-6 py-6">
          {/* Nom */}
          <div className="space-y-2">
            <Label htmlFor="settings-project-name">
              {t("projects:form.name.label")}
            </Label>

            <Input
              id="settings-project-name"
              placeholder={t("common:placeholders.projectName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="settings-project-description">
              {t("info.descriptionField")}
            </Label>

            <textarea
              id="settings-project-description"
              placeholder={t("common:placeholders.projectDescription")}
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`${fieldClass} resize-y py-2 leading-6`}
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label htmlFor="settings-project-type">
              {t("projects:form.type")}
            </Label>

            <select
              id="settings-project-type"
              value={projectType}
              onChange={(e) =>
                setProjectType(
                  e.target.value as ProjectType,
                )
              }
              className={`${fieldClass} h-9`}
            >
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`projects:types.${type}`)}
                </option>
              ))}
            </select>
          </div>

          <FeedbackMessage feedback={feedback} />
        </CardContent>

        <CardFooter className={cardFooterClass}>
          <Button
            type="submit"
            disabled={saving || unchanged}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t("common:actions.save")}
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
  const { t } = useTranslation(["projectSettings", "projects", "common"]);
  const updateProject = useProjectStore(
    (state) => state.updateProject,
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] =
    useState<Feedback | null>(null);

  async function apply(changes: {
    status?: ProjectStatus;
    isFavorite?: boolean;
    isArchived?: boolean;
  }) {
    setBusy(true);
    setError(null);

    try {
      await updateProject({
        id: project.id,
        ...changes,
      });
    } catch (e) {
      setError(failure(e, "status.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Statut */}
      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("status.title")}</CardTitle>

          <CardDescription>{t("status.description")}</CardDescription>
        </CardHeader>

        <CardContent className="px-6 py-6">
          <Label
            htmlFor="settings-project-status"
            className="sr-only"
          >
            {t("status.label")}
          </Label>

          <select
            id="settings-project-status"
            value={project.status}
            disabled={busy}
            onChange={(e) =>
              void apply({
                status: e.target.value as ProjectStatus,
              })
            }
            className={`${fieldClass} h-10 max-w-sm`}
          >
            {PROJECT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`projects:statuses.${value}`)}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Organisation */}
      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("organization.title")}</CardTitle>

          <CardDescription>{t("organization.description")}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-wrap gap-3 px-6 py-6">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            aria-pressed={project.isFavorite}
            onClick={() =>
              void apply({
                isFavorite: !project.isFavorite,
              })
            }
          >
            <Star
              className={
                project.isFavorite
                  ? "mr-2 h-4 w-4 fill-warning text-warning"
                  : "mr-2 h-4 w-4"
              }
            />

            {project.isFavorite
              ? t("projects:card.removeFavorite")
              : t("projects:card.addFavorite")}
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void apply({
                isArchived: !project.isArchived,
              })
            }
          >
            {project.isArchived ? (
              <ArchiveRestore className="mr-2 h-4 w-4" />
            ) : (
              <Archive className="mr-2 h-4 w-4" />
            )}

            {project.isArchived
              ? t("organization.unarchive")
              : t("projects:card.archive")}
          </Button>
        </CardContent>
      </Card>

      {/* Visibilité : public / privé */}
      <VisibilityCard
        project={project}
        cardClass={cardClass}
        cardHeaderClass={cardHeaderClass}
      />

      <FeedbackMessage feedback={error} />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Duplication et suppression
// ----------------------------------------------------------------------------

function DangerSection({ project }: { project: Project }) {
  const { t } = useTranslation(["projectSettings", "dashboard", "projects", "common"]);
  const duplicateProject = useProjectStore(
    (state) => state.duplicateProject,
  );

  const deleteProject = useProjectStore(
    (state) => state.deleteProject,
  );

  const [duplicating, setDuplicating] =
    useState(false);

  const [duplicateFeedback, setDuplicateFeedback] =
    useState<Feedback | null>(null);

  const [exporting, setExporting] = useState(false);

  const [exportFeedback, setExportFeedback] =
    useState<Feedback | null>(null);

  const [confirmOpen, setConfirmOpen] =
    useState(false);

  const [deleting, setDeleting] =
    useState(false);

  const [deleteError, setDeleteError] =
    useState<Feedback | null>(null);

  async function handleExport() {
    setExporting(true);
    setExportFeedback(null);

    try {
      const file = await api.exportProject(
        project.id,
        t("projects:ganix.export.dialogTitle"),
      );

      if (file) {
        setExportFeedback({ kind: "success", exported: file });
      }
    } catch (e) {
      setExportFeedback(
        { kind: "error", text: errorText(e, "projects:ganix.export.failed") },
      );
    } finally {
      setExporting(false);
    }
  }

  async function handleDuplicate() {
    setDuplicating(true);
    setDuplicateFeedback(null);

    try {
      const copy = await duplicateProject(project.id);

      setDuplicateFeedback({ kind: "success", copied: copy.name });
    } catch (e) {
      setDuplicateFeedback(failure(e, "danger.duplicateFailed"));
    } finally {
      setDuplicating(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);

    try {
      // Une fois le projet retiré du store, l'espace de travail
      // redirige automatiquement vers le tableau de bord.
      await deleteProject(project.id);
    } catch (e) {
      setDeleteError(failure(e, "danger.deleteFailed"));

      setConfirmOpen(false);
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Export .ganix */}
      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("danger.exportTitle")}</CardTitle>

          <CardDescription>{t("danger.exportDescription")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 px-6 py-6">
          <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
            {t("projects:ganix.export.notEncrypted")}
          </p>

          <Button
            type="button"
            variant="outline"
            disabled={exporting}
            onClick={() => void handleExport()}
          >
            <Download className="mr-2 h-4 w-4" />

            {exporting ? t("danger.exporting") : t("danger.export")}
          </Button>

          <FeedbackMessage feedback={exportFeedback} />
        </CardContent>
      </Card>

      {/* Duplication */}
      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("danger.duplicateTitle")}</CardTitle>

          <CardDescription>{t("danger.duplicateDescription")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 px-6 py-6">
          <Button
            type="button"
            variant="outline"
            disabled={duplicating}
            onClick={() => void handleDuplicate()}
          >
            <Copy className="mr-2 h-4 w-4" />

            {duplicating
              ? t("danger.duplicating")
              : t("danger.duplicate")}
          </Button>

          <FeedbackMessage
            feedback={duplicateFeedback}
          />
        </CardContent>
      </Card>

      {/* Suppression : même fond unique, signalée par la bordure et le titre rouges. */}
      <Card className={cn(cardClass, "border-destructive/40")}>
        <CardHeader
          className={cn(cardHeaderClass, "border-destructive/20")}
        >
          <CardTitle className="text-destructive">
            {t("danger.deleteTitle")}
          </CardTitle>

          <CardDescription>{t("danger.deleteDescription")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 px-6 py-6">
          <Button
            type="button"
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t("danger.deleteTitle")}
          </Button>

          <FeedbackMessage feedback={deleteError} />
        </CardContent>
      </Card>

      {/* Confirmation */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!deleting) {
            setConfirmOpen(open);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard:delete.title")}</DialogTitle>

            <DialogDescription>
              {t("dashboard:delete.description", { name: project.name })}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-6 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
            >
              {t("common:actions.cancel")}
            </Button>

            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting
                ? t("dashboard:delete.deleting")
                : t("dashboard:delete.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
