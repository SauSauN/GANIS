import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useParams } from "react-router-dom";
import { FileText, type LucideIcon } from "lucide-react";

import { ActivityBar } from "@/components/layout/ActivityBar";
import { UnsavedChangesDialog } from "@/components/layout/UnsavedChangesDialog";
import { useUnsavedQueue } from "@/components/layout/useUnsavedQueue";
import { SideBar } from "@/components/layout/SideBar";
import { StatusBar } from "@/components/layout/StatusBar";
import {
  HOME_TAB,
  findFeature,
  type ModuleId,
} from "@/components/workspace/modules";
import {
  WorkspaceTabs,
  type TabInfo,
} from "@/components/workspace/WorkspaceTabs";
import { WorkspaceView } from "@/components/workspace/WorkspaceView";

import i18n from "@/i18n";
import { cn } from "@/lib/utils";
import {
  setRailExpanded,
  useRailExpanded,
} from "@/lib/preferences";
import {
  addTab,
  closeTabs as closeTabsInLayout,
  initialLayout,
  moveTab as moveTabInLayout,
  savePinnedTabs,
  shiftTab as shiftTabInLayout,
  tabsToClose,
  togglePin as togglePinInLayout,
  type CloseScope,
  type TabLayout,
} from "@/lib/tabLayout";
import {
  UnsavedTabContext,
  useUnsavedStore,
} from "@/lib/unsavedChanges";
import { useProjectStore } from "@/stores/projectStore";

/**
 * Libellé et icône d'un onglet.
 *
 * Appelée pendant le rendu : le libellé suit donc la langue courante
 * (le composant se re-rend au changement de langue via `useTranslation`).
 */
function tabMeta(
  tabId: string,
): { label: string; icon: LucideIcon } | null {
  if (tabId === HOME_TAB) {
    return { label: i18n.t("workspace:homeTab"), icon: FileText };
  }

  const found = findFeature(tabId);

  return found
    ? { label: found.feature.label, icon: found.feature.icon }
    : null;
}

