import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { buildStructureTree, flattenVisible, structureNodeTabId } from "@/lib/structure";
import { cn } from "@/lib/utils";

interface SideBarStructureProps {
  projectId: string;
  activeTab: string | null;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Arborescence du découpage dans le panneau du module « Découpage », sous
 * « Plan du récit » (comme les dossiers dans l'explorateur de VS Code).
 * Un clic ouvre la fiche de l'élément (personnages et lieux liés…) ; la
 * flèche replie ou déplie ce qu'il contient. Les noms et numéros sont ceux du plan, à jour à chaque
 * modification.
 */
export function SideBarStructure({ projectId, activeTab, onOpenFeature }: SideBarStructureProps) {
  const { t } = useTranslation("structure");
  const { structure, headingOf, colorOf } = useProjectStructure(projectId);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const rows = useMemo(
    () => (structure ? flattenVisible(buildStructureTree(structure.nodes), collapsed) : []),
    [structure, collapsed],
  );

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const total = structure?.nodes.length ?? 0;

  return (
    <section aria-labelledby="sidebar-structure" className="mt-4 flex min-h-0 flex-1 flex-col">
      <h3
        id="sidebar-structure"
        className="px-4 pb-1 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase"
      >
        {t("sidebar.title")}
        {total > 0 && ` (${total})`}
      </h3>

      {!structure ? (
        <p className="px-4 text-xs text-muted-foreground">{t("sidebar.loading")}</p>
      ) : total === 0 ? (
        <p className="px-4 text-xs text-muted-foreground">{t("sidebar.empty")}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-2" role="tree" aria-labelledby="sidebar-structure">
          {rows.map((node) => {
            const expanded = !collapsed.has(node.id);
            const heading = headingOf(node);
            const tabId = structureNodeTabId(node.id);
            const active = activeTab === tabId;

            return (
              <li
                key={node.id}
                role="treeitem"
                aria-level={node.depth + 1}
                aria-expanded={node.children.length > 0 ? expanded : undefined}
                className="flex items-center"
                style={{ paddingLeft: `${node.depth * 0.875}rem` }}
              >
                <button
                  type="button"
                  tabIndex={node.children.length > 0 ? 0 : -1}
                  onClick={() => toggle(node.id)}
                  aria-label={expanded ? t("sidebar.collapse") : t("sidebar.expand")}
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent",
                    node.children.length === 0 && "invisible",
                  )}
                >
                  {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                </button>

                <button
                  type="button"
                  title={heading.label}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onOpenFeature(tabId)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-sidebar-accent",
                    active && "bg-sidebar-accent",
                  )}
                >
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(node) }} />
                  <span className="min-w-0 flex-1 truncate text-left">
                    {heading.number !== null ? (
                      <>
                        <span className="font-medium">{heading.prefix}</span>
                        {heading.title && <span className="text-muted-foreground"> — {heading.title}</span>}
                      </>
                    ) : (
                      <span className="italic">{heading.label}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
