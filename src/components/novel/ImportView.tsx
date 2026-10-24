import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileUp, Loader2, Upload } from "lucide-react";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/workspace/views/PageShell";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { toast } from "@/stores/toastStore";
import {
  buildPlan,
  IMPORT_EXTENSIONS,
  planCounts,
  readManuscriptFile,
  scenesOf,
  sectionWords,
  splitSections,
  type HeadingKind,
  type ImportSection,
} from "@/lib/manuscriptImport";
import { cn } from "@/lib/utils";
import { useStructureStore } from "@/stores/structureStore";
import type { ImportResult, Project } from "@/types";

interface ImportViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

const fieldClass = "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

/**
 * Import d'un manuscrit existant (roman) : le fichier est lu sur
 * l'ordinateur, découpé en parties, chapitres et scènes ; l'auteur ajuste
 * le découpage proposé puis l'ajoute à la fin du plan.
 */
export function ImportView({ project, feature, onOpenFeature }: ImportViewProps) {
  const { t } = useTranslation("novel");
  const { structure, levels } = useProjectStructure(project.id);
  const fetchStructure = useStructureStore((s) => s.fetchStructure);
  const input = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [sections, setSections] = useState<ImportSection[] | null>(null);
  const [split, setSplit] = useState(true);
  const [busy, setBusy] = useState<"read" | "import" | null>(null);
  // Erreurs en notification : la page ne bouge pas.
  const setError = (message: string | null) => {
    if (message) notifyError(message, "novel:import");
  };
  const [done, setDone] = useState<{ result: ImportResult; undone: boolean } | null>(null);

  const levelCount = structure?.levels.length ?? 3;
  const hasParts = levelCount >= 3;
  const plan = useMemo(() => (sections ? buildPlan(sections, levelCount, split, t("import.opening")) : []), [sections, levelCount, split, t]);
  const counts = planCounts(plan);
  const totalWords = sections?.reduce((sum, s) => sum + sectionWords(s), 0) ?? 0;

  async function choose(file: File | undefined) {
    if (!file) return;
    setBusy("read");
    setError(null);
    setDone(null);
    setSections(null);
    setFileName(file.name);
    try {
      const found = splitSections(await readManuscriptFile(file));
      if (!found.some((s) => sectionWords(s) > 0)) setError(t("import.empty"));
      else setSections(found);
    } catch (e) {
      console.error(e);
      setError(t("import.unreadable"));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  const update = (id: string, changes: Partial<ImportSection>) =>
    setSections((current) => current?.map((s) => (s.id === id ? { ...s, ...changes } : s)) ?? null);

  async function runImport() {
    setBusy("import");
    setError(null);
    try {
      const result = await api.importManuscript(project.id, plan);
      await fetchStructure(project.id);
      setDone({ result, undone: false });
      // Résultat en notification (rien ne bouge dans la page), avec
      // « Annuler l'import » et « Ouvrir le manuscrit ».
      toast({
        tone: "success",
        key: `import:${project.id}`,
        duration: 15000,
        message: t("import.done", { nodes: result.nodes.toLocaleString(), words: result.words.toLocaleString() }),
        action: { label: t("import.undo"), run: () => undo(result) },
        secondary: { label: t("import.openManuscript"), run: () => onOpenFeature("manuscript.read") },
      });
      setSections(null);
      setFileName(null);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function undo(imported: ImportResult | undefined = done?.result) {
    if (!imported) return;
    setBusy("import");
    setError(null);
    try {
      for (const id of imported.roots) await api.deleteStructureNode(project.id, id);
      await fetchStructure(project.id);
      setDone({ result: imported, undone: true });
      toast({ tone: "success", key: `import:${project.id}`, message: t("import.undone") });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const levelName = (level: number, count: number) => {
    const resolved = levels[Math.min(level, levels.length - 1)];
    return resolved ? (count > 1 ? resolved.other : resolved.one) : "";
  };
  const partLevel = 0;
  const chapterIndex = Math.max(0, levelCount - 2);
  const kindLabel = (kind: HeadingKind) => (kind === "part" ? levelName(partLevel, 1) : kind === "chapter" ? levelName(chapterIndex, 1) : t("import.asText"));

  return (
    <PageShell title={feature.label} description={t("import.formats")}>
      <div className="space-y-5">
        <input
          ref={input}
          type="file"
          accept={IMPORT_EXTENSIONS.join(",")}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => void choose(e.target.files?.[0])}
        />

        {!sections && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-12 text-center transition-colors hover:bg-muted/40 disabled:opacity-60"
          >
            {busy === "read" ? <Loader2 className="size-8 animate-spin text-muted-foreground" /> : <FileUp className="size-8 text-muted-foreground" />}
            <span className="font-medium">{busy === "read" ? t("import.reading") : t("import.choose")}</span>
            {fileName && busy === "read" && <span className="text-sm text-muted-foreground">{fileName}</span>}
          </button>
        )}



        {sections && (
          <section className="rounded-xl border bg-card shadow-sm">
            <header className="space-y-3 border-b px-5 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{fileName}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {[...counts.entries()]
                      .sort(([a], [b]) => a - b)
                      .map(([level, count]) => `${count.toLocaleString()} ${levelName(level, count).toLowerCase()}`)
                      .concat(t("import.words", { count: totalWords, value: totalWords.toLocaleString() }))
                      .join(" · ")}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => input.current?.click()}>
                    {t("import.other")}
                  </Button>
                  <Button disabled={busy !== null || plan.length === 0} onClick={() => void runImport()}>
                    {busy === "import" ? <Loader2 className="animate-spin" /> : <Upload />}
                    {busy === "import" ? t("import.applying") : t("import.apply")}
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} className="size-4 accent-primary" />
                  {t("import.splitScenes")}
                </label>
                <span className="text-xs text-muted-foreground">{t("import.appendHint")}</span>
              </div>
            </header>

            <h2 className="sr-only">{t("import.preview")}</h2>
            <ol className="divide-y">
              {sections.map((section) => {
                const words = sectionWords(section);
                const scenes = scenesOf(section.blocks, split).length;
                const opening = !section.heading;
                return (
                  <li
                    key={section.id}
                    className={cn(
                      "flex flex-wrap items-center gap-3 px-5 py-2",
                      section.kind === "part" && "bg-muted/40",
                      section.kind === "text" && "opacity-60",
                    )}
                  >
                    {opening ? (
                      <span className="w-32 shrink-0 text-sm italic text-muted-foreground">{t("import.opening")}</span>
                    ) : (
                      <select
                        aria-label={section.heading}
                        value={section.kind}
                        onChange={(e) => update(section.id, { kind: e.target.value as HeadingKind })}
                        className={cn(fieldClass, "w-32 shrink-0")}
                      >
                        {hasParts && <option value="part">{kindLabel("part")}</option>}
                        <option value="chapter">{kindLabel("chapter")}</option>
                        <option value="text">{kindLabel("text")}</option>
                      </select>
                    )}
                    <div className={cn("min-w-0 flex-1", section.kind === "chapter" && hasParts && "pl-4")}>
                      {opening || section.kind === "text" ? (
                        <p className="truncate text-sm">{section.heading || "—"}</p>
                      ) : (
                        <input
                          aria-label={section.heading}
                          value={section.title}
                          maxLength={200}
                          placeholder={section.heading}
                          onChange={(e) => update(section.id, { title: e.target.value })}
                          className={cn(fieldClass, "w-full max-w-md", section.kind === "part" && "font-medium")}
                        />
                      )}
                    </div>
                    {!opening && section.kind !== "text" && (
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={!section.numbered}
                          onChange={(e) => update(section.id, { numbered: !e.target.checked })}
                          className="size-3.5 accent-primary"
                        />
                        {t("import.unnumbered")}
                      </label>
                    )}
                    <span className="w-36 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                      {scenes > 0 && section.kind !== "text" && `${scenes} ${levelName(levelCount - 1, scenes).toLowerCase()} · `}
                      {words.toLocaleString()}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>
    </PageShell>
  );
}
