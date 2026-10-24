import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Camera,
  Cloud,
  FileImage,
  ListTree,
  Loader2,
  MapPin,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  RotateCw,
  ScrollText,
  Signpost,
  SquareText,
  Target,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { ExportMenu } from "@/components/novel/ExportMenu";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { Button } from "@/components/ui/button";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { fullName } from "@/lib/characters";
import { buildScriptExport, mangaLevels, pagesInOrder, panelsByPage, textStats, type ScriptExportLabels } from "@/lib/manga";
import { structureNodeTabId } from "@/lib/structure";
import { cn } from "@/lib/utils";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectLocations } from "@/stores/locationStore";
import { useScriptPanels } from "@/stores/mangaStore";
import { PANEL_TEXT_KINDS, type Panel, type PanelTextKind, type Project, type StructureNode } from "@/types";

interface ScriptReadViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

const TOC_KEY = "ganis.script.read.toc";
const DETAILS_KEY = "ganis.script.read.details";

/**
 * Scénario d'un manga / d'une BD d'un seul tenant : chapitres, pages et
 * cases numérotées avec leurs textes ; export PDF, Word ou texte pour le
 * dessinateur (tout le scénario ou un chapitre).
 *
 * Lecture : chaque élément a sa forme propre pour se repérer d'un coup
 * d'œil (tome en bandeau, chapitre avec filet, page en carte, case avec
 * son numéro en marge, et chaque type de texte avec sa forme de bulle et
 * sa couleur, rappelées par la légende). Sommaire à gauche ; les notes
 * techniques (décor, dessinateur, continuité) peuvent être masquées.
 */
