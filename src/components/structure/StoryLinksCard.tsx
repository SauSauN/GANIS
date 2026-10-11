import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, Sparkles } from "lucide-react";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import { cardContentClass } from "@/components/workspace/views/PageShell";
import { buildStructureTree, flattenVisible, structureNodeTabId } from "@/lib/structure";
import { useProjectStructureLinks } from "@/stores/structureStore";
import type { NodeCharacterRole, NodeLocationRole } from "@/types";

interface StoryLinksCardProps {
  projectId: string;
  side: "character" | "location";
  /** Personnage ou lieu de la fiche. */
  id: string;
  /** Élément du plan choisi comme « première apparition » (champ de la fiche). */
  firstAppearance?: string;
  onOpenFeature: (featureId: string) => void;
}

/**
 * « Dans le récit » : les éléments du plan (chapitres, scènes…) auxquels
 * le personnage ou le lieu est lié, avec son rôle, dans l'ordre du plan.
 * Un clic ouvre la fiche de l'élément. Les liens se font depuis la fiche
 * de l'élément.
 */
export function StoryLinksCard({ projectId, side, id, firstAppearance, onOpenFeature }: StoryLinksCardProps) {
  const { t } = useTranslation("structure");
  const { structure, headingOf, colorOf } = useProjectStructure(projectId);
  const links = useProjectStructureLinks(projectId);
  const [open, setOpen] = useCollapsible(`ganis.storyLinks.${side}.collapsed`);

  const rows = useMemo(() => {
    if (!structure || !links) return [];

    const roles = new Map<string, string>(
      side === "character"
        ? links.characters.filter((l) => l.characterId === id).map((l) => [l.nodeId, l.role])
        : links.locations.filter((l) => l.locationId === id).map((l) => [l.nodeId, l.role]),
    );

    return flattenVisible(buildStructureTree(structure.nodes), new Set())
      .filter((node) => roles.has(node.id))
      .map((node) => ({ node, role: roles.get(node.id)! }));
  }, [structure, links, side, id]);

  const first = firstAppearance ? structure?.nodes.find((node) => node.id === firstAppearance) : undefined;

  /** Élément parent, pour situer « Scène 1 » (« · Chapitre 3 »). */
  const parentOf = (parentId: string | null) => {
    const parent = parentId ? structure?.nodes.find((node) => node.id === parentId) : undefined;
    return parent ? headingOf(parent).label : null;
  };

  const roleLabel = (role: string) =>
    side === "character"
      ? t(`node.roles.character.${role as NodeCharacterRole}`)
      : t(`node.roles.location.${role as NodeLocationRole}`);

  return (
    <CollapsibleCard
      open={open}
      onOpenChange={setOpen}
      icon={BookOpen}
      title={t("story.title")}
      description={side === "character" ? t("story.characterDescription") : t("story.locationDescription")}
      count={rows.length}
      contentClassName={`${cardContentClass} space-y-4`}
    >
      {first && (
        <button
          type="button"
          onClick={() => onOpenFeature(structureNodeTabId(first.id))}
          className="inline-flex items-center gap-2 rounded-full border py-1 pr-3 pl-2 text-sm transition-colors hover:bg-muted/50"
        >
          <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
          <span className="text-muted-foreground">{t("story.firstAppearance")} :</span>
          <span className="font-medium">{headingOf(first).label}</span>
        </button>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("story.empty")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map(({ node, role }) => (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => onOpenFeature(structureNodeTabId(node.id))}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
              >
                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(node) }} />
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-medium">{headingOf(node).label}</span>
                  {parentOf(node.parentId) && (
                    <span className="text-muted-foreground"> · {parentOf(node.parentId)}</span>
                  )}
                </span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {roleLabel(role)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </CollapsibleCard>
  );
}
