import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ArrowLeft, FileText, X } from "lucide-react";

import {
  ActivityBar,
  type ActivityId,
} from "@/components/layout/ActivityBar";
import { SideBar } from "@/components/layout/SideBar";
import { StatusBar } from "@/components/layout/StatusBar";
import { ProjectSettingsPanel } from "@/components/project-settings/ProjectSettingsPanel";

import {
  PROJECT_SETTINGS_SECTIONS,
  type ProjectSettingsId,
} from "@/components/project-settings/sections";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/stores/projectStore";

import {
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
} from "@/types";

/**
 * Onglets disponibles dans la zone centrale.
 *
 * null = aucun onglet ouvert.
 */
type TabId = "home" | "settings" | null;

/**
 * Style commun des onglets.
 */
const tabClass = (active: boolean) =>
  cn(
    "flex items-center gap-2 border-t-2 px-4 py-1.5 text-sm",
    active
      ? "border-primary bg-background"
      : "border-transparent text-muted-foreground hover:text-foreground",
  );

export default function Workspace() {
  const navigate = useNavigate();

  const { projectId } = useParams<{
    projectId: string;
  }>();

  /**
   * Projet actuellement ouvert.
   */
  const project = useProjectStore((state) =>
    state.projects.find(
      (item) => item.id === projectId,
    ),
  );

  /**
   * Charge le projet depuis Rust si nécessaire.
   */
  const openProject = useProjectStore(
    (state) => state.openProject,
  );

  /**
   * Réinitialise le projet courant lorsqu'on quitte le workspace.
   */
  const closeProject = useProjectStore(
    (state) => state.closeProject,
  );

  /**
   * Vue actuellement sélectionnée dans l'ActivityBar.
   */
  const [view, setView] =
    useState<ActivityId>("explorer");

  /**
   * État d'ouverture de la sidebar.
   */
  const [panelOpen, setPanelOpen] =
    useState(true);

  /**
   * Indique qu'un projet demandé n'a pas pu être chargé.
   */
  const [missing, setMissing] = useState(false);

  /**
   * Section des paramètres actuellement ouverte.
   *
   * null = aucune section de paramètres ouverte.
   */
  const [openSection, setOpenSection] =
    useState<ProjectSettingsId | null>(null);

  /**
   * Onglet actuellement actif.
   *
   * null = aucun onglet ouvert.
   */
  const [activeTab, setActiveTab] =
    useState<TabId>("home");

  /**
   * Devient vrai dès que le projet a été vu dans le store.
   *
   * Si le projet disparaît ensuite du store, cela signifie
   * généralement qu'il a été supprimé : on retourne alors
   * au tableau de bord.
   */
  const seenRef = useRef(false);

  if (project) {
    seenRef.current = true;
  }

  /**
   * Charge le projet depuis Rust s'il n'est pas encore
   * présent dans le store.
   *
   * Rust vérifie que le projet appartient bien au compte connecté.
   */
  useEffect(() => {
    if (!projectId || project || seenRef.current) {
      return;
    }

    let cancelled = false;

    openProject(projectId).catch(() => {
      if (!cancelled) {
        setMissing(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [projectId, project, openProject]);

  /**
   * Le projet courant est réinitialisé lorsqu'on quitte
   * l'espace de travail.
   */
  useEffect(() => {
    return () => {
      closeProject();
    };
  }, [closeProject]);

  /**
   * Si le projet est inexistant ou a été supprimé,
   * retour au tableau de bord.
   */
  if (
    !projectId ||
    missing ||
    (!project && seenRef.current)
  ) {
    return <Navigate to="/dashboard" replace />;
  }

  /**
   * Affichage pendant le chargement du projet.
   */
  if (!project) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">
          Chargement du projet…
        </p>
      </div>
    );
  }

  /**
   * Informations de la section de paramètres actuellement ouverte.
   */
  const openSectionMeta =
    PROJECT_SETTINGS_SECTIONS.find(
      (section) => section.id === openSection,
    );

  /**
   * Sélection d'une vue dans l'ActivityBar.
   */
  function select(id: ActivityId) {
    /**
     * Si on clique une seconde fois sur la même icône
     * alors que le panneau est ouvert, on le ferme.
     */
    if (id === view && panelOpen) {
      setPanelOpen(false);
      return;
    }

    setView(id);
    setPanelOpen(true);
  }

  /**
   * Ouvre une section des paramètres dans un onglet.
   */
  function selectSettingsSection(
    id: ProjectSettingsId,
  ) {
    setOpenSection(id);
    setActiveTab("settings");
  }

  /**
   * Ferme l'onglet des paramètres.
   *
   * On ne ferme PAS le projet.
   * On ferme uniquement la vue correspondante.
   */
  function closeSettingsTab() {
    setOpenSection(null);

    /**
     * Si l'utilisateur ferme l'onglet actif,
     * on retourne à l'accueil du projet si celui-ci
     * est toujours ouvert.
     */
    setActiveTab("home");
  }

  /**
   * Ferme l'onglet "Accueil du projet".
   *
   * Le projet reste ouvert.
   * Seul l'onglet central est fermé.
   */
  function closeHomeTab() {
    setActiveTab(null);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex min-h-0 flex-1">
        {/* =========================================================
            ACTIVITY BAR
            ========================================================= */}
        <ActivityBar
          active={view}
          panelOpen={panelOpen}
          onSelect={select}
        />

        {/* =========================================================
            SIDEBAR
            ========================================================= */}
        {panelOpen && (
          <SideBar
            view={view}
            projectName={project.name}
            settingsSection={openSection}
            onSelectSettingsSection={
              selectSettingsSection
            }
          />
        )}

        {/* =========================================================
            ZONE CENTRALE
            ========================================================= */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* =======================================================
              ONGLET DE LA ZONE CENTRALE
              ======================================================= */}
          <div
            role="tablist"
            aria-label="Onglets du projet"
            className="flex h-9 shrink-0 items-end border-b border-border bg-card"
          >
            {/* =====================================================
                ONGLET ACCUEIL DU PROJET
                ===================================================== */}
            {activeTab === "home" && (
              <div
                className={cn(
                  tabClass(true),
                  "gap-1 pr-2",
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={true}
                  onClick={() =>
                    setActiveTab("home")
                  }
                  className="flex items-center gap-2"
                >
                  <FileText className="h-3.5 w-3.5 text-primary" />

                  Accueil du projet
                </button>

                {/* Bouton de fermeture */}
                <button
                  type="button"
                  aria-label="Fermer l'onglet Accueil du projet"
                  title="Fermer l'onglet"
                  onClick={closeHomeTab}
                  className="flex h-5 w-5 items-center justify-center rounded hover:bg-secondary"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* =====================================================
                ONGLET PARAMÈTRES
                ===================================================== */}
            {openSectionMeta && (
              <div
                className={cn(
                  tabClass(
                    activeTab === "settings",
                  ),
                  "gap-1 pr-2",
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={
                    activeTab === "settings"
                  }
                  onClick={() =>
                    setActiveTab("settings")
                  }
                  className="flex items-center gap-2"
                >
                  <openSectionMeta.icon className="h-3.5 w-3.5 text-primary" />

                  {openSectionMeta.label}
                </button>

                {/* Bouton de fermeture */}
                <button
                  type="button"
                  aria-label={`Fermer l'onglet ${openSectionMeta.label}`}
                  title="Fermer l'onglet"
                  onClick={closeSettingsTab}
                  className="flex h-5 w-5 items-center justify-center rounded hover:bg-secondary"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          {/* =======================================================
              CONTENU DE L'ONGLET ACTIF
              ======================================================= */}

          {/* -------------------------------------------------------
              PARAMÈTRES
              ------------------------------------------------------- */}
          {activeTab === "settings" &&
          openSection ? (
            <ProjectSettingsPanel
              project={project}
              section={openSection}
            />
          ) : activeTab === "home" ? (
            /* -----------------------------------------------------
               ACCUEIL DU PROJET
               ----------------------------------------------------- */
            <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-8 text-center">
              <h2 className="text-xl font-semibold">
                {project.name}
              </h2>

              <p className="text-xs text-muted-foreground">
                {PROJECT_TYPE_LABELS[
                  project.type
                ]}{" "}
                ·{" "}
                {PROJECT_STATUS_LABELS[
                  project.status
                ]}
                {project.isArchived
                  ? " · Archivé"
                  : ""}
              </p>

              {project.description && (
                <p className="max-w-md whitespace-pre-line text-sm text-muted-foreground">
                  {project.description}
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                Créé le{" "}
                {format(
                  new Date(project.createdAt),
                  "d MMMM yyyy",
                  {
                    locale: fr,
                  },
                )}{" "}
                · Modifié le{" "}
                {format(
                  new Date(project.updatedAt),
                  "d MMMM yyyy",
                  {
                    locale: fr,
                  },
                )}
              </p>

              <p className="max-w-md text-sm text-muted-foreground">
                Choisissez un élément dans
                l'explorateur pour l'ouvrir. Les
                réglages du projet sont accessibles
                avec l'engrenage en bas à gauche.
              </p>

              <Button
                variant="outline"
                onClick={() =>
                  navigate("/dashboard")
                }
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour au tableau de bord
              </Button>
            </div>
          ) : (
            /* -----------------------------------------------------
               AUCUN ONGLET OUVERT
               ----------------------------------------------------- */
            <div className="flex flex-1 items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-center">
                <FileText className="h-8 w-8 text-muted-foreground/50" />

                <p className="text-sm text-muted-foreground">
                  Aucun onglet ouvert
                </p>

                <p className="text-xs text-muted-foreground">
                  Choisissez un élément dans
                  l'explorateur pour l'ouvrir.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* =========================================================
          STATUS BAR
          ========================================================= */}
      <StatusBar />
    </div>
  );
}