export function ScriptReadView({ project, feature, onOpenFeature }: ScriptReadViewProps) {
  const { t } = useTranslation("manga");
  const { structure, labelOf } = useProjectStructure(project.id);
  const { panels } = useScriptPanels(project.id);
  const { characters } = useProjectCharacters(project.id);
  const { locations } = useProjectLocations(project.id);
  const [chapterId, setChapterId] = useState("");
  const [includeCast, setIncludeCast] = useState(true);
  const [toc, setToc] = useState(() => recall(TOC_KEY, true));
  const [details, setDetails] = useState(() => recall(DETAILS_KEY, true));
  const scrollRef = useRef<HTMLDivElement>(null);

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

  /**
   * Tome contenant un chapitre : l'élément du niveau juste au-dessus des
   * chapitres (Tome › Chapitre › Page, ou Arc › Tome › Chapitre › Page),
   * s'il y en a un.
   */
  const volumeLevel = mangaLevels(levelCount).chapter - 1;
  const volumeOf = (node: StructureNode | null): StructureNode | null => {
    if (!node || !structure || volumeLevel < 0 || node.level <= volumeLevel) return null;
    let current = node.parentId ? structure.nodes.find((n) => n.id === node.parentId) : undefined;
    while (current && current.level > volumeLevel) current = current.parentId ? structure.nodes.find((n) => n.id === current?.parentId) : undefined;
    return current?.level === volumeLevel ? current : null;
  };

  function toggleToc() {
    setToc(!toc);
    remember(TOC_KEY, !toc);
  }

  function toggleDetails() {
    setDetails(!details);
    remember(DETAILS_KEY, !details);
  }

  function scrollTo(id: string) {
    scrollRef.current?.querySelector(`[data-script="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">{feature.label}</h1>
      <div className="flex flex-wrap items-center gap-3 border-b bg-card/60 px-3 py-2">
        <Button variant="ghost" size="icon-sm" onClick={toggleToc} aria-label={t("read.toc")} aria-expanded={toc} title={t("read.toc")}>
          {toc ? <PanelLeftClose /> : <PanelLeftOpen />}
        </Button>
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
        <label className="flex items-center gap-2 text-sm" title={t("read.detailsHint")}>
          <input type="checkbox" checked={details} onChange={toggleDetails} className="size-4 accent-primary" />
          {t("read.details")}
        </label>
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

      <div className="flex min-h-0 flex-1">
        {/* Sommaire : chapitres et pages */}
        {toc && !loading && entries.length > 0 && (
          <nav aria-label={t("read.toc")} className="w-60 shrink-0 overflow-y-auto border-r bg-card/40 py-2">
            {entries.map((entry, index) => {
              const newChapter = entry.chapter && entry.chapter.id !== entries[index - 1]?.chapter?.id;
              const count = byPage.get(entry.page.id)?.length ?? 0;
              return (
                <div key={entry.page.id}>
                  {newChapter && entry.chapter && (
                    <button
                      type="button"
                      onClick={() => scrollTo(entry.chapter!.id)}
                      className="mt-1 flex w-full px-3 py-1.5 text-left text-sm font-semibold hover:bg-muted"
                    >
                      <span className="truncate">{labelOf(entry.chapter)}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => scrollTo(entry.page.id)}
                    className="flex w-full items-baseline justify-between gap-2 py-1 pr-3 pl-6 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <span className="truncate">{labelOf(entry.page)}</span>
                    <span className="shrink-0 text-xs tabular-nums">{count}</span>
                  </button>
                </div>
              );
            })}
          </nav>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]">
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
            <article className="mx-auto max-w-3xl px-6 py-8">
              <header className="mb-6 text-center">
                <p className="text-3xl font-semibold tracking-tight">{project.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("export.subtitle")}</p>
              </header>

              <Legend />

              {entries.map((entry, index) => {
                const list = byPage.get(entry.page.id) ?? [];
                const newChapter = entry.chapter && entry.chapter.id !== entries[index - 1]?.chapter?.id;
                const volume = newChapter ? volumeOf(entry.chapter) : null;
                const newVolume = volume && volume.id !== volumeOf(entries[index - 1]?.chapter ?? null)?.id;
                return (
                  <div key={entry.page.id}>
                    {newVolume && volume && (
                      <div className="mt-14 mb-2 flex items-center gap-3 text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
                        <span className="h-px flex-1 bg-border" />
                        {labelOf(volume)}
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    {newChapter && entry.chapter && (
                      <ChapterHeading
                        id={entry.chapter.id}
                        label={labelOf(entry.chapter)}
                        summary={entry.chapter.summary}
                        goal={entry.chapter.narrativeGoal}
                        first={index === 0}
                      />
                    )}
                    <PageBlock
                      id={entry.page.id}
                      label={labelOf(entry.page)}
                      page={entry.page}
                      panels={list}
                      details={details}
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
      </div>
    </main>
  );
}

/** Mémorise une préférence d'affichage (sans erreur si le stockage est indisponible). */
function remember(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Préférence gardée pour cette séance.
  }
}

function recall(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

// ----------------------------------------------------------------------------
// Types de texte : une forme et une couleur chacun, comme sur la planche
// ----------------------------------------------------------------------------

const KIND_ICON: Record<PanelTextKind, LucideIcon> = {
  dialogue: MessageCircle,
  thought: Cloud,
  narration: SquareText,
  sfx: Zap,
  sign: Signpost,
};

/** Étiquette (nom du type ou du locuteur). */
const KIND_LABEL: Record<PanelTextKind, string> = {
  dialogue: "text-sky-700 dark:text-sky-300",
  thought: "text-violet-700 dark:text-violet-300",
  narration: "text-amber-700 dark:text-amber-300",
  sfx: "text-rose-700 dark:text-rose-300",
  sign: "text-emerald-700 dark:text-emerald-300",
};

/** Forme du texte : bulle, bulle de pensée, cartouche, onomatopée, panneau. */
const KIND_BOX: Record<PanelTextKind, string> = {
  dialogue: "rounded-2xl border border-sky-300/70 bg-sky-50 dark:border-sky-700/60 dark:bg-sky-950/40",
  thought: "rounded-[1.25rem] border border-dashed border-violet-300 bg-violet-50 italic dark:border-violet-700/60 dark:bg-violet-950/40",
  narration: "rounded-sm border-l-4 border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30",
  sfx: "border-0 bg-transparent px-0 font-sans text-lg font-black tracking-wider text-rose-600 uppercase dark:text-rose-400",
  sign: "rounded-md border border-emerald-300/70 bg-emerald-50 font-sans text-sm dark:border-emerald-700/60 dark:bg-emerald-950/30",
};

function Legend() {
  const { t } = useTranslation("manga");
  return (
    <div className="mb-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-lg border bg-card/60 px-4 py-2.5 text-xs" aria-label={t("read.legend")}>
      <span className="font-medium text-muted-foreground">{t("read.legend")}</span>
      {PANEL_TEXT_KINDS.map((kind) => {
        const Icon = KIND_ICON[kind];
        return (
          <span key={kind} className={cn("flex items-center gap-1.5 font-semibold", KIND_LABEL[kind])}>
            <Icon className="size-3.5" aria-hidden="true" />
            {t(`kind.${kind}`)}
          </span>
        );
      })}
    </div>
  );
}

function ChapterHeading({ id, label, summary, goal, first }: { id: string; label: string; summary: string; goal: string; first: boolean }) {
  const { t } = useTranslation("manga");
  return (
    <div data-script={id} className={cn("mb-6 scroll-mt-6 border-l-4 border-primary pl-4", !first && "mt-14")}>
      <h2 className="text-2xl font-semibold tracking-tight">{label}</h2>
      {summary.trim() && <p className="mt-1 whitespace-pre-line text-muted-foreground italic">{summary}</p>}
      {goal.trim() && (
        <p className="mt-2 flex gap-1.5 text-sm">
          <Target className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="font-medium">{t("export.goal")}</span> {goal}
          </span>
        </p>
      )}
    </div>
  );
}

function PageBlock({
  id,
  label,
  page,
  panels,
  details,
  characterName,
  locationName,
  onEdit,
}: {
  id: string;
  label: string;
  page: { summary: string; rhythm: Panel["rhythm"]; pageTurn: boolean };
  panels: Panel[];
  details: boolean;
  characterName: (id: string | null) => string;
  locationName: (id: string | null) => string;
  onEdit: () => void;
}) {
  const { t } = useTranslation("manga");
  const words = textStats(panels.flatMap((p) => p.texts)).words;
  return (
    <>
      <section data-script={id} className="mb-5 scroll-mt-6 overflow-hidden rounded-xl border bg-card shadow-sm">
        <header className="flex flex-wrap items-center gap-2 border-b bg-muted/50 px-4 py-2.5">
          <FileImage className="size-4 text-muted-foreground" aria-hidden="true" />
          <h3 className="text-base font-semibold">{label}</h3>
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("page.panels", { count: panels.length })} · {t("words", { count: words, value: words.toLocaleString() })}
          </span>
          {page.rhythm && <span className="rounded-full border bg-background px-2 py-0.5 text-xs">{t(`rhythmShort.${page.rhythm}`)}</span>}
          {page.pageTurn && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">{t("export.pageTurn")}</span>}
          <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={onEdit}>
            <PenLine />
            {t("read.editPage")}
          </Button>
        </header>
        <div className="divide-y">
          {page.summary.trim() && <p className="px-4 py-3 text-sm whitespace-pre-line text-muted-foreground">{page.summary}</p>}
          {panels.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground italic">{t("export.noPanels")}</p>}
          {panels.map((panel, i) => (
            <PanelBlock key={panel.id} panel={panel} number={i + 1} details={details} characterName={characterName} locationName={locationName} />
          ))}
        </div>
      </section>
      {page.pageTurn && (
        <p className="-mt-2 mb-5 flex items-center justify-center gap-2 text-xs font-medium text-warning" aria-hidden="true">
          <RotateCw className="size-3.5" />
          {t("read.turnPage")}
        </p>
      )}
    </>
  );
}

function PanelBlock({
  panel,
  number,
  details,
  characterName,
  locationName,
}: {
  panel: Panel;
  number: number;
  details: boolean;
  characterName: (id: string | null) => string;
  locationName: (id: string | null) => string;
}) {
  const { t } = useTranslation("manga");
  const cast = panel.characters.map((c) => (c.state.trim() ? `${characterName(c.characterId)} (${c.state.trim()})` : characterName(c.characterId))).filter(Boolean);
  const where = [locationName(panel.locationId), panel.moment.trim()].filter(Boolean).join(" — ");
  const texts = panel.texts.filter((x) => x.content.trim());
  return (
    <div className="flex gap-3 px-4 py-4">
      {/* Numéro de case, bien visible dans la marge */}
      <div className="flex shrink-0 flex-col items-center">
        <span
          className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary tabular-nums"
          aria-label={t("export.panel", { number })}
          title={t("export.panel", { number })}
        >
          {number}
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        {(panel.framing || panel.rhythm) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {panel.framing && (
            <span className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
              <Camera className="size-3" aria-hidden="true" />
              {t(`framing.${panel.framing}`)}
            </span>
          )}
          {panel.rhythm && <span className="rounded-full border px-2 py-0.5 text-xs">{t(`rhythmShort.${panel.rhythm}`)}</span>}
        </div>
        )}

        {panel.action.trim() && <p className="text-[0.95rem] leading-7 whitespace-pre-line">{panel.action}</p>}

        {(where || cast.length > 0) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {where && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="sr-only">{t("export.place")}</span>
                {where}
              </span>
            )}
            {cast.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Users className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="sr-only">{t("export.characters")}</span>
                {cast.join(", ")}
              </span>
            )}
          </div>
        )}

        {texts.length > 0 && (
          <ul className="space-y-2 pt-1">
            {texts.map((text) => {
              const speaker = characterName(text.characterId);
              const Icon = KIND_ICON[text.kind];
              const named = (text.kind === "dialogue" || text.kind === "thought") && speaker;
              return (
                <li key={text.id} className={cn("max-w-prose px-3.5 py-2", KIND_BOX[text.kind])}>
                  <span className={cn("mb-0.5 flex items-center gap-1.5 font-sans text-[0.7rem] font-semibold tracking-wide uppercase not-italic", KIND_LABEL[text.kind])}>
                    <Icon className="size-3" aria-hidden="true" />
                    {named ? speaker : t(`kind.${text.kind}`)}
                    {named && <span className="font-normal opacity-75">· {t(`kind.${text.kind}`)}</span>}
                  </span>
                  <span className={cn("block leading-6 whitespace-pre-line", text.kind !== "sfx" && text.kind !== "sign" && "font-serif")}>{text.content}</span>
                </li>
              );
            })}
          </ul>
        )}

        {details && (panel.setting.trim() || panel.artistNotes.trim() || panel.continuity.trim()) && (
          <dl className="space-y-1 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {panel.setting.trim() && <Meta label={t("export.setting")} value={panel.setting} />}
            {panel.artistNotes.trim() && <Meta label={t("export.notes")} value={panel.artistNotes} />}
            {panel.continuity.trim() && <Meta label={t("export.continuity")} value={panel.continuity} />}
          </dl>
        )}
      </div>
    </div>
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