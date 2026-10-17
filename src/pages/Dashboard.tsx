import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDashboardIntent, useRegisterCommands } from "@/lib/commands";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Clock,
  FileUp,
  FolderOpen,
  Globe,
  Lock,
  Plus,
  Search,
  Star,
} from "lucide-react";
import { GanixImportDialog } from "@/components/projects/GanixImportDialog";
import { ProjectCard } from "@/components/projects/ProjectCard";
import {
  ProjectFormDialog,
  type ProjectFormValues,
} from "@/components/projects/ProjectFormDialog";
import { StatusBar } from "@/components/layout/StatusBar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { api } from "@/lib/api";
import { projectsInSpace, spaceOf } from "@/lib/projectSpace";
import { showGuideOnce } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { usePendingVisibility } from "@/stores/pendingVisibilityStore";
import { useProjectStore } from "@/stores/projectStore";
import { toast } from "@/stores/toastStore";
import type {
  GanixImportMode,
  GanixPreview,
  Project,
} from "@/types";

type Filter = "all" | "favorites" | "archived";

const RECENT_LIMIT = 3;

/**
 * Tableau de bord de l'utilisateur.
 *
 * Affiche ses projets, permet de les créer, modifier, dupliquer,
 * archiver et supprimer, et met en avant les projets récemment ouverts
 * et les favoris.
 *
 * La liste des projets peut être repliée (clic sur son titre).
 *
 * Le mode décide de l'espace affiché, sans filtre (voir `projectSpace.ts`) :
 * - sans connexion (« Commencer ») : espace public, projets publics
 *   seulement ; les projets créés sont publics ;
 * - connecté : espace privé, projets privés du compte seulement ; les
 *   projets créés sont privés.
 * La visibilité d'un projet se change dans ses paramètres.
 *
 * À la toute première visite, le guide de démarrage (Aide › Guide de
 * démarrage) s'ouvre une fois.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation(["dashboard", "projects", "common", "menus"]);

  const user = useAuthStore((state) => state.user);
  const signedIn = user !== null;
  const space = spaceOf(signedIn);

  const projects = useProjectStore((state) => state.projects);
  const loading = useProjectStore((state) => state.loading);
  const error = useProjectStore((state) => state.error);
  const fetchProjects = useProjectStore((state) => state.fetchProjects);
  const createProject = useProjectStore((state) => state.createProject);
  const updateProject = useProjectStore((state) => state.updateProject);
  const duplicateProject = useProjectStore(
    (state) => state.duplicateProject,
  );
  const deleteProject = useProjectStore((state) => state.deleteProject);
  const openProject = useProjectStore((state) => state.openProject);
  const importGanix = useProjectStore((state) => state.importGanix);
  const setVisibility = useProjectStore((state) => state.setVisibility);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  /**
   * Liste « Tous les projets » dépliée (vrai) ou repliée (faux).
   * Repliée à l'ouverture du tableau de bord ; un clic sur son titre, ou
   * sur une des cartes de filtre, la déplie.
   */
  const [listOpen, setListOpen] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Message de réussite (export, import). */
  const [notice, setNotice] = useState<string | null>(null);

  /** Import .ganix : vérification en cours, puis aperçu à confirmer. */
  const [inspecting, setInspecting] = useState(false);
  const [preview, setPreview] = useState<GanixPreview | null>(null);

  /** Guide de démarrage : ouvert une seule fois, à la première visite. */
  useEffect(() => {
    showGuideOnce();
  }, []);

  useEffect(() => {
    void fetchProjects();
    // La liste dépend de la connexion (projets privés du compte).
  }, [fetchProjects, user?.id]);

  /** Projets de l'espace courant (jamais de mélange public / privé). */
  const scoped = useMemo(
    () => projectsInSpace(projects, space),
    [projects, space],
  );


  /**
   * Projet public à rendre privé, demandé avant la connexion (création de
   * compte, configuration initiale) : appliqué dès l'arrivée du compte.
   */
  useEffect(() => {
    if (!signedIn) return;

    const projectId = usePendingVisibility.getState().take();
    if (!projectId) return;

    setVisibility(projectId, "private")
      .then((project) =>
        toast({
          tone: "success",
          message: t("projects:visibility.madePrivate", { name: project.name }),
        }),
      )
      .catch((e) =>
        toast({
          tone: "error",
          message: e instanceof Error ? e.message : t("errors.actionFailed"),
        }),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const counts = useMemo(
    () => ({
      active: scoped.filter((p) => !p.isArchived).length,
      favorites: scoped.filter((p) => p.isFavorite && !p.isArchived)
        .length,
      archived: scoped.filter((p) => p.isArchived).length,
    }),
    [scoped],
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();

    return scoped
      .filter((project) => {
        if (filter === "archived") return project.isArchived;
        if (filter === "favorites") {
          return project.isFavorite && !project.isArchived;
        }
        return !project.isArchived;
      })
      .filter(
        (project) =>
          query === "" ||
          project.name.toLowerCase().includes(query) ||
          project.description.toLowerCase().includes(query),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [scoped, filter, search]);

  const recent = useMemo(
    () =>
      scoped
        .filter((project) => !project.isArchived && project.lastOpenedAt)
        .sort((a, b) =>
          (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""),
        )
        .slice(0, RECENT_LIMIT),
    [scoped],
  );

  const searching = search.trim() !== "";

  const showRecent = filter === "all" && !searching && recent.length > 0;

  /**
   * Pendant une recherche, la liste est toujours affichée : un résultat ne
   * doit jamais rester caché derrière une section repliée. Sans aucun
   * projet, elle l'est aussi : elle porte l'invitation à créer le premier.
   */
  const listVisible = listOpen || searching || scoped.length === 0;

  /** Exécute une action sur un projet en gérant l'état et les erreurs. */
  async function run(project: Project, task: () => Promise<unknown>) {
    setActionError(null);
    setNotice(null);
    setBusyId(project.id);

    try {
      await task();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : t("errors.actionFailed"),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleOpen(project: Project) {
    setActionError(null);

    try {
      await openProject(project.id);
      navigate(`/workspace/${project.id}`);
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : t("errors.openFailed"),
      );
    }
  }

  /** Exporte un projet en `<nom du projet>.ganix`. */
  function handleExport(project: Project) {
    void run(project, async () => {
      const file = await api.exportProject(
        project.id,
        t("projects:ganix.export.dialogTitle"),
      );

      if (file) {
        setNotice(
          `${t("projects:ganix.export.done", { file })}\n${t("projects:ganix.export.notEncrypted")}`,
        );
      }
    });
  }

  /** Choisit un `.ganix`, le fait vérifier puis montre l'aperçu. */
  async function handleInspect() {
    // Import réservé aux comptes connectés (le projet importé est privé).
    if (!signedIn) return;

    setActionError(null);
    setNotice(null);
    setInspecting(true);

    try {
      const result = await api.inspectGanix(
        t("projects:ganix.import.dialogTitle"),
      );
      setPreview(result);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : t("projects:ganix.import.failed"),
      );
    } finally {
      setInspecting(false);
    }
  }

  async function handleConfirmImport(mode: GanixImportMode) {
    if (!preview) return;

    const outcome = await importGanix(preview.stagingId, mode);

    setPreview(null);
    setNotice(
      outcome.backupFile
        ? t("projects:ganix.import.replaced", {
            name: outcome.project.name,
            file: outcome.backupFile,
          })
        : t("projects:ganix.import.done", { name: outcome.project.name }),
    );

    // Le projet importé apparaît dans la liste.
    setFilter("all");
    setSearch("");
    setListOpen(true);
  }

  function handleCancelImport() {
    if (preview) {
      // Rien à signaler si la zone d'attente a déjà disparu.
      void api.cancelGanixImport(preview.stagingId).catch(() => {});
    }
    setPreview(null);
  }

  function openCreateDialog() {
    setEditing(null);
    setFormOpen(true);
  }

  // Menus et raccourcis : Ctrl+N crée un projet ; « Importer un .ganix ».
  useRegisterCommands({
    new: { label: t("menus:file.newIn.newProject"), run: openCreateDialog },
    importGanix: {
      disabled: inspecting || !signedIn,
      run: () => void handleInspect(),
    },
  });

  // Action demandée depuis un menu avant d'arriver ici.
  const intent = useDashboardIntent((state) => state.intent);
  useEffect(() => {
    if (!intent) return;
    const taken = useDashboardIntent.getState().take();
    if (taken === "newProject") openCreateDialog();
    if (taken === "importGanix") void handleInspect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent]);

  function openEditDialog(project: Project) {
    setEditing(project);
    setFormOpen(true);
  }

  async function handleSubmit(values: ProjectFormValues) {
    if (editing) {
      await updateProject({
        id: editing.id,
        name: values.name,
        description: values.description,
        projectType: values.projectType,
        status: values.status,
      });
      return;
    }

    const created = await createProject({
      name: values.name,
      description: values.description,
      projectType: values.projectType,
    });

    // Ouvre immédiatement le projet créé.
    await openProject(created.id);
    navigate(`/workspace/${created.id}`);
  }

  async function handleConfirmDelete() {
    if (!deleting) return;

    setDeletingBusy(true);
    setActionError(null);

    try {
      await deleteProject(deleting.id);
      setDeleting(null);
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : t("errors.deleteFailed"),
      );
      setDeleting(null);
    } finally {
      setDeletingBusy(false);
    }
  }

  function renderCard(project: Project) {
    return (
      <ProjectCard
        key={project.id}
        project={project}
        busy={busyId === project.id}
        onOpen={(item) => void handleOpen(item)}
        onToggleFavorite={(item) =>
          void run(item, () =>
            updateProject({
              id: item.id,
              isFavorite: !item.isFavorite,
            }),
          )
        }
        onToggleArchive={(item) =>
          void run(item, () =>
            updateProject({
              id: item.id,
              isArchived: !item.isArchived,
            }),
          )
        }
        onEdit={openEditDialog}
        onDuplicate={(item) =>
          void run(item, () => duplicateProject(item.id))
        }
        onExport={handleExport}
        onDelete={setDeleting}
      />
    );
  }

  const filters: {
    id: Filter;
    label: string;
    count: number;
    icon: typeof FolderOpen;
  }[] = [
    {
      id: "all",
      label: t("filters.all"),
      count: counts.active,
      icon: FolderOpen,
    },
    {
      id: "favorites",
      label: t("filters.favorites"),
      count: counts.favorites,
      icon: Star,
    },
    {
      id: "archived",
      label: t("filters.archived"),
      count: counts.archived,
      icon: Archive,
    },
  ];

  /** Ce que montre la liste : une recherche prime sur le filtre choisi. */
  const listMode = searching ? "search" : filter;

  const listTitle = t(`list.title.${listMode}`);
  const emptyTitle = t(`empty.${listMode}.title`);
  const emptyDescription = t(`empty.${listMode}.description`);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      {/*
        Le conteneur qui défile occupe toute la largeur : la barre de
        défilement se place ainsi tout à droite de la fenêtre. Le contenu,
        lui, reste centré dans une colonne de largeur limitée.
      */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          {/* En-tête */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {signedIn
                    ? t("greeting", { name: user.username })
                    : t("guest.title")}
                </h1>

                {/* Espace courant : privé (connecté) ou public */}
                <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {space === "private" ? (
                    <Lock className="h-3 w-3" />
                  ) : (
                    <Globe className="h-3 w-3" />
                  )}
                  {t(`space.${space}`)}
                </span>
              </div>
              {signedIn && (
                <p className="text-sm text-muted-foreground">
                  {t("subtitle")}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {signedIn && (
                <Button
                  variant="outline"
                  disabled={inspecting}
                  onClick={() => void handleInspect()}
                >
                  <FileUp className="mr-2 h-4 w-4" />
                  {inspecting
                    ? t("projects:ganix.import.checking")
                    : t("projects:ganix.import.button")}
                </Button>
              )}

              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                {t("newProject")}
              </Button>
            </div>
          </div>

          {/* Recherche */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t("search.placeholder")}
              aria-label={t("search.label")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Erreurs */}
          {(error || actionError) && (
            <div
              role="alert"
              className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {actionError ?? error}
            </div>
          )}

          {notice && !actionError && (
            <div
              role="status"
              className="mt-6 flex items-start justify-between gap-4 rounded-md border border-success/30 bg-success/5 px-4 py-3 text-sm text-success"
            >
              <span className="whitespace-pre-line">{notice}</span>
              <button
                type="button"
                className="shrink-0 text-xs underline-offset-2 hover:underline"
                onClick={() => setNotice(null)}
              >
                {t("common:actions.close")}
              </button>
            </div>
          )}

          {/* Filtres avec compteurs */}
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {filters.map(({ id, label, count, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => {
                  setFilter(id);
                  // Choisir un filtre déplie la liste pour en montrer le résultat.
                  setListOpen(true);
                }}
                className="text-left"
              >
                <Card
                  className={cn(
                    "transition-colors hover:bg-accent/50",
                    filter === id && "ring-2 ring-primary",
                  )}
                >
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">
                      {label}
                    </CardTitle>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{count}</div>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>

          {/* Récemment ouverts */}
          {showRecent && (
            <section className="mt-8">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {t("recent")}
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recent.map(renderCard)}
              </div>
            </section>
          )}

          {/* Liste des projets (repliable) */}
          <section className="mt-8">
            <h2 className="mb-4 text-lg font-semibold">
              {searching || scoped.length === 0 ? (
                // Liste forcément ouverte (recherche, aucun projet) : pas de bouton.
                <span className="flex items-center gap-2">
                  {listTitle}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({visible.length})
                  </span>
                </span>
              ) : (
                <button
                  type="button"
                  aria-expanded={listOpen}
                  aria-controls={listOpen ? "projects-list" : undefined}
                  title={
                    listOpen ? t("list.collapse") : t("list.expand")
                  }
                  onClick={() => setListOpen((open) => !open)}
                  className="flex items-center gap-2 rounded-md text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {listOpen ? (
                    <ChevronDown className="h-5 w-5 shrink-0" />
                  ) : (
                    <ChevronRight className="h-5 w-5 shrink-0" />
                  )}

                  {listTitle}

                  <span className="text-sm font-normal text-muted-foreground">
                    ({visible.length})
                  </span>
                </button>
              )}
            </h2>

            {listVisible && (
              <div id="projects-list">
                {loading && projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("list.loading")}
                  </p>
                ) : visible.length === 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>{emptyTitle}</CardTitle>
                      <CardDescription>{emptyDescription}</CardDescription>
                    </CardHeader>
                    {filter === "all" &&
                      !searching &&
                      projects.length === 0 && (
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            <Button onClick={openCreateDialog}>
                              <Plus className="mr-2 h-4 w-4" />
                              {t("empty.createFirst")}
                            </Button>
                            {signedIn && (
                              <Button
                                variant="outline"
                                disabled={inspecting}
                                onClick={() => void handleInspect()}
                              >
                                <FileUp className="mr-2 h-4 w-4" />
                                {t("projects:ganix.import.button")}
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      )}
                  </Card>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {visible.map(renderCard)}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Création / modification */}
      <ProjectFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        project={editing}
        onSubmit={handleSubmit}
      />

      {/* Import .ganix : aperçu et confirmation */}
      <GanixImportDialog
        preview={preview}
        onConfirm={handleConfirmImport}
        onCancel={handleCancelImport}
      />

      {/* Confirmation de suppression */}
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !deletingBusy) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("delete.title")}</DialogTitle>
            <DialogDescription>
              {t("delete.description", { name: deleting?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-6 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={deletingBusy}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmDelete()}
              disabled={deletingBusy}
            >
              {deletingBusy ? t("delete.deleting") : t("delete.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StatusBar />
    </div>
  );
}