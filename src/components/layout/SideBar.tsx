import { Input } from "@/components/ui/input";
import {
  getModule,
  type ModuleId,
} from "@/components/workspace/modules";
import { cn } from "@/lib/utils";

interface SideBarProps {
  /** Module dont on affiche les fonctionnalités. */
  module: ModuleId;
  projectName: string;
  /** Onglet actuellement actif dans la zone centrale. */
  activeTab: string | null;
  /** Ouvre une fonctionnalité dans un onglet de la zone centrale. */
  onOpenFeature: (featureId: string) => void;
}

/**
 * Panneau du milieu : liste des fonctionnalités du module sélectionné.
 * Un clic sur une fonctionnalité l'ouvre dans la zone centrale.
 */
export function SideBar({
  module: moduleId,
  projectName,
  activeTab,
  onOpenFeature,
}: SideBarProps) {
  const module = getModule(moduleId);

  return (
    <aside
      aria-label="Fonctionnalités du module"
      className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
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
  );
}