import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Input } from "@/components/ui/input";
import {
  getModule,
  type ModuleId,
} from "@/components/workspace/modules";
import {
  PANEL_CLOSE_THRESHOLD,
  PANEL_DEFAULT_WIDTH,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  clampPanelWidth,
  setPanelWidth,
  usePanelWidth,
} from "@/lib/preferences";
import { cn } from "@/lib/utils";

interface SideBarProps {
  /** Module dont on affiche les fonctionnalités. */
  module: ModuleId;
  projectName: string;
  /** Onglet actuellement actif dans la zone centrale. */
  activeTab: string | null;
  /** Ouvre une fonctionnalité dans un onglet de la zone centrale. */
  onOpenFeature: (featureId: string) => void;
  /** Ferme le panneau (tiré vers la gauche au-delà de sa largeur minimale). */
  onClose: () => void;
}

/** Pas de redimensionnement au clavier (px). */
const KEYBOARD_STEP = 16;

/** Rend au document son curseur et la sélection de texte. */
function resetBodyStyle() {
  document.body.style.removeProperty("cursor");
  document.body.style.removeProperty("user-select");
}

/**
 * Panneau du milieu : liste des fonctionnalités du module sélectionné.
 * Un clic sur une fonctionnalité l'ouvre dans la zone centrale.
 *
 * Redimensionnement (comme VS Code) :
 * - glisser le bord droit élargit ou rétrécit le panneau ;
 * - tiré vers la gauche au-delà de sa largeur minimale, il se replie, puis
 *   se ferme au relâchement (revenir vers la droite avant de relâcher annule) ;
 * - double-clic sur le bord : largeur par défaut ;
 * - clavier (bord sélectionné avec Tab) : flèches gauche / droite,
 *   Origine / Fin pour la largeur minimale / maximale. Flèche gauche à la
 *   largeur minimale : fermeture.
 *
 * La largeur est mémorisée sur l'appareil ; le panneau rouvert retrouve
 * sa largeur précédente.
 */
export function SideBar({
  module: moduleId,
  projectName,
  activeTab,
  onOpenFeature,
  onClose,
}: SideBarProps) {
  const module = getModule(moduleId);
  const savedWidth = usePanelWidth();

  /** Largeur demandée pendant un glisser (`null` hors glisser). */
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const dragging = dragWidth !== null;
  const collapsing = dragging && dragWidth < PANEL_CLOSE_THRESHOLD;
  const width = collapsing ? 0 : clampPanelWidth(dragWidth ?? savedWidth);

  // Sécurité : si le panneau disparaît en plein glisser, le curseur
  // du document est rétabli.
  useEffect(() => resetBodyStyle, []);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    drag.current = { startX: event.clientX, startWidth: savedWidth };
    setDragWidth(savedWidth);

    // Le curseur reste « redimensionner » et le texte n'est pas
    // sélectionné, même quand la souris quitte le bord.
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;

    if (current) {
      setDragWidth(current.startWidth + event.clientX - current.startX);
    }
  }

  function stopDrag(event: ReactPointerEvent<HTMLDivElement>) {
    drag.current = null;
    setDragWidth(null);
    resetBodyStyle();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const current = drag.current;

    if (!current) {
      return;
    }

    const finalWidth = current.startWidth + event.clientX - current.startX;

    stopDrag(event);

    if (finalWidth < PANEL_CLOSE_THRESHOLD) {
      // La largeur enregistrée n'est pas modifiée : le panneau
      // rouvert retrouvera sa largeur d'avant.
      onClose();
    } else if (clampPanelWidth(finalWidth) !== savedWidth) {
      setPanelWidth(finalWidth);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();

        if (savedWidth <= PANEL_MIN_WIDTH) {
          onClose();
        } else {
          setPanelWidth(savedWidth - KEYBOARD_STEP);
        }
        break;

      case "ArrowRight":
        event.preventDefault();
        setPanelWidth(savedWidth + KEYBOARD_STEP);
        break;

      case "Home":
        event.preventDefault();
        setPanelWidth(PANEL_MIN_WIDTH);
        break;

      case "End":
        event.preventDefault();
        setPanelWidth(PANEL_MAX_WIDTH);
        break;
    }
  }

  return (
    <div className="relative flex shrink-0" style={{ width }}>
      <aside
        aria-label="Fonctionnalités du module"
        aria-hidden={collapsing || undefined}
        className={cn(
          "flex min-w-0 flex-1 flex-col overflow-hidden bg-sidebar text-sidebar-foreground",
          !collapsing && "border-r border-sidebar-border",
        )}
      >
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground">{module.label}</p>
          <p className="truncate text-sm font-semibold">{projectName}</p>
        </div>

        {module.id === "search" ? (
          <div className="space-y-2 px-4">
            <Input disabled placeholder="Rechercher dans le projet" />
            <p className="text-xs text-muted-foreground">
              La recherche sera disponible avec le contenu du projet.
            </p>
          </div>
        ) : (
          <ul className="px-2">
            {module.features.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  aria-current={activeTab === id ? "page" : undefined}
                  onClick={() => onOpenFeature(id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent",
                    activeTab === id && "bg-sidebar-accent font-medium",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="flex-1 truncate text-left">{label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* Bord droit : poignée de redimensionnement (fine ligne au survol). */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionner le panneau des fonctionnalités"
        aria-valuemin={PANEL_MIN_WIDTH}
        aria-valuemax={PANEL_MAX_WIDTH}
        aria-valuenow={width}
        tabIndex={0}
        title="Glisser pour redimensionner, vers la gauche pour fermer. Double-clic : largeur par défaut."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={stopDrag}
        onDoubleClick={() => setPanelWidth(PANEL_DEFAULT_WIDTH)}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize touch-none outline-none",
          "after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:bg-primary after:opacity-0 after:transition-opacity",
          "hover:after:opacity-100 focus-visible:after:opacity-100",
          dragging && "after:opacity-100",
        )}
      />
    </div>
  );
}