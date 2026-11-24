import { useTranslation } from "react-i18next";
import { Lightbulb, Plus } from "lucide-react";
import { BoardItemMenu } from "@/components/common/PanelItemMenus";
import { boardIdOfTab, boardTabId } from "@/lib/boards";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useBoardStore, useProjectBoards } from "@/stores/boardStore";

interface SideBarBoardsProps {
  projectId: string;
  activeTab: string | null;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Planches d'inspiration dans le panneau du module Notes, à la place des
 * dossiers et des notes tant qu'un onglet de planches est ouvert : un clic
 * ouvre la planche dans son propre onglet, « + » en crée une.
 */
export function SideBarBoards({ projectId, activeTab, onOpenFeature }: SideBarBoardsProps) {
  const { t } = useTranslation("workspaceHome");
  const { boards, loaded } = useProjectBoards(projectId);
  const create = useBoardStore((s) => s.create);
  const current = boardIdOfTab(activeTab);

  async function createBoard() {
    try {
      const created = await create(projectId, t("boards.defaultName", { number: boards.length + 1 }));
      onOpenFeature(boardTabId(created.id));
    } catch (e) {
      notifyError(errorText(e), "boards");
    }
  }

  return (
    <section aria-labelledby="sidebar-boards" className="mt-4 flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 px-4 pb-1">
        <h3 id="sidebar-boards" className="flex-1 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
          {t("boards.boards")}
          {loaded && ` (${boards.length})`}
        </h3>
        <button
          type="button"
          onClick={() => void createBoard()}
          title={t("boards.newBoard")}
          aria-label={t("boards.newBoard")}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      </div>
      {!loaded ? (
        <p className="px-4 text-xs text-muted-foreground">{t("boards.loading")}</p>
      ) : boards.length === 0 ? (
        <p className="px-4 text-xs text-muted-foreground">{t("boards.empty")}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {boards.map((board) => {
            const open = () => onOpenFeature(boardTabId(board.id));
            return (
              // Clic droit : ouvrir, renommer, dupliquer, supprimer (comme les notes).
              <BoardItemMenu key={board.id} projectId={projectId} board={board} onOpen={open}>
                {(onContextMenu) => (
                  <li onContextMenu={onContextMenu}>
                    <button
                      type="button"
                      aria-current={board.id === current ? "page" : undefined}
                      onClick={open}
                      className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent", board.id === current && "bg-sidebar-accent font-medium")}
                    >
                      <Lightbulb className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-left">{board.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{board.data.items.length || ""}</span>
                    </button>
                  </li>
                )}
              </BoardItemMenu>
            );
          })}
        </ul>
      )}
    </section>
  );
}
