import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Clock,
  FolderOpen,
  Plus,
  Search,
  Star,
} from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useProjectStore } from "@/stores/projectStore";
import type { Project } from "@/types";

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
 */
export default function Dashboard() {
  const navigate = useNavigate();

  const user = useAuthStore((state) => state.user);

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

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  /**
   * Liste des projets dépliée (vrai) ou repliée (faux).
   */
  const [listOpen, setListOpen] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const counts = useMemo(
    () => ({
      active: projects.filter((p) => !p.isArchived).length,
      favorites: projects.filter((p) => p.isFavorite && !p.isArchived)
        .length,
      archived: projects.filter((p) => p.isArchived).length,
    }),
    [projects],
  );

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();

    return projects
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
  }, [projects, filter, search]);

  const recent = useMemo(
    () =>
      projects
        .filter((project) => !project.isArchived && project.lastOpenedAt)
        .sort((a, b) =>
          (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""),
        )
        .slice(0, RECENT_LIMIT),
    [projects],
  );

  const searching = search.trim() !== "";

  const showRecent = filter === "all" && !searching && recent.length > 0;

  /**
   * Pendant une recherche, la liste est toujours affichée :
   * un résultat ne doit jamais rester caché derrière une section repliée.
   */
  const listVisible = listOpen || searching;

  /** Exécute une action sur un projet en gérant l'état et les erreurs. */
  async function run(project: Project, task: () => Promise<unknown>) {
    setActionError(null);
    setBusyId(project.id);

    try {
      await task();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "L'opération a échoué.",
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
          : "Impossible d'ouvrir le projet.",
      );
    }
  }

  function openCreateDialog() {
    setEditing(null);
    setFormOpen(true);
  }

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
          : "Suppression du projet impossible.",
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
      label: "Projets actifs",
      count: counts.active,
      icon: FolderOpen,
    },
    {
      id: "favorites",
      label: "Favoris",
      count: counts.favorites,
      icon: Star,
    },
    {
      id: "archived",
      label: "Archivés",
      count: counts.archived,
      icon: Archive,
    },
  ];

  const listTitle = searching
    ? "Résultats de recherche"
    : filter === "favorites"
      ? "Favoris"
      : filter === "archived"
        ? "Projets archivés"
        : "Tous les projets";

  const emptyTitle = searching
    ? "Aucun projet ne correspond"
    : filter === "favorites"
      ? "Aucun projet favori"
      : filter === "archived"
        ? "Aucun projet archivé"
        : "Aucun projet pour l'instant";

  const emptyDescription = searching
    ? "Essayez un autre terme de recherche."
    : filter === "favorites"
      ? "Cliquez sur l'étoile d'un projet pour le retrouver ici."
      : filter === "archived"
        ? "Les projets que vous archivez apparaissent ici."
        : "Créez votre premier projet pour commencer à écrire.";

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
              <h1 className="text-2xl font-semibold tracking-tight">
                Bonjour, {user?.username ?? "créateur"}
              </h1>
              <p className="text-sm text-muted-foreground">
                Bienvenue dans votre studio de conception narrative.
              </p>
            </div>

            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Nouveau projet
            </Button>
          </div>

          {/* Recherche */}
          <div className="relative mt-6">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Rechercher un projet…"
              aria-label="Rechercher un projet"
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
                Récemment ouverts
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recent.map(renderCard)}
              </div>
            </section>
          )}

          {/* Liste des projets (repliable) */}
          <section className="mt-8">
            <h2 className="mb-4 text-lg font-semibold">
              {searching ? (
                // Pendant une recherche, la liste reste ouverte : pas de bouton.
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
                    listOpen
                      ? "Fermer la liste des projets"
                      : "Afficher la liste des projets"
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
                    Chargement des projets…
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
                          <Button onClick={openCreateDialog}>
                            <Plus className="mr-2 h-4 w-4" />
                            Créer mon premier projet
                          </Button>
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

      {/* Confirmation de suppression */}
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !deletingBusy) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer ce projet ?</DialogTitle>
            <DialogDescription>
              Le projet « {deleting?.name} » sera supprimé définitivement.
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-6 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={deletingBusy}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleConfirmDelete()}
              disabled={deletingBusy}
            >
              {deletingBusy ? "Suppression…" : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StatusBar />
    </div>
  );
}