import { useTranslation } from "react-i18next";
import { Lightbulb } from "lucide-react";
import { LinkList, LinkRow } from "@/components/links/LinkRow";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import { boardLinksTo, boardTabId, type BoardLinkKind } from "@/lib/boards";
import { useProjectBoards } from "@/stores/boardStore";

interface LinkedBoardsCardProps {
  projectId: string;
  /** L'élément montré par la fiche. */
  target: { kind: BoardLinkKind; id: string };
  /** Son nom (description de la carte). */
  name: string;
  onOpenFeature: (featureId: string) => void;
}

/**
 * « Planches d'inspiration » sur la fiche d'un élément (personnage, lieu,
 * fiche du monde, élément du découpage) : les planches qui lui sont liées ;
 * un clic ouvre la planche dans son onglet. Rien n'est affiché quand aucune
 * planche n'est liée.
 */
export function LinkedBoardsCard({ projectId, target, name, onOpenFeature }: LinkedBoardsCardProps) {
  const { t } = useTranslation("workspaceHome");
  const [open, setOpen] = useCollapsible(`ganis.sheet.boards.${target.kind}.collapsed`);
  const { boards } = useProjectBoards(projectId);
  const linked = boards.filter((board) => boardLinksTo(board.data, target.kind, target.id));

  if (linked.length === 0) return null;

  return (
    <CollapsibleCard
      open={open}
      onOpenChange={setOpen}
      icon={Lightbulb}
      title={t("boards.links.cardTitle")}
      description={t("boards.links.cardDescription", { name })}
      count={linked.length}
    >
      <LinkList>
        {linked.map((board) => {
          const colors = board.data.items.flatMap((item) => (item.kind === "palette" ? item.colors : [])).slice(0, 4);
          return (
            <LinkRow
              key={board.id}
              thumb={
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Lightbulb className="size-4" aria-hidden="true" />
                </span>
              }
              name={board.name}
              onOpen={() => onOpenFeature(boardTabId(board.id))}
              detail={t("boards.count", { count: board.data.items.length })}
              secondary={
                colors.length > 0 ? (
                  <span className="flex -space-x-1">
                    {colors.map((color, index) => (
                      <span key={index} className="size-3 rounded-full border-2 border-card" style={{ backgroundColor: color }} />
                    ))}
                  </span>
                ) : undefined
              }
            />
          );
        })}
      </LinkList>
    </CollapsibleCard>
  );
}
