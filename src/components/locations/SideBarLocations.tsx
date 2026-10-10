import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { LocationThumb } from "@/components/locations/LocationVisuals";
import { buildLocationTree, flattenTree, locationTabId } from "@/lib/locations";
import { cn } from "@/lib/utils";
import { useProjectLocations } from "@/stores/locationStore";

interface SideBarLocationsProps {
  projectId: string;
  activeTab: string | null;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Lieux du projet dans le panneau du module « Lieux », en arborescence
 * (comme les dossiers dans l'explorateur de VS Code). Un clic ouvre la
 * fiche ; la flèche replie ou déplie ce que le lieu contient.
 */
export function SideBarLocations({ projectId, activeTab, onOpenFeature }: SideBarLocationsProps) {
  const { t } = useTranslation("locations");
  const { locations, settings, loaded } = useProjectLocations(projectId);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const rows = useMemo(
    () => flattenTree(buildLocationTree(locations), collapsed),
    [locations, collapsed],
  );

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section aria-labelledby="sidebar-locations" className="mt-4 flex min-h-0 flex-1 flex-col">
      <h3
        id="sidebar-locations"
        className="px-4 pb-1 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase"
      >
        {t("sidebar.title")}
        {loaded && locations.length > 0 && ` (${locations.length})`}
      </h3>

      {!loaded ? (
        <p className="px-4 text-xs text-muted-foreground">{t("sidebar.loading")}</p>
      ) : locations.length === 0 ? (
        <p className="px-4 text-xs text-muted-foreground">{t("sidebar.empty")}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" role="tree">
          {rows.map(({ location, depth, children }) => {
            const tabId = locationTabId(location.id);
            const active = activeTab === tabId;
            const open = !collapsed.has(location.id);

            return (
              <li
                key={location.id}
                role="treeitem"
                aria-level={depth + 1}
                aria-expanded={children.length > 0 ? open : undefined}
                className="flex items-center"
                style={{ paddingLeft: `${depth * 0.875}rem` }}
              >
                <button
                  type="button"
                  tabIndex={children.length > 0 ? 0 : -1}
                  onClick={() => toggle(location.id)}
                  aria-label={open ? t("list.collapse") : t("list.expand")}
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent",
                    children.length === 0 && "invisible",
                  )}
                >
                  {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                </button>

                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  onClick={() => onOpenFeature(tabId)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-sidebar-accent",
                    active && "bg-sidebar-accent font-medium",
                  )}
                >
                  <LocationThumb
                    projectId={projectId}
                    location={location}
                    customTypes={settings.customTypes}
                    size="xs"
                  />
                  <span className="flex-1 truncate text-left">{location.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
