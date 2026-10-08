import { useEffect, useRef, type KeyboardEvent } from "react";
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
import { Pin, X, type LucideIcon } from "lucide-react";
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
  onTogglePin: (id: string) => void;
  /** Glisser-déposer : `activeId` est déposé sur `overId`. */
  onMove: (activeId: string, overId: string) => void;
  /** Déplacement au clavier (Alt + flèches) : une place à gauche ou à droite. */
  onShift: (id: string, delta: -1 | 1) => void;
}

const tabClass = (active: boolean, pinned: boolean) =>
  cn(
    "group relative flex shrink-0 items-center gap-1 border-t-2 py-1.5 text-sm",
    pinned ? "pl-2.5 pr-1.5" : "pl-4 pr-2",
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
  keepFocus,
}: SortableTabProps) {
  const {
    setNodeRef,
    transform,
    transition,
    isDragging,
    listeners,
  } = useSortable({ id: tab.id });

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

  return (
    <div
      ref={setNodeRef}
      style={style}
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
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
        // Un onglet épinglé n'affiche que son icône : le nom reste
        // disponible pour les lecteurs d'écran et en infobulle.
        aria-label={tab.pinned ? tab.label : undefined}
        title={tab.pinned ? tab.label : undefined}
        onClick={() => onSelect(tab.id)}
        onKeyDown={onKeyDown}
        {...listeners}
        className="flex items-center gap-2 whitespace-nowrap"
      >
        <Icon className="h-3.5 w-3.5 text-primary" />

        {!tab.pinned && tab.label}
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
          "flex h-5 w-5 items-center justify-center rounded hover:bg-secondary",
          // L'épingle d'un onglet libre n'apparaît qu'au survol ou au focus.
          !tab.pinned &&
            "opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100",
        )}
      >
        <Pin
          className={cn(
            "h-3 w-3",
            tab.pinned && "fill-current text-primary",
          )}
        />
      </button>

      {/* Un onglet épinglé ne se ferme pas : il faut d'abord le désépingler. */}
      {!tab.pinned && (
        <button
          type="button"
          aria-label={`Fermer l'onglet ${tab.label}`}
          title="Fermer l'onglet"
          onClick={() => onClose(tab.id)}
          className="flex h-5 w-5 items-center justify-center rounded hover:bg-secondary"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Barre d'onglets de l'espace de travail.
 *
 * - Glisser-déposer : on déplace un onglet où l'on veut. Déposé parmi les
 *   épinglés il s'épingle, déposé parmi les autres il se désépingle.
 * - Épingle : garde l'onglet au début de la barre, sous forme d'icône,
 *   à l'abri d'une fermeture par erreur.
 * - Clavier : Alt + flèche gauche ou droite déplace l'onglet sélectionné.
 */
export function WorkspaceTabs({
  tabs,
  activeTab,
  onSelect,
  onClose,
  onTogglePin,
  onMove,
  onShift,
}: WorkspaceTabsProps) {
  // Le glisser ne démarre qu'après quelques pixels : un simple clic
  // continue de sélectionner l'onglet.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

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

  // L'onglet actif reste visible, même si la barre défile.
  useEffect(() => {
    if (activeTab) {
      document
        .getElementById(`tab-${activeTab}`)
        ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }
  }, [activeTab, tabs]);

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (over && active.id !== over.id) {
      onMove(String(active.id), String(over.id));
    }
  }

  const lastPinnedIndex = tabs.reduce(
    (last, tab, index) => (tab.pinned ? index : last),
    -1,
  );

  return (
    <DndContext
      id="workspace-tabs"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={tabs.map((tab) => tab.id)}
        strategy={horizontalListSortingStrategy}
      >
        <div
          role="tablist"
          aria-label="Onglets du projet"
          className="flex h-9 shrink-0 items-end overflow-x-auto border-b border-border bg-card"
        >
          {tabs.map((tab, index) => (
            <SortableTab
              key={tab.id}
              tab={tab}
              active={activeTab === tab.id}
              lastPinned={index === lastPinnedIndex && index < tabs.length - 1}
              onSelect={onSelect}
              onClose={onClose}
              onTogglePin={onTogglePin}
              onShift={onShift}
              keepFocus={(elementId) => {
                pendingFocus.current = elementId;
              }}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}