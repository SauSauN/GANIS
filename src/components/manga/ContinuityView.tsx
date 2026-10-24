import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { History } from "lucide-react";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { PageShell } from "@/components/workspace/views/PageShell";
import { fullName } from "@/lib/characters";
import { pagesInOrder, panelsByPage } from "@/lib/manga";
import { structureNodeTabId } from "@/lib/structure";
import { cn } from "@/lib/utils";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectLocations } from "@/stores/locationStore";
import { useScriptPanels } from "@/stores/mangaStore";
import type { Project } from "@/types";

interface ContinuityViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Continuité : toutes les cases où apparaît un personnage, dans l'ordre de
 * lecture, avec le lieu, le moment et son état. Un état qui change d'une
 * case à l'autre est signalé : c'est là que naissent les incohérences.
 */
export function ContinuityView({ project, feature, onOpenFeature }: ContinuityViewProps) {
  const { t } = useTranslation("manga");
  const { structure, labelOf } = useProjectStructure(project.id);
  const { panels } = useScriptPanels(project.id);
  const { characters } = useProjectCharacters(project.id);
  const { locations } = useProjectLocations(project.id);
  const [characterId, setCharacterId] = useState("");
  const [locationId, setLocationId] = useState("");

  const levelCount = structure?.levels.length ?? 0;
  const entries = useMemo(() => (structure ? pagesInOrder(structure.nodes, levelCount) : []), [structure, levelCount]);
  const byPage = useMemo(() => panelsByPage(panels ?? []), [panels]);

  // Personnages qui apparaissent (présents ou qui parlent), par nombre de cases.
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const panel of panels ?? []) {
      const ids = new Set([...panel.characters.map((c) => c.characterId), ...panel.texts.map((x) => x.characterId).filter((x): x is string => Boolean(x))]);
      ids.forEach((id) => map.set(id, (map.get(id) ?? 0) + 1));
    }
    return map;
  }, [panels]);
  const appearing = characters.filter((c) => counts.has(c.id)).sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  const selected = characterId || appearing[0]?.id || "";

  const rows = useMemo(() => {
    const out: Array<{ key: string; pageId: string; where: string; place: string; number: number; state: string; changed: boolean; lines: number; action: string }> = [];
    let previous = "";
    for (const entry of entries) {
      (byPage.get(entry.page.id) ?? []).forEach((panel, index) => {
        const presence = panel.characters.find((c) => c.characterId === selected);
        const lines = panel.texts.filter((x) => x.characterId === selected && x.content.trim()).length;
        if (!presence && lines === 0) return;
        if (locationId && panel.locationId !== locationId) return;
        const state = presence?.state.trim() ?? "";
        const changed = Boolean(state) && Boolean(previous) && state !== previous;
        if (state) previous = state;
        out.push({
          key: panel.id,
          pageId: entry.page.id,
          where: [entry.chapter ? labelOf(entry.chapter) : "", labelOf(entry.page)].filter(Boolean).join(" › "),
          place: [locations.find((l) => l.id === panel.locationId)?.name ?? "", panel.moment.trim()].filter(Boolean).join(" — "),
          number: index + 1,
          state,
          changed,
          lines,
          action: panel.action.trim(),
        });
      });
    }
    return out;
  }, [entries, byPage, selected, locationId, labelOf, locations]);

  const select = "h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring";

  return (
    <PageShell title={feature.label}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1.5 text-sm font-medium">
            <span className="block">{t("continuity.character")}</span>
            <select value={selected} onChange={(e) => setCharacterId(e.target.value)} className={cn(select, "w-64")}>
              {appearing.length === 0 && <option value="">—</option>}
              {appearing.map((c) => (
                <option key={c.id} value={c.id}>
                  {fullName(c) || "—"} ({counts.get(c.id)})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            <span className="block">{t("continuity.location")}</span>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={cn(select, "w-56")}>
              <option value="">{t("continuity.allLocations")}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          {selected && <p className="pb-2 text-sm text-muted-foreground tabular-nums">{t("continuity.appearances", { count: rows.length })}</p>}
        </div>

        {!selected ? (
          <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t("continuity.choose")}</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t("continuity.none")}</p>
        ) : (
          <ol className="relative space-y-2 border-l pl-5">
            {rows.map((row) => (
              <li key={row.key} className="relative">
                <span className={cn("absolute top-3 -left-[25px] size-2.5 rounded-full border-2 border-background", row.changed ? "bg-warning" : "bg-primary/60")} aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => onOpenFeature(structureNodeTabId(row.pageId))}
                  className="w-full rounded-lg border bg-card px-4 py-2.5 text-left shadow-sm transition-colors hover:bg-muted/40"
                >
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium">{row.where}</span>
                    <span className="text-muted-foreground">· {t("panel.title", { number: row.number })}</span>
                    {row.place && <span className="text-muted-foreground">· {row.place}</span>}
                    {row.lines > 0 && <span className="ml-auto text-xs text-muted-foreground tabular-nums">{t("continuity.speaks", { count: row.lines })}</span>}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">{t("continuity.state")}</span>
                    <span className={cn(!row.state && "text-muted-foreground", row.changed && "font-medium text-warning")}>{row.state || t("continuity.noState")}</span>
                    {row.changed && (
                      <span className="flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">
                        <History className="size-3" aria-hidden="true" />
                        {t("continuity.changed")}
                      </span>
                    )}
                  </p>
                  {row.action && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{row.action}</p>}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </PageShell>
  );
}
