import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronLeft,
  ChevronRight,
  Pin,
  PinOff,
  X,
  type LucideIcon,
} from "lucide-react";
import { tabsToClose, type CloseScope } from "@/lib/tabLayout";
import { cn } from "@/lib/utils";

/** Un onglet tel qu'affiché dans la barre. */
export interface TabInfo {
  id: string;
  label: string;
  icon: LucideIcon;
  pinned: boolean;
}

interface WorkspaceTabsProps {
  /** Onglets dans l'ordre d'affichage (les épinglés en premier). */
  tabs: TabInfo[];
  activeTab: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  /**
   * Fermeture depuis le menu d'un onglet : cet onglet, les autres, ceux à
   * gauche, à droite, ou tous (les épinglés restent toujours ouverts).
   */
  onCloseTabs: (id: string, scope: CloseScope) => void;
  onTogglePin: (id: string) => void;
  /** Glisser-déposer : `activeId` est déposé sur `overId`. */
  onMove: (activeId: string, overId: string) => void;
  /** Déplacement au clavier (Alt + flèches) : une place à gauche ou à droite. */
  onShift: (id: string, delta: -1 | 1) => void;
}

// ----------------------------------------------------------------------------
// Nombre d'onglets affichés
// ----------------------------------------------------------------------------

/** Onglets affichés au maximum quand la zone des onglets est large. */
export const MAX_TABS_LARGE = 5;

/** Onglets affichés au maximum quand la zone des onglets est étroite. */
export const MAX_TABS_SMALL = 4;

/** Largeur (px) à partir de laquelle la zone des onglets est considérée large. */
export const LARGE_MIN_WIDTH = 1000;

/**
 * Nombre maximal d'onglets affichés, selon la largeur réelle de la barre.
 * La largeur change avec la fenêtre, le panneau du milieu (ouvert ou
 * fermé) et la barre de gauche (développée ou réduite).
 */
function useMaxVisibleTabs(ref: RefObject<HTMLElement | null>): number {
  const [large, setLarge] = useState(true);

  useLayoutEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const update = () => setLarge(element.clientWidth >= LARGE_MIN_WIDTH);

    update();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(update);

    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return large ? MAX_TABS_LARGE : MAX_TABS_SMALL;
}

/** Ramène le premier onglet affiché dans les bornes possibles. */
function clampStart(start: number, count: number, max: number): number {
  return Math.min(Math.max(start, 0), Math.max(0, count - max));
}

/** Premier onglet à afficher pour que l'onglet `index` soit visible. */
function revealIndex(
  start: number,
  index: number,
  count: number,
  max: number,
): number {
  const from = clampStart(start, count, max);

  if (index < from) {
    return index;
  }

  if (index >= from + max) {
    return index - max + 1;
  }

  return from;
}

// ----------------------------------------------------------------------------
// Un onglet
// ----------------------------------------------------------------------------

const tabClass = (active: boolean, pinned: boolean) =>
  cn(
    "group relative flex items-center gap-1 border-t-2 py-1.5 text-sm",
    pinned ? "shrink-0 pl-2.5 pr-1.5" : "min-w-0 max-w-56 pl-4 pr-2",
    active
      ? "border-primary bg-background"
      : "border-transparent text-muted-foreground hover:text-foreground",
  );

interface SortableTabProps {
  tab: TabInfo;
  active: boolean;
  /** Dernier onglet épinglé : une fine séparation le distingue des autres. */
  lastPinned: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onTogglePin: (id: string) => void;
  onShift: (id: string, delta: -1 | 1) => void;
  /** Ouvre le menu de l'onglet à la position donnée (coordonnées écran). */
  onOpenMenu: (id: string, x: number, y: number) => void;
  /** Demande de rendre le focus à un élément après le prochain rendu. */
  keepFocus: (elementId: string) => void;
}

