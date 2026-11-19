import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { History, Loader2 } from "lucide-react";
import { ContinuityLevelSelect, ContinuityModeSwitch, type ContinuityMode } from "@/components/structure/ContinuityControls";
import { PresenceTable } from "@/components/structure/PresenceTable";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { PageShell } from "@/components/workspace/views/PageShell";
import { fullName } from "@/lib/characters";
import { appearanceCounts, characterAppearances, presenceTable, type ContinuityExtra } from "@/lib/continuity";
import { isSeriesProject } from "@/lib/series";
import { chapterLevel } from "@/lib/novel";
import { structureNodeTabId } from "@/lib/structure";
import { cn } from "@/lib/utils";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectLocations } from "@/stores/locationStore";
import { useSeriesBlocks } from "@/stores/seriesStore";
import { useProjectStructureLinks } from "@/stores/structureStore";
import type { Project } from "@/types";

interface StoryContinuityViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

const select = "h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring";

/**
 * Continuité (tous les types de projet sauf le manga, qui a la sienne case
 * par case) :
 * - parcours d'un personnage : chaque élément où il apparaît, dans l'ordre
 *   du plan, avec son rôle, son état, le lieu ; un état qui change est
 *   signalé, c'est là que naissent les incohérences ;
 * - tableau des présences : qui apparaît dans quel chapitre, épisode…
 *
 * Les présences viennent des personnages liés aux éléments (fiche d'un
 * élément) ; pour une série, aussi des répliques et du lieu de l'en-tête.
 */
export function StoryContinuityView({ project, feature, onOpenFeature }: StoryContinuityViewProps) {
  const { t } = useTranslation("structure");
  const { structure, labelOf, levels } = useProjectStructure(project.id);
  const links = useProjectStructureLinks(project.id);
  const { characters } = useProjectCharacters(project.id);
  const { locations } = useProjectLocations(project.id);
  const series = isSeriesProject(project);
  const { blocks } = useSeriesBlocks(project.id, series);
  const [tab, setTab] = useState<ContinuityMode>("path");
  const [characterId, setCharacterId] = useState("");
  const [locationId, setLocationId] = useState("");

  const levelCount = structure?.levels.length ?? 0;
  const [level, setLevel] = useState<number | null>(null);
  const columnLevel = level ?? chapterLevel(levelCount);

  // Série : répliques par scène et lieu de l'en-tête.
  const extra = useMemo<ContinuityExtra>(() => {
    if (!series) return {};
    const lines = new Map<string, Map<string, number>>();
    for (const block of blocks ?? []) {
      if (block.kind !== "dialogue" || !block.characterId || !block.content.trim()) continue;
      const byCharacter = lines.get(block.sceneId) ?? new Map<string, number>();
      byCharacter.set(block.characterId, (byCharacter.get(block.characterId) ?? 0) + 1);
      lines.set(block.sceneId, byCharacter);
    }
    const places = new Map<string, string[]>();
    for (const node of structure?.nodes ?? []) if (node.sceneLocationId) places.set(node.id, [node.sceneLocationId]);
    return { lines, places };
  }, [series, blocks, structure]);

  const counts = useMemo(() => appearanceCounts(links ?? { characters: [] }, extra), [links, extra]);
  const appearing = characters.filter((c) => counts.has(c.id)).sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  const selected = characterId && counts.has(characterId) ? characterId : (appearing[0]?.id ?? "");

  const rows = useMemo(
    () => (structure && links && selected ? characterAppearances(structure.nodes, links, selected, extra, locationId) : []),
    [structure, links, selected, extra, locationId],
  );
  const table = useMemo(() => (structure && links ? presenceTable(structure.nodes, links, columnLevel, extra) : null), [structure, links, columnLevel, extra]);

  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? "";
  const whereOf = (row: (typeof rows)[number]) => [...row.path.map(labelOf), labelOf(row.node)].join(" › ");
  const characterName = (id: string) => {
    const c = characters.find((item) => item.id === id);
    return c ? fullName(c) || "—" : "—";
  };
  const loading = !structure || !links || (series && !blocks);

  return (
    <PageShell title={feature.label}>
      <div className="space-y-5">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <ContinuityModeSwitch
                mode={tab}
                onMode={setTab}
                label={feature.label}
                labels={{ path: t("continuity.tabs.path"), presence: t("continuity.tabs.presence") }}
              />
              {tab === "presence" ? (
                <ContinuityLevelSelect levels={levels} level={columnLevel} onLevel={setLevel} hint={t("continuity.presenceHint")} />
              ) : (
                <>
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
                </>
              )}
              <p className="ml-auto pb-2 text-sm text-muted-foreground tabular-nums">
                {tab === "presence" ? table && t("continuity.characters", { count: table.rows.length }) : selected && t("continuity.appearances", { count: rows.length })}
              </p>
            </div>

            {tab === "presence" ? (
              table && (
                <PresenceTable
                  table={table}
                  labelOf={labelOf}
                  characterName={characterName}
                  onOpenFeature={onOpenFeature}
                  onCharacter={(id) => {
                    setCharacterId(id);
                    setTab("path");
                  }}
                />
              )
            ) : appearing.length === 0 ? (
              <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t("continuity.choose")}</p>
            ) : (
              rows.length === 0 ? (
                <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t("continuity.none")}</p>
              ) : (
                <ol className="relative space-y-2 border-l pl-5" data-testid="continuity-path">
                  {rows.map((row) => {
                    const places = row.places.map(locationName).filter(Boolean).join(", ");
                    return (
                      <li key={row.node.id} className="relative">
                        <span
                          className={cn("absolute top-3 -left-[25px] size-2.5 rounded-full border-2 border-background", row.changed ? "bg-warning" : row.role === "mentioned" ? "bg-muted-foreground/40" : "bg-primary/60")}
                          aria-hidden="true"
                        />
                        <button
                          type="button"
                          onClick={() => onOpenFeature(structureNodeTabId(row.node.id))}
                          className="w-full rounded-lg border bg-card px-4 py-2.5 text-left shadow-sm transition-colors hover:bg-muted/40"
                        >
                          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                            <span className="font-medium">{whereOf(row)}</span>
                            <span className="text-muted-foreground">· {row.role ? t(`node.roles.character.${row.role}`) : t("continuity.speaksOnly")}</span>
                            {places && <span className="text-muted-foreground">· {places}</span>}
                            {row.lines > 0 && <span className="ml-auto text-xs text-muted-foreground tabular-nums">{t("continuity.speaks", { count: row.lines })}</span>}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-xs font-medium text-muted-foreground">{t("continuity.state")}</span>
                            <span className={cn(!row.state && "text-muted-foreground", row.changed && "font-medium text-warning")}>{row.state || t("continuity.noState")}</span>
                            {row.changed && (
                              <span className="flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">
                                <History className="size-3" aria-hidden="true" />
                                {t("continuity.changed")} · {t("continuity.was", { state: row.previousState })}
                              </span>
                            )}
                          </p>
                          {row.node.summary.trim() && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{row.node.summary.trim()}</p>}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
