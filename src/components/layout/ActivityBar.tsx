import { useTranslation } from "react-i18next";
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
  /**
   * Module qui contient l'onglet ouvert dans la zone centrale (`null` s'il
   * n'y en a pas). Il reste repéré dans la barre même quand le panneau du
   * milieu est fermé, ou quand on parcourt un autre module.
   */
  linked?: ModuleId | null;
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
 *
 * Deux repères distincts :
 * - le module « sélectionné » est celui dont le panneau est affiché ;
 * - le module « lié » est celui qui contient l'onglet ouvert (point
 *   coloré), pour toujours savoir à quoi correspond l'onglet actif.
 */
export function ActivityBar({
  active,
  linked = null,
  panelOpen,
  expanded,
  onToggleExpanded,
  onSelect,
}: ActivityBarProps) {
  const { t } = useTranslation("activitybar");

  const renderModule = (module: WorkspaceModule) => {
    const selected = panelOpen && active === module.id;
    const isLinked = linked === module.id;
    const Icon = module.icon;

    return (
      <button
        key={module.id}
        type="button"
        title={
          isLinked
            ? t("linked", { module: module.label })
            : module.label
        }
        aria-label={module.label}
        aria-pressed={selected}
        aria-current={isLinked ? "true" : undefined}
        data-linked={isLinked ? "true" : undefined}
        onClick={() => onSelect(module.id)}
        className={cn(
          "relative flex h-11 w-full items-center gap-3 border-l-2 text-sm transition-colors",
          expanded ? "px-3.5" : "justify-center",
          selected
            ? "border-primary bg-sidebar-accent text-foreground"
            : isLinked
              ? "border-primary/50 text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />

        {expanded && <span className="truncate">{module.label}</span>}

        {/* Point : ce module contient l'onglet ouvert, mais son panneau n'est pas affiché. */}
        {isLinked && !selected && (
          <span
            aria-hidden="true"
            className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary"
          />
        )}
      </button>
    );
  };

  return (
    <aside
      aria-label={t("label")}
      className={cn(
        "flex shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar transition-[width] duration-150",
        expanded ? "w-48" : "w-12",
      )}
    >
      <div>
        {/* Pas de séparation sous ce bouton : il s'enchaîne directement avec les modules. */}
        <button
          type="button"
          title={expanded ? t("collapse.title") : t("expand.title")}
          aria-label={
            expanded ? t("collapse.label") : t("expand.label")
          }
          aria-expanded={expanded}
          onClick={onToggleExpanded}
          className={cn(
            "flex h-11 w-full items-center gap-3 border-l-2 border-transparent text-sm text-muted-foreground transition-colors hover:text-foreground",
            expanded ? "px-3.5" : "justify-center",
          )}
        >
          {expanded ? (
            <PanelLeftClose className="h-5 w-5 shrink-0" />
          ) : (
            <PanelLeftOpen className="h-5 w-5 shrink-0" />
          )}

          {expanded && <span className="truncate">{t("collapse.short")}</span>}
        </button>

        {WORKSPACE_MODULES.map(renderModule)}
      </div>

      <div>{renderModule(SETTINGS_MODULE)}</div>
    </aside>
  );
}