function SortableTab({
  tab,
  active,
  lastPinned,
  onSelect,
  onClose,
  onTogglePin,
  onShift,
  onOpenMenu,
  keepFocus,
}: SortableTabProps) {
  const { setNodeRef, transform, transition, isDragging, listeners } =
    useSortable({ id: tab.id });

  const Icon = tab.icon;

  // L'onglet ne glisse que horizontalement, sans se déformer.
  const style = {
    transform: CSS.Transform.toString(
      transform ? { ...transform, y: 0, scaleX: 1, scaleY: 1 } : null,
    ),
    transition,
  };

  const tabButtonId = `tab-${tab.id}`;
  const pinButtonId = `tab-pin-${tab.id}`;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (
      event.altKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      event.preventDefault();

      keepFocus(tabButtonId);
      onShift(tab.id, event.key === "ArrowLeft" ? -1 : 1);
    }
  }

  /**
   * Clic droit, appui à deux doigts sur le pavé tactile, touche Menu ou
   * Maj + F10 : ouvre le menu de l'onglet (à la place du menu du navigateur).
   */
  function onContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();

    let { clientX: x, clientY: y } = event;

    // Ouvert au clavier : pas de position de souris, on se place sous l'onglet.
    if (x === 0 && y === 0) {
      const rect = event.currentTarget.getBoundingClientRect();

      x = rect.left;
      y = rect.bottom;
    }

    onOpenMenu(tab.id, x, y);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onContextMenu={onContextMenu}
      data-pinned={tab.pinned ? "true" : undefined}
      className={cn(
        tabClass(active, tab.pinned),
        lastPinned && "border-r border-r-border",
        isDragging && "z-10 cursor-grabbing bg-card opacity-90 shadow-md",
      )}
    >
      <button
        id={tabButtonId}
        type="button"
        role="tab"
        aria-selected={active}
        aria-haspopup="menu"
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Shift+F10"
        // Un onglet épinglé n'affiche que son icône : le nom reste
        // disponible pour les lecteurs d'écran.
        aria-label={tab.pinned ? tab.label : undefined}
        // Infobulle : le nom complet, utile aussi quand il est tronqué.
        title={tab.label}
        onClick={() => onSelect(tab.id)}
        onKeyDown={onKeyDown}
        {...listeners}
        className="flex min-w-0 items-center gap-2 whitespace-nowrap"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />

        {!tab.pinned && <span className="truncate">{tab.label}</span>}
      </button>

      <button
        id={pinButtonId}
        type="button"
        aria-label={
          tab.pinned
            ? `Désépingler l'onglet ${tab.label}`
            : `Épingler l'onglet ${tab.label}`
        }
        title={tab.pinned ? "Désépingler" : "Épingler"}
        onClick={() => {
          keepFocus(pinButtonId);
          onTogglePin(tab.id);
        }}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-secondary",
          // L'épingle d'un onglet libre n'apparaît qu'au survol ou au focus.
          !tab.pinned &&
            "opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100",
        )}
      >
        <Pin
          className={cn("h-3 w-3", tab.pinned && "fill-current text-primary")}
        />
      </button>

      {/* Un onglet épinglé ne se ferme pas : il faut d'abord le désépingler. */}
      {!tab.pinned && (
        <button
          type="button"
          aria-label={`Fermer l'onglet ${tab.label}`}
          title="Fermer l'onglet"
          onClick={() => onClose(tab.id)}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-secondary"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Flèches de navigation
// ----------------------------------------------------------------------------

interface NavButtonProps {
  direction: "left" | "right";
  /** Nombre d'onglets masqués de ce côté (toujours au moins 1). */
  hidden: number;
  onClick: () => void;
}

/** Flèche affichée uniquement quand des onglets sont masqués de son côté. */
function NavButton({ direction, hidden, onClick }: NavButtonProps) {
  const left = direction === "left";
  const Icon = left ? ChevronLeft : ChevronRight;
  const side = left ? "à gauche" : "à droite";
  const label = `Afficher l'onglet masqué ${side} (${hidden} masqué${
    hidden > 1 ? "s" : ""
  })`;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex w-8 shrink-0 items-center justify-center border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        left ? "border-r" : "border-l",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// ----------------------------------------------------------------------------
// Menu d'un onglet (clic droit)
// ----------------------------------------------------------------------------

interface MenuState {
  tabId: string;
  x: number;
  y: number;
}

interface TabContextMenuProps {
  tab: TabInfo;
  x: number;
  y: number;
  /** Nombre d'onglets que chaque fermeture fermerait réellement. */
  counts: Record<CloseScope, number>;
  onTogglePin: () => void;
  onCloseTabs: (scope: CloseScope) => void;
  /** Ferme le menu ; `restoreFocus` rend le focus à l'onglet. */
  onDismiss: (restoreFocus: boolean) => void;
}

interface MenuItemProps {
  icon?: LucideIcon;
  label: string;
  title?: string;
  disabled?: boolean;
  onSelect: () => void;
}

function MenuItem({ icon: Icon, label, title, disabled, onSelect }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      title={title}
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {/* L'emplacement de l'icône est réservé pour aligner les libellés. */}
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {Icon && <Icon className="h-3.5 w-3.5" />}
      </span>

      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}

/**
 * Menu contextuel d'un onglet.
 *
 * - S'affiche à l'endroit du clic, sans jamais déborder de la fenêtre.
 * - Se ferme au clic en dehors, avec Échap, au défilement, au
 *   redimensionnement ou quand la fenêtre perd le focus.
 * - Clavier : flèches haut / bas, Origine / Fin, Entrée pour choisir.
 * - Les actions sans effet sont grisées (par exemple « Fermer les onglets
 *   à droite » sur le dernier onglet).
 */
function TabContextMenu({
  tab,
  x,
  y,
  counts,
  onTogglePin,
  onCloseTabs,
  onDismiss,
}: TabContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Toujours la dernière version de `onDismiss`, sans réabonner les écouteurs.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  // Garde le menu entièrement visible et place le focus sur le premier choix.
  useLayoutEffect(() => {
    const menu = ref.current;

    if (!menu) {
      return;
    }

    const { width, height } = menu.getBoundingClientRect();
    const margin = 8;

    setPosition({
      left: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
    });

    menu
      .querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      ?.focus();
  }, [x, y]);

  useEffect(() => {
    const dismiss = () => dismissRef.current(false);

    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        dismiss();
      }
    }

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissRef.current(true);
      }
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, []);

  /** Flèches haut / bas, Origine / Fin : passe d'un choix à l'autre. */
  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? [],
    );

    if (items.length === 0) {
      return;
    }

    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;

    switch (event.key) {
      case "ArrowDown":
        next = current < 0 ? 0 : (current + 1) % items.length;
        break;
      case "ArrowUp":
        next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = items.length - 1;
        break;
      case "Tab":
        // Le menu se ferme plutôt que de laisser le focus s'en échapper.
        event.preventDefault();
        onDismiss(true);
        return;
    }

    if (next !== null) {
      event.preventDefault();
      items[next].focus();
    }
  }

  function run(action: () => void) {
    onDismiss(false);
    action();
  }

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions de l'onglet ${tab.label}`}
      onKeyDown={onMenuKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      style={{ left: position.left, top: position.top }}
      className="fixed z-50 min-w-60 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      <MenuItem
        icon={tab.pinned ? PinOff : Pin}
        label={tab.pinned ? "Désépingler l'onglet" : "Épingler l'onglet"}
        onSelect={() => run(onTogglePin)}
      />

      <div role="separator" className="-mx-1 my-1 h-px bg-border" />

      <MenuItem
        icon={X}
        label="Fermer cet onglet"
        title={tab.pinned ? "Désépinglez d'abord l'onglet pour le fermer" : undefined}
        disabled={counts.this === 0}
        onSelect={() => run(() => onCloseTabs("this"))}
      />

      <MenuItem
        label="Fermer les autres onglets"
        disabled={counts.others === 0}
        onSelect={() => run(() => onCloseTabs("others"))}
      />

      <MenuItem
        label="Fermer les onglets à gauche"
        disabled={counts.left === 0}
        onSelect={() => run(() => onCloseTabs("left"))}
      />

      <MenuItem
        label="Fermer les onglets à droite"
        disabled={counts.right === 0}
        onSelect={() => run(() => onCloseTabs("right"))}
      />

      <MenuItem
        label="Fermer tous les onglets"
        disabled={counts.all === 0}
        onSelect={() => run(() => onCloseTabs("all"))}
      />

      <div role="separator" className="-mx-1 my-1 h-px bg-border" />

      <p className="px-2 py-1 text-xs text-muted-foreground">
        Les onglets épinglés restent ouverts.
      </p>
    </div>,
    document.body,
  );
}

