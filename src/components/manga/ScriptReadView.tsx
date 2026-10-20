import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ListTree, Loader2, PenLine, ScrollText } from "lucide-react";
import { ExportMenu } from "@/components/novel/ExportMenu";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { Button } from "@/components/ui/button";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { fullName } from "@/lib/characters";
import { buildScriptExport, pagesInOrder, panelsByPage, textStats, type ScriptExportLabels } from "@/lib/manga";
import { structureNodeTabId } from "@/lib/structure";
import { cn } from "@/lib/utils";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectLocations } from "@/stores/locationStore";
import { useScriptPanels } from "@/stores/mangaStore";
import type { Panel, PanelTextKind, Project } from "@/types";

interface ScriptReadViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

const KIND_CLASS: Record<PanelTextKind, string> = {
  dialogue: "text-sky-700 dark:text-sky-300",
  thought: "text-violet-700 dark:text-violet-300",
  narration: "text-amber-700 dark:text-amber-300",
  sfx: "text-rose-700 dark:text-rose-300",
  sign: "text-emerald-700 dark:text-emerald-300",
};

/**
 * Scénario d'un manga / d'une BD d'un seul tenant : chapitres, pages et
 * cases numérotées avec leurs textes ; export PDF, Word ou texte pour le
 * dessinateur (tout le scénario ou un chapitre).
 */
export function ScriptReadView({ project, feature, onOpenFeature }: ScriptReadViewProps) {
  const { t } = useTranslation("manga");
  const { structure, labelOf } = useProjectStructure(project.id);
  const { panels } = useScriptPanels(project.id);
  const { characters } = useProjectCharacters(project.id);
  const { locations } = useProjectLocations(project.id);
  const [chapterId, setChapterId] = useState("");
  const [includeCast, setIncludeCast] = useState(true);

  const levelCount = structure?.levels.length ?? 0;
  const allEntries = useMemo(() => (structure ? pagesInOrder(structure.nodes, levelCount) : []), [structure, levelCount]);
  const chapters = useMemo(() => {
    const seen = new Map<string, NonNullable<(typeof allEntries)[number]["chapter"]>>();
    allEntries.forEach((e) => e.chapter && !seen.has(e.chapter.id) && seen.set(e.chapter.id, e.chapter));
    return [...seen.values()];
  }, [allEntries]);
  const entries = chapterId ? allEntries.filter((e) => e.chapter?.id === chapterId) : allEntries;
  const byPage = useMemo(() => panelsByPage(panels ?? []), [panels]);
  const characterName = (id: string | null) => {
    const c = id ? characters.find((x) => x.id === id) : undefined;
    return c ? fullName(c) || "—" : "";
  };
  const locationName = (id: string | null) => (id ? (locations.find((l) => l.id === id)?.name ?? "") : "");

  const labels: ScriptExportLabels = {
    subtitle: t("export.subtitle"),
    cast: t("export.cast"),
    places: t("export.places"),
    pageHeading: (label, count) => t("export.page", { label, count }),
    panelHeading: (number, framing) => [t("export.panel", { number }), framing].filter(Boolean).join(" — "),
    goal: t("export.goal"),
    rhythm: (value) => t("export.rhythm", { value }),
    pageTurn: t("export.pageTurn"),
    setting: t("export.setting"),
    place: t("export.place"),
    characters: t("export.characters"),
    notes: t("export.notes"),
    continuity: t("export.continuity"),
    textLabel: (kind, speaker) => {
      if (kind === "dialogue") return speaker ? t("export.text.dialogue", { speaker: speaker.toUpperCase() }) : t("export.text.dialogueAnon");
      if (kind === "thought") return speaker ? t("export.text.thought", { speaker: speaker.toUpperCase() }) : t("export.text.thoughtAnon");
      return t(`export.text.${kind}`);
    },
    framing: (value) => t(`framing.${value as "wide"}`),
    rhythmName: (value) => t(`rhythmShort.${value}`),
    noPanels: t("export.noPanels"),
  };

  const build = () =>
    buildScriptExport({
      project,
      entries,
      panels: byPage,
      labelOf,
      characters,
      locations,
      nameOf: (c) => fullName(c) || "—",
      includeCast,
      labels,
    });

  const chapter = chapters.find((c) => c.id === chapterId);
  const loading = !structure || panels === null;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">{feature.label}</h1>
      <div className="flex flex-wrap items-center gap-3 border-b bg-card/60 px-3 py-2">
        <select
          aria-label={t("read.all")}
          value={chapterId}
          onChange={(e) => setChapterId(e.target.value)}
          className="h-8 max-w-72 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">{t("read.all")}</option>
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>
              {labelOf(c)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeCast} onChange={(e) => setIncludeCast(e.target.checked)} className="size-4 accent-primary" />
          {t("read.includeCast")}
        </label>
        <div className="ml-auto">
          <ExportMenu
            label={t("read.export")}
            dialogTitle={t("read.dialogTitle")}
            fileBase={[project.name, chapter ? labelOf(chapter) : "", t("read.fileSuffix")].filter(Boolean).join(" - ")}
            build={build}
            disabled={loading || entries.length === 0}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]">
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          </p>
        ) : entries.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
            <ScrollText className="size-8 text-muted-foreground/60" aria-hidden="true" />
            <p className="mt-4 font-medium">{t("read.empty")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("read.emptyHint")}</p>
            <Button className="mt-5" variant="outline" onClick={() => onOpenFeature("structure.plan")}>
              <ListTree />
              {t("read.openPlan")}
            </Button>
          </div>
        ) : (
          <article className="mx-auto max-w-3xl space-y-4 px-6 py-8">
            <header className="mb-6">
              <p className="text-2xl font-semibold">{project.name}</p>
              <p className="text-sm text-muted-foreground">{t("export.subtitle")}</p>
            </header>
            {entries.map((entry, index) => {
              const list = byPage.get(entry.page.id) ?? [];
              const newChapter = entry.chapter && entry.chapter.id !== entries[index - 1]?.chapter?.id;
              return (
                <div key={entry.page.id} className="space-y-4">
                  {newChapter && entry.chapter && (
                    <div className={cn("space-y-1 pb-1", index > 0 && "mt-10 border-t pt-8")}>
                      <h2 className="text-xl font-semibold">{labelOf(entry.chapter)}</h2>
                      {entry.chapter.summary.trim() && <p className="text-sm text-muted-foreground italic">{entry.chapter.summary}</p>}
                      {entry.chapter.narrativeGoal.trim() && (
                        <p className="text-sm">
                          <span className="font-medium">{t("export.goal")}</span> {entry.chapter.narrativeGoal}
                        </p>
                      )}
                    </div>
                  )}
                  <PageBlock
                    label={labelOf(entry.page)}
                    page={entry.page}
                    panels={list}
                    characterName={characterName}
                    locationName={locationName}
                    onEdit={() => onOpenFeature(structureNodeTabId(entry.page.id))}
                  />
                </div>
              );
            })}
          </article>
        )}
      </div>
    </main>
  );
}

