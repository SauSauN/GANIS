import { useTranslation } from "react-i18next";
import type { PresenceColumn, PresenceRow } from "@/lib/continuity";
import { structureNodeTabId } from "@/lib/structure";
import { cn } from "@/lib/utils";
import type { StructureNode } from "@/types";

interface PresenceTableProps {
  table: { columns: PresenceColumn[]; rows: PresenceRow[] };
  labelOf: (node: StructureNode) => string;
  characterName: (id: string) => string;
  onOpenFeature: (featureId: string) => void;
  /** Clic sur un personnage : son parcours. */
  onCharacter: (id: string) => void;
}

/**
 * Tableau des présences : une ligne par personnage, une colonne par élément
 * du niveau choisi (chapitres, épisodes…). Commun à toutes les continuités,
 * celle du manga comprise ; le choix des colonnes est dans la barre de la
 * vue (`ContinuityLevelSelect`).
 */
export function PresenceTable({ table, labelOf, characterName, onOpenFeature, onCharacter }: PresenceTableProps) {
  const { t } = useTranslation("structure");
  return (
    <>
      {table.columns.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t("continuity.noColumns")}</p>
      ) : table.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t("continuity.noRows")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="text-sm" data-testid="presence-table">
            <thead>
              <tr className="border-b">
                <th className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-medium" />
                {table.columns.map(({ node }) => (
                  <th key={node.id} className="px-1 py-2 align-bottom text-xs font-normal text-muted-foreground">
                    <button type="button" className="max-w-24 truncate hover:text-foreground hover:underline" title={labelOf(node)} onClick={() => onOpenFeature(structureNodeTabId(node.id))}>
                      {labelOf(node)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.characterId} className="border-b last:border-0">
                  <th scope="row" className="sticky left-0 z-10 bg-card px-4 py-1.5 text-left font-normal">
                    <button type="button" className="max-w-48 truncate hover:underline" onClick={() => onCharacter(row.characterId)}>
                      {characterName(row.characterId)}
                    </button>
                  </th>
                  {row.cells.map((n, i) => (
                    <td key={table.columns[i].node.id} className="px-1 py-1.5 text-center">
                      <span
                        className={cn("inline-flex size-6 items-center justify-center rounded text-xs tabular-nums", n > 0 ? "bg-primary/15 font-medium text-primary" : "text-muted-foreground/30")}
                        title={n > 0 ? t("continuity.appearances", { count: n }) : t("continuity.absent")}
                      >
                        {n > 0 ? n : "·"}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