// ----------------------------------------------------------------------------
// Barre d'onglets
// ----------------------------------------------------------------------------

/**
 * Barre d'onglets de l'espace de travail.
 *
 * - Pas de barre de défilement : au plus 5 onglets sont affichés quand la
 *   zone est large, 4 quand elle est étroite. Chaque clic sur une flèche
 *   décale la fenêtre d'un onglet : l'onglet révélé d'un côté masque celui
 *   de l'autre côté, sans jamais le fermer.
 * - Une flèche n'apparaît que s'il reste des onglets masqués de son côté :
 *   quand le premier onglet est visible, la flèche de gauche disparaît ;
 *   quand le dernier est visible, celle de droite disparaît.
 * - L'onglet actif est toujours ramené dans la partie visible.
 * - Glisser-déposer : on déplace un onglet parmi ceux affichés. Déposé parmi
 *   les épinglés il s'épingle, déposé parmi les autres il se désépingle.
 * - Épingle : garde l'onglet au début de la barre, sous forme d'icône,
 *   à l'abri d'une fermeture par erreur.
 * - Clavier : Alt + flèche gauche ou droite déplace l'onglet sélectionné.
 * - Clic droit (ou appui à deux doigts sur le pavé tactile) : menu pour
 *   épingler l'onglet ou fermer cet onglet, les autres, ceux à gauche,
 *   à droite, ou tous. Les onglets épinglés restent toujours ouverts.
 */