function PageBlock({
  label,
  page,
  panels,
  characterName,
  locationName,
  onEdit,
}: {
  label: string;
  page: { summary: string; rhythm: Panel["rhythm"]; pageTurn: boolean };
  panels: Panel[];
  characterName: (id: string | null) => string;
  locationName: (id: string | null) => string;
  onEdit: () => void;
}) {
  const { t } = useTranslation("manga");
  const words = textStats(panels.flatMap((p) => p.texts)).words;
  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <h3 className="font-semibold">{label}</h3>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t("page.panels", { count: panels.length })} · {t("words", { count: words, value: words.toLocaleString() })}
        </span>
        {page.rhythm && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t(`rhythmShort.${page.rhythm}`)}</span>}
        {page.pageTurn && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">{t("export.pageTurn")}</span>}
        <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={onEdit}>
          <PenLine />
          {t("read.editPage")}
        </Button>
      </header>
      <div className="space-y-4 px-4 py-3">
        {page.summary.trim() && <p className="text-sm text-muted-foreground">{page.summary}</p>}
        {panels.length === 0 && <p className="text-sm text-muted-foreground italic">{t("export.noPanels")}</p>}
        {panels.map((panel, i) => {
          const cast = panel.characters.map((c) => (c.state.trim() ? `${characterName(c.characterId)} (${c.state.trim()})` : characterName(c.characterId))).filter(Boolean);
          const where = [locationName(panel.locationId), panel.moment.trim()].filter(Boolean).join(" — ");
          return (
            <div key={panel.id} className="space-y-1.5">
              <p className="text-sm font-semibold">
                {t("export.panel", { number: i + 1 })}
                {panel.framing && <span className="font-normal text-muted-foreground"> · {t(`framing.${panel.framing}`)}</span>}
                {panel.rhythm && <span className="font-normal text-muted-foreground"> · {t(`rhythmShort.${panel.rhythm}`)}</span>}
              </p>
              {panel.action.trim() && <p className="leading-6 whitespace-pre-line">{panel.action}</p>}
              <dl className="space-y-0.5 pl-4 text-sm text-muted-foreground">
                {where && <Meta label={t("export.place")} value={where} />}
                {panel.setting.trim() && <Meta label={t("export.setting")} value={panel.setting} />}
                {cast.length > 0 && <Meta label={t("export.characters")} value={cast.join(", ")} />}
                {panel.artistNotes.trim() && <Meta label={t("export.notes")} value={panel.artistNotes} />}
                {panel.continuity.trim() && <Meta label={t("export.continuity")} value={panel.continuity} />}
              </dl>
              {panel.texts.some((x) => x.content.trim()) && (
                <ul className="space-y-1 pl-8 font-serif">
                  {panel.texts
                    .filter((x) => x.content.trim())
                    .map((text) => {
                      const speaker = characterName(text.characterId);
                      return (
                        <li key={text.id} className="leading-6">
                          <span className={cn("mr-1.5 font-sans text-xs font-semibold tracking-wide uppercase", KIND_CLASS[text.kind])}>
                            {(text.kind === "dialogue" || text.kind === "thought") && speaker ? speaker : t(`kind.${text.kind}`)}
                            {text.kind === "thought" && speaker && ` (${t("kind.thought").toLowerCase()})`}
                          </span>
                          <span className={cn(text.kind === "thought" && "italic", text.kind === "sfx" && "font-sans font-bold uppercase")}>{text.content}</span>
                        </li>
                      );
                    })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 font-medium">{label}</dt>
      <dd className="min-w-0 whitespace-pre-line">{value}</dd>
    </div>
  );
}