export default function Workspace() {
  const { t } = useTranslation(["workspace", "unsaved"]);

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
   * Barre de gauche : icônes + noms (vrai) ou icônes seules (faux).
   * Le choix est mémorisé sur l'appareil.
   */
  const railExpanded = useRailExpanded();

  /**
   * Module sélectionné dans la barre de gauche.
   *
   * Au départ, c'est le module qui contient l'onglet ouvert à l'arrivée
   * (l'accueil du projet, donc « Détails ») : la barre de gauche et la
   * zone centrale restent ainsi toujours cohérentes.
   */
  const [activeModule, setActiveModule] = useState<ModuleId>(
    () => findFeature(HOME_TAB)?.module.id ?? "details",
  );

  /**
   * État d'ouverture du panneau du milieu.
   */
  const [panelOpen, setPanelOpen] =
    useState(true);

  /**
   * Indique qu'un projet demandé n'a pas pu être chargé.
   */
  const [missing, setMissing] = useState(false);

  /**
   * Onglets ouverts dans la zone centrale : leur ordre et ceux qui
   * sont épinglés (toujours regroupés au début).
   *
   * Chaque onglet est identifié par l'identifiant d'une
   * fonctionnalité (voir `modules.ts`), ou par `home`.
   * Les onglets épinglés sont mémorisés par projet et retrouvés
   * à la prochaine ouverture.
   */
  const [layout, setLayout] = useState<TabLayout>(() =>
    initialLayout(
      projectId ?? "",
      HOME_TAB,
      (id) => tabMeta(id) !== null,
    ),
  );

  /**
   * Onglet actuellement actif.
   *
   * null = aucun onglet ouvert.
   */
  const [activeTab, setActiveTab] =
    useState<string | null>(HOME_TAB);

  /**
   * Devient vrai dès que le projet a été vu dans le store.
   *
   * Si le projet disparaît ensuite du store, cela signifie
   * généralement qu'il a été supprimé : on retourne alors
   * au tableau de bord.
   */
  const seenRef = useRef(false);

  /** Onglets avec des modifications non enregistrées (point ● sur l'onglet). */
  const unsavedEntries = useUnsavedStore((state) => state.entries);

  /**
   * Question « Enregistrer ? » avant de fermer des onglets modifiés,
   * posée pour chaque onglet, l'un après l'autre.
   */
  const closeQueue = useUnsavedQueue();

  /**
   * Dernière disposition et dernier onglet actif : une fermeture qui suit un
   * enregistrement (asynchrone) doit partir de l'état à jour.
   */
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

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
   * Mémorise les onglets épinglés de ce projet.
   */
  useEffect(() => {
    if (projectId) {
      savePinnedTabs(projectId, layout.pinned);
    }
  }, [projectId, layout.pinned]);

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
          {t("loading")}
        </p>
      </div>
    );
  }

  /**
   * Sélection d'un module dans la barre de gauche.
   */
  function selectModule(id: ModuleId) {
    /**
     * Si on clique une seconde fois sur le même module
     * alors que le panneau est ouvert, on le ferme.
     */
    if (id === activeModule && panelOpen) {
      setPanelOpen(false);
      return;
    }

    setActiveModule(id);
    setPanelOpen(true);
  }

  /**
   * Active un onglet et synchronise la barre de gauche : le module qui le
   * contient est sélectionné et son panneau affiche l'élément correspondant.
   *
   * Tous les changements d'onglet actif passent par ici (clic sur un onglet,
   * ouverture d'une fonctionnalité, fermeture de l'onglet actif), pour que
   * la gauche et la zone centrale ne se désynchronisent jamais.
   *
   * Le panneau du milieu n'est pas rouvert s'il a été fermé : le module
   * reste alors repéré dans la barre (voir `linked`).
   */
  function activate(tabId: string | null) {
    // Mis à jour tout de suite : une fermeture enchaînée (questions
    // successives) doit voir le nouvel onglet actif sans attendre le rendu.
    activeTabRef.current = tabId;
    setActiveTab(tabId);

    const owner = tabId ? findFeature(tabId)?.module.id : undefined;

    if (owner) {
      setActiveModule(owner);
    }
  }

  /**
   * Ouvre une fonctionnalité dans un onglet de la zone centrale
   * (ou revient sur son onglet s'il est déjà ouvert).
   */
  function openFeature(featureId: string) {
    setLayout((current) => addTab(current, featureId));

    activate(featureId);
  }

  /**
   * Ferme un ou plusieurs onglets, relativement à l'onglet `tabId`
   * (voir `CloseScope` : cet onglet, les autres, ceux à gauche, à droite,
   * ou tous).
   *
   * On ne ferme PAS le projet : seuls les onglets sont fermés.
   * Les onglets épinglés restent toujours ouverts : il faut d'abord
   * les désépingler.
   *
   * Si l'onglet actif est fermé :
   * - l'onglet `tabId` devient actif s'il est resté ouvert
   *   (« fermer les autres », « à gauche », « à droite ») ;
   * - sinon on passe au voisin le plus proche encore ouvert
   *   (d'abord à droite, puis à gauche) ;
   * - s'il n'en reste aucun, la zone centrale est vide.
   */
  function closeTabs(tabId: string, scope: CloseScope) {
    const closing = tabsToClose(layoutRef.current, tabId, scope);
    const isUnsaved = (id: string) => id in useUnsavedStore.getState().entries;

    const unsaved = closing.filter(isUnsaved);
    const clean = closing.filter((id) => !isUnsaved(id));

    // Les onglets sans modification se ferment tout de suite.
    closeTabIds(clean, tabId);

    if (unsaved.length === 0) {
      return;
    }

    // Les onglets modifiés : un par un. Chaque onglet est affiché, la
    // question est posée pour lui seul, puis il est fermé (s'il est
    // enregistré ou abandonné) avant de passer au suivant. « Annuler »
    // laisse ouverts celui-ci et les suivants.
    closeQueue.start(unsaved, {
      onShow: (id) => activate(id),
      onResolved: (id) => closeTabIds([id], tabId),
    });
  }

  /**
   * Ferme réellement ces onglets (aucune question).
   *
   * Si l'onglet actif en fait partie, `anchor` devient actif s'il est
   * resté ouvert, sinon le voisin le plus proche.
   */
  function closeTabIds(closing: string[], anchor: string) {
    const layout = layoutRef.current;
    const activeTab = activeTabRef.current;
    const next = closeTabsInLayout(layout, closing);

    if (next === layout) {
      return;
    }

    layoutRef.current = next;
    setLayout(next);

    if (!activeTab || !closing.includes(activeTab)) {
      return;
    }

    if (next.tabs.includes(anchor)) {
      activate(anchor);
      return;
    }

    const index = layout.tabs.indexOf(activeTab);
    const isOpen = (id: string) => next.tabs.includes(id);

    const after = layout.tabs.slice(index + 1).find(isOpen);
    const before = layout.tabs.slice(0, index).reverse().find(isOpen);

    activate(after ?? before ?? null);
  }

  /**
   * Ferme un seul onglet (croix de l'onglet).
   */
  function closeTab(tabId: string) {
    closeTabs(tabId, "this");
  }

  /**
   * Épingle ou désépingle un onglet.
   */
  function togglePin(tabId: string) {
    setLayout((current) => togglePinInLayout(current, tabId));
  }

  /**
   * Glisser-déposer : `activeId` est déposé sur `overId`.
   */
  function moveTab(activeId: string, overId: string) {
    setLayout((current) => moveTabInLayout(current, activeId, overId));
  }

  /**
   * Déplacement au clavier (Alt + flèches).
   */
  function shiftTab(tabId: string, delta: -1 | 1) {
    setLayout((current) => shiftTabInLayout(current, tabId, delta));
  }

  /**
   * Onglets tels qu'affichés dans la barre (ceux dont l'identifiant
   * n'est plus connu sont ignorés).
   */
  const tabInfos: TabInfo[] = layout.tabs.flatMap((id) => {
    const meta = tabMeta(id);

    return meta
      ? [
          {
            id,
            label: meta.label,
            icon: meta.icon,
            pinned: layout.pinned.includes(id),
            dirty: id in unsavedEntries,
          },
        ]
      : [];
  });

  /**
   * Module qui contient l'onglet actif (repéré dans la barre de gauche).
   */
  const linkedModule = activeTab
    ? (findFeature(activeTab)?.module.id ?? null)
    : null;

  /**
   * Ordre de rendu du contenu : indépendant de l'ordre des onglets,
   * pour que déplacer un onglet ne déplace jamais son contenu dans la page.
   */
  const contentIds = [...layout.tabs].sort();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex min-h-0 flex-1">
        {/* =========================================================
            BARRE DE GAUCHE (modules)
            ========================================================= */}
        <ActivityBar
          active={activeModule}
          linked={linkedModule}
          panelOpen={panelOpen}
          expanded={railExpanded}
          onToggleExpanded={() =>
            setRailExpanded(!railExpanded)
          }
          onSelect={selectModule}
        />

        {/* =========================================================
            PANNEAU DU MILIEU (fonctionnalités du module)

            Redimensionnable par son bord droit. Tiré vers la gauche
            au-delà de sa largeur minimale, il se ferme ; un clic sur
            un module de la barre de gauche le rouvre à sa largeur
            précédente.
            ========================================================= */}
        {panelOpen && (
          <SideBar
            module={activeModule}
            projectName={project.name}
            activeTab={activeTab}
            onOpenFeature={openFeature}
            onClose={() => setPanelOpen(false)}
          />
        )}

        {/* =========================================================
            ZONE CENTRALE
            ========================================================= */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* =======================================================
              ONGLETS (épinglables et déplaçables)

              Clic droit (ou appui à deux doigts sur le pavé tactile)
              sur un onglet : menu pour l'épingler ou fermer cet
              onglet, les autres, ceux à gauche, à droite, ou tous.
              ======================================================= */}
          <WorkspaceTabs
            tabs={tabInfos}
            activeTab={activeTab}
            onSelect={activate}
            onClose={closeTab}
            onCloseTabs={closeTabs}
            onTogglePin={togglePin}
            onMove={moveTab}
            onShift={shiftTab}
          />

          {/* =======================================================
              CONTENU DES ONGLETS

              Tous les onglets ouverts restent montés (seul l'actif
              est visible) : un formulaire en cours de saisie n'est
              pas perdu quand on change d'onglet.
              ======================================================= */}
          {layout.tabs.length > 0 ? (
            contentIds.map((tabId) => (
              <div
                key={tabId}
                className={cn(
                  "flex min-h-0 flex-1 flex-col",
                  activeTab !== tabId && "hidden",
                )}
              >
                {/* L'onglet est connu des écrans qui signalent leurs
                    modifications non enregistrées. */}
                <UnsavedTabContext.Provider
                  value={{ id: tabId, label: tabMeta(tabId)?.label ?? tabId }}
                >
                  <WorkspaceView
                    tabId={tabId}
                    project={project}
                    onOpenFeature={openFeature}
                  />
                </UnsavedTabContext.Provider>
              </div>
            ))
          ) : (
            /* -----------------------------------------------------
               AUCUN ONGLET OUVERT
               ----------------------------------------------------- */
            <div className="flex flex-1 items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-center">
                <FileText className="h-8 w-8 text-muted-foreground/50" />

                <p className="text-sm text-muted-foreground">
                  {t("empty.title")}
                </p>

                <p className="text-xs text-muted-foreground">
                  {t("empty.description")}
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* =========================================================
          « ENREGISTRER LES MODIFICATIONS ? » (fermeture d'onglets)
          ========================================================= */}
      <UnsavedChangesDialog
        reason="closeTabs"
        question={closeQueue.question}
        busy={closeQueue.busy}
        failed={closeQueue.failed}
        onSave={closeQueue.save}
        onDiscard={closeQueue.discard}
        onCancel={closeQueue.cancel}
      />

      {/* =========================================================
          STATUS BAR
          ========================================================= */}
      <StatusBar />
    </div>
  );
}