export function WorkspaceTabs({
  tabs,
  activeTab,
  onSelect,
  onClose,
  onCloseTabs,
  onTogglePin,
  onMove,
  onShift,
}: WorkspaceTabsProps) {
  // Le glisser ne démarre qu'après quelques pixels : un simple clic
  // continue de sélectionner l'onglet.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const barRef = useRef<HTMLDivElement>(null);
  const maxVisible = useMaxVisibleTabs(barRef);

  /** Position du premier onglet affiché (ramenée dans les bornes au rendu). */
  const [start, setStart] = useState(0);

  const count = tabs.length;
  const first = clampStart(start, count, maxVisible);
  const visible = tabs.slice(first, first + maxVisible);
  const hiddenLeft = first;
  const hiddenRight = Math.max(0, count - first - visible.length);

  const activeIndex = activeTab
    ? tabs.findIndex((tab) => tab.id === activeTab)
    : -1;

  // L'onglet actif reste toujours visible : à son ouverture, quand il change,
  // quand il est déplacé, ou quand la place disponible diminue.
  useLayoutEffect(() => {
    if (activeIndex >= 0) {
      setStart((current) =>
        revealIndex(current, activeIndex, count, maxVisible),
      );
    }
  }, [activeIndex, count, maxVisible]);

  // Après un déplacement, React replace les éléments dans le DOM, ce qui
  // fait perdre le focus : on le rend à l'élément qui l'avait.
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    const elementId = pendingFocus.current;

    if (elementId) {
      pendingFocus.current = null;
      document.getElementById(elementId)?.focus();
    }
  });

  /** Alt + flèches : l'onglet déplacé reste visible même s'il n'est pas actif. */
  function handleShift(id: string, delta: -1 | 1) {
    const index = tabs.findIndex((tab) => tab.id === id);

    if (index >= 0) {
      const target = Math.min(Math.max(index + delta, 0), count - 1);

      setStart((current) => revealIndex(current, target, count, maxVisible));
    }

    onShift(id, delta);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (over && active.id !== over.id) {
      onMove(String(active.id), String(over.id));
    }
  }

  // -------------------------------------------------------------------------
  // Menu d'un onglet
  // -------------------------------------------------------------------------

  const [menu, setMenu] = useState<MenuState | null>(null);

  const menuTab = menu ? tabs.find((tab) => tab.id === menu.tabId) : undefined;

  // Le menu disparaît si son onglet a été fermé entre-temps.
  useEffect(() => {
    if (menu && !menuTab) {
      setMenu(null);
    }
  }, [menu, menuTab]);

  function dismissMenu(restoreFocus: boolean) {
    if (restoreFocus && menu) {
      document.getElementById(`tab-${menu.tabId}`)?.focus();
    }

    setMenu(null);
  }

  /** Nombre d'onglets que chaque choix du menu fermerait réellement. */
  function closeCounts(id: string): Record<CloseScope, number> {
    const layout = {
      tabs: tabs.map((tab) => tab.id),
      pinned: tabs.filter((tab) => tab.pinned).map((tab) => tab.id),
    };
    const count = (scope: CloseScope) => tabsToClose(layout, id, scope).length;

    return {
      this: count("this"),
      others: count("others"),
      left: count("left"),
      right: count("right"),
      all: count("all"),
    };
  }

  const lastPinnedIndex = tabs.reduce(
    (last, tab, index) => (tab.pinned ? index : last),
    -1,
  );

  return (
    <div
      ref={barRef}
      className="flex h-9 shrink-0 border-b border-border bg-card"
    >
      {hiddenLeft > 0 && (
        <NavButton
          direction="left"
          hidden={hiddenLeft}
          onClick={() => setStart(first - 1)}
        />
      )}

      <DndContext
        id="workspace-tabs"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={visible.map((tab) => tab.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div
            role="tablist"
            aria-label="Onglets du projet"
            className="flex min-w-0 flex-1 items-end overflow-hidden"
          >
            {visible.map((tab, offset) => {
              const index = first + offset;

              return (
                <SortableTab
                  key={tab.id}
                  tab={tab}
                  active={activeTab === tab.id}
                  lastPinned={index === lastPinnedIndex && index < count - 1}
                  onSelect={onSelect}
                  onClose={onClose}
                  onTogglePin={onTogglePin}
                  onShift={handleShift}
                  onOpenMenu={(id, x, y) => setMenu({ tabId: id, x, y })}
                  keepFocus={(elementId) => {
                    pendingFocus.current = elementId;
                  }}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {hiddenRight > 0 && (
        <NavButton
          direction="right"
          hidden={hiddenRight}
          onClick={() => setStart(first + 1)}
        />
      )}

      {menu && menuTab && (
        <TabContextMenu
          key={`${menu.tabId}:${menu.x}:${menu.y}`}
          tab={menuTab}
          x={menu.x}
          y={menu.y}
          counts={closeCounts(menuTab.id)}
          onTogglePin={() => {
            pendingFocus.current = `tab-${menuTab.id}`;
            onTogglePin(menuTab.id);
          }}
          onCloseTabs={(scope) => onCloseTabs(menuTab.id, scope)}
          onDismiss={dismissMenu}
        />
      )}
    </div>
  );
}