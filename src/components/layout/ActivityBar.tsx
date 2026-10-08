import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  SETTINGS_MODULE,
  WORKSPACE_MODULES,
  type ModuleId,
  type WorkspaceModule,
} from "@/components/workspace/modules";
import { cn } from "@/lib/utils";

interface ActivityBarProps {
  /** Module actuellement sélectionné. */
  active: ModuleId;
  /** Vrai si le panneau du milieu est ouvert. */
  panelOpen: boolean;
  /** Vrai : icônes + noms. Faux : icônes seules. */
  expanded: boolean;
  onToggleExpanded: () => void;
  onSelect: (id: ModuleId) => void;
}

/**
 * Barre de gauche de l'espace de travail.
 *
 * Le premier bouton la développe (icônes + noms) ou la réduit
 * (icônes seules). Viennent ensuite les modules de base, puis les
 * paramètres du projet tout en bas.
 */
export function ActivityBar({
  active,
  panelOpen,
  expanded,
  onToggleExpanded,
  onSelect,
}: ActivityBarProps) {
  const renderModule = (module: WorkspaceModule) => {
    const selected = panelOpen && active === module.id;
    const Icon = module.icon;

    return (
      <button
        key={module.id}
        type="button"
        title={module.label}
        aria-label={module.label}
        aria-pressed={selected}
        onClick={() => onSelect(module.id)}
        className={cn(
          "flex h-11 w-full items-center gap-3 border-l-2 text-sm transition-colors",
          expanded ? "px-3.5" : "justify-center",
          selected
            ? "border-primary bg-sidebar-accent text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />

        {expanded && <span className="truncate">{module.label}</span>}
      </button>
    );
  };

  return (
    <aside
      aria-label="Modules du projet"
      className={cn(
        "flex shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar transition-[width] duration-150",
        expanded ? "w-48" : "w-12",
      )}
    >
      <div>
        <button
          type="button"
          title={expanded ? "Réduire la barre" : "Développer la barre"}
          aria-label={
            expanded ? "Réduire la barre latérale" : "Développer la barre latérale"
          }
          aria-expanded={expanded}
          onClick={onToggleExpanded}
          className={cn(
            "flex h-11 w-full items-center gap-3 border-b border-sidebar-border border-l-2 border-l-transparent text-sm text-muted-foreground transition-colors hover:text-foreground",
            expanded ? "px-3.5" : "justify-center",
          )}
        >
          {expanded ? (
            <PanelLeftClose className="h-5 w-5 shrink-0" />
          ) : (
            <PanelLeftOpen className="h-5 w-5 shrink-0" />
          )}

          {expanded && <span className="truncate">Réduire</span>}
        </button>

        {WORKSPACE_MODULES.map(renderModule)}
      </div>

      <div>{renderModule(SETTINGS_MODULE)}</div>
    </aside>
  );
}