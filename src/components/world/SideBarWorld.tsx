import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { WorldThumb } from "@/components/world/WorldVisuals";
import { buildWorldTree, flattenWorldTree, groupWorldTreeByCategory, worldTabId } from "@/lib/world";
import { cn } from "@/lib/utils";
import { useWorldEntries } from "@/stores/worldStore";
import type { WorldModule } from "@/types";

/** Clé d'un groupe replié (catégorie, ou `null` pour les types inconnus). */
const groupKey = (category: string | null) => category ?? "_other";

const storageKey = (module: WorldModule) => `ganis-sidebar-world-groups-${module}`;

function recallGroups(module: WorldModule): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(module));
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function rememberGroups(module: WorldModule, groups: Set<string>) {
  try {
    localStorage.setItem(storageKey(module), JSON.stringify([...groups]));
  } catch {
    /* stockage indisponible : l'état reste pour la session */
  }
}

/**
 * Objets (ou faune et flore) du projet dans le panneau du module, rangés par
 * catégorie (armes, véhicules… ; faune, flore) : la flèche d'une catégorie
 * la replie ou la déplie. Dans une catégorie, l'arborescence est gardée : un
 * objet rangé dans un autre, un animal précis sous son espèce. Un clic ouvre
 * la fiche.
 */
export function SideBarWorld({
  projectId,
  module,
  activeTab,
  onOpenFeature,
}: {
  projectId: string;
  module: WorldModule;
  activeTab: string | null;
  onOpenFeature: (featureId: string) => void;
}) {
  const { t: typed } = useTranslation("world");
  const t = typed as unknown as (key: string, options?: Record<string, unknown>) => string;
  const { entries, settings, loaded } = useWorldEntries(projectId, module);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [closedGroups, setClosedGroups] = useState<Set<string>>(() => recallGroups(module));
  const headingId = `sidebar-world-${module}`;

  const groups = useMemo(
    () => groupWorldTreeByCategory(module, buildWorldTree(entries), settings.customTypes),
    [module, entries, settings.customTypes],
  );

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(key: string) {
    setClosedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      rememberGroups(module, next);
      return next;
    });
  }

  return (
    <section aria-labelledby={headingId} className="mt-4 flex min-h-0 flex-1 flex-col">
      <h3 id={headingId} className="px-4 pb-1 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
        {t(`${module}.sidebar.title`)}
        {loaded && entries.length > 0 && ` (${entries.length})`}
      </h3>

      {!loaded ? (
        <p className="px-4 text-xs text-muted-foreground">{t("sidebar.loading")}</p>
      ) : entries.length === 0 ? (
        <p className="px-4 text-xs text-muted-foreground">{t(`${module}.sidebar.empty`)}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" role="tree">
          {groups.map((group) => {
            const key = groupKey(group.category);
            const open = !closedGroups.has(key);
            const label = group.category ? t(`${module}.categories.${group.category}.label`) : t("sidebar.otherCategory");
            const rows = flattenWorldTree(group.nodes, collapsed);

            return (
              <li key={key} role="treeitem" aria-level={1} aria-expanded={open} aria-label={label} className="mt-1 first:mt-0">
                <button
                  type="button"
                  onClick={() => toggleGroup(key)}
                  title={open ? t("sidebar.collapseCategory") : t("sidebar.expandCategory")}
                  className="flex w-full items-center gap-1 rounded-md py-1 pr-2 text-xs font-semibold text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center">
                    {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  </span>
                  <span className="flex-1 truncate text-left">{label}</span>
                  <span className="tabular-nums font-normal">{group.count}</span>
                </button>

                {open && (
                  <ul role="group">
                    {rows.map(({ entry, depth, children }) => {
                      const tabId = worldTabId(module, entry.id);
                      const active = activeTab === tabId;
                      const expanded = !collapsed.has(entry.id);

                      return (
                        <li
                          key={entry.id}
                          role="treeitem"
                          aria-level={depth + 2}
                          aria-expanded={children.length > 0 ? expanded : undefined}
                          className="flex items-center"
                          style={{ paddingLeft: `${(depth + 1) * 0.875}rem` }}
                        >
                          <button
                            type="button"
                            tabIndex={children.length > 0 ? 0 : -1}
                            onClick={() => toggle(entry.id)}
                            aria-label={expanded ? t("list.collapse") : t("list.expand")}
                            className={cn(
                              "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent",
                              children.length === 0 && "invisible",
                            )}
                          >
                            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
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
                            <WorldThumb projectId={projectId} module={module} entry={entry} customTypes={settings.customTypes} size="panel" />
                            <span className="flex-1 truncate text-left">{entry.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
