import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, FileUp } from "lucide-react";
import { LoadingDots } from "@/components/common/LoadingDots";
import { Button } from "@/components/ui/button";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { PageShell } from "@/components/workspace/views/PageShell";
import { api } from "@/lib/api";
import { fullName } from "@/lib/characters";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { episodesInOrder } from "@/lib/series";
import { importedNames, nameKey, readScreenplayFile, SCREENPLAY_IMPORT_EXTENSIONS, titleCase, type ImportedScript } from "@/lib/screenplayImport";
import { useCharacterStore } from "@/stores/characterStore";
import { useLocationStore } from "@/stores/locationStore";
import { notifySeriesScriptChanged } from "@/stores/seriesStore";
import { useStructureStore } from "@/stores/structureStore";
import type { Project } from "@/types";
import { useFilmScript } from "./useFilmScript";

interface FilmImportViewProps {
  project: Project;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Import d'un scénario Fountain ou Final Draft : chaque scène devient une
 * scène du découpage, dans la séquence choisie, avec son en-tête et ses
 * éléments. Les personnages et les lieux sont reliés aux fiches du même
 * nom, ou créés.
 */
export function FilmImportView({ project, feature, onOpenFeature }: FilmImportViewProps) {
  const { t } = useTranslation("series");
  const { structure, levelCount, labelOf, characters, locations } = useFilmScript(project);
  const fetchStructure = useStructureStore((s) => s.fetchStructure);
  const fetchCharacters = useCharacterStore((s) => s.fetchCharacters);
  const fetchLocations = useLocationStore((s) => s.fetchLocations);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ImportedScript | null>(null);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState<"read" | "import" | null>(null);
  const [done, setDone] = useState<{ scenes: number; characters: number; locations: number } | null>(null);
  const [progress, setProgress] = useState(0);

  const sequences = useMemo(() => (structure ? episodesInOrder(structure.nodes, levelCount) : []), [structure, levelCount]);
  const parent = target || sequences[sequences.length - 1]?.id || "";

  const names = useMemo(() => (parsed ? importedNames(parsed) : { characters: [], locations: [] }), [parsed]);
  const characterKeys = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of characters) {
      map.set(nameKey(fullName(c)), c.id);
      if (c.firstName) map.set(nameKey(c.firstName), c.id);
    }
    return map;
  }, [characters]);
  const locationKeys = useMemo(() => new Map(locations.map((l) => [nameKey(l.name), l.id])), [locations]);
  const newCharacters = names.characters.filter((n) => !characterKeys.has(nameKey(n)));
  const newLocations = names.locations.filter((n) => !locationKeys.has(nameKey(n)));

  async function choose(f: File | undefined) {
    if (!f) return;
    setBusy("read");
    setDone(null);
    setParsed(null);
    setFile(f.name);
    try {
      const script = await readScreenplayFile(f);
      if (!script.scenes.length) notifyError(t("import.empty"), "series:import");
      else setParsed(script);
    } catch {
      notifyError(t("import.unreadable"), "series:import");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function runImport() {
    if (!parsed || !structure) return;
    const parentNode = structure.nodes.find((n) => n.id === parent);
    if (!parentNode) return;
    setBusy("import");
    setProgress(0);
    try {
      // Fiches manquantes d'abord : personnages, puis lieux.
      const charIds = new Map(characterKeys);
      for (const name of newCharacters) {
        const created = await api.createCharacter(project.id, { firstName: titleCase(name), lastName: "", role: "secondary", status: "alive", fields: {} });
        charIds.set(nameKey(name), created.id);
      }
      const locIds = new Map(locationKeys);
      for (const name of newLocations) {
        const created = await api.createLocation(project.id, { name, type: "city", parentId: null, status: "existing", fields: {} });
        locIds.set(nameKey(name), created.id);
      }
      let afterId: string | null = null;
      const lastChild = structure.nodes.filter((n) => n.parentId === parentNode.id).sort((a, b) => a.position - b.position).pop();
      afterId = lastChild?.id ?? null;
      for (const [index, scene] of parsed.scenes.entries()) {
        const node = await api.createStructureNode(project.id, { parentId: parentNode.id, level: parentNode.level + 1, title: "", afterId });
        afterId = node.id;
        await api.saveSceneScript(project.id, node.id, {
          place: scene.place,
          locationId: scene.location ? (locIds.get(nameKey(scene.location)) ?? null) : null,
          time: scene.time,
          blocks: scene.blocks.map((b) => ({
            kind: b.kind,
            characterId: b.character ? (charIds.get(nameKey(b.character)) ?? null) : null,
            parenthetical: b.parenthetical,
            content: b.content,
          })),
        });
        setProgress(index + 1);
      }
      await Promise.all([fetchStructure(project.id), fetchCharacters(project.id), fetchLocations(project.id)]);
      notifySeriesScriptChanged(project.id);
      setDone({ scenes: parsed.scenes.length, characters: newCharacters.length, locations: newLocations.length });
      setParsed(null);
    } catch (e) {
      notifyError(errorText(e), "series:import");
      await fetchStructure(project.id);
    } finally {
      setBusy(null);
    }
  }

  return (
    <PageShell title={feature.label} description={t("import.description")}>
      <div className="space-y-5">
        <input
          ref={input}
          type="file"
          accept={SCREENPLAY_IMPORT_EXTENSIONS.join(",")}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => void choose(e.target.files?.[0])}
        />

        {done && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm" role="status">
            <CheckCircle2 className="size-5 text-success" />
            <span>{t("import.done", { scenes: done.scenes, characters: done.characters, locations: done.locations })}</span>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => onOpenFeature("film.read")}>
              {t("import.openReading")}
            </Button>
          </div>
        )}

        {!parsed && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-12 text-center transition-colors hover:bg-muted/40 disabled:opacity-60"
          >
            {busy === "read" ? <LoadingDots className="size-8 text-muted-foreground" /> : <FileUp className="size-8 text-muted-foreground" />}
            <span className="font-medium">{busy === "read" ? t("import.reading") : t("import.choose")}</span>
            <span className="text-sm text-muted-foreground">{t("import.formats")}</span>
          </button>
        )}

        {parsed && (
          <section className="space-y-4 rounded-xl border bg-card p-5 shadow-sm" data-testid="import-preview">
            <div>
              <h2 className="font-semibold">{parsed.title || file}</h2>
              <p className="text-sm text-muted-foreground">{t("import.found", { count: parsed.scenes.length })}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1 text-sm">
                <p className="font-medium">{t("import.characters", { count: names.characters.length })}</p>
                <p className="text-muted-foreground">
                  {names.characters.map((n) => (newCharacters.includes(n) ? `${titleCase(n)} (${t("import.new")})` : titleCase(n))).join(", ") || "—"}
                </p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="font-medium">{t("import.locations", { count: names.locations.length })}</p>
                <p className="text-muted-foreground">{names.locations.map((n) => (newLocations.includes(n) ? `${n} (${t("import.new")})` : n)).join(", ") || "—"}</p>
              </div>
            </div>
            <ol className="max-h-56 list-inside list-decimal overflow-y-auto rounded-md border bg-background px-4 py-2 font-mono text-xs">
              {parsed.scenes.map((s, i) => (
                <li key={i} className="truncate py-0.5">
                  {s.heading || t("import.noHeading")} <span className="text-muted-foreground">· {t("import.blocks", { count: s.blocks.length })}</span>
                </li>
              ))}
            </ol>
            {sequences.length === 0 ? (
              <p className="text-sm text-destructive">{t("import.noSequence")}</p>
            ) : (
              <label className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{t("import.target")}</span>
                <select
                  value={parent}
                  onChange={(e) => setTarget(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2.5 pr-7 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  {sequences.map((s) => (
                    <option key={s.id} value={s.id}>
                      {labelOf(s)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex items-center gap-2">
              <Button onClick={() => void runImport()} disabled={busy !== null || !parent}>
                {busy === "import" ? <LoadingDots className="size-4" /> : <FileUp className="size-4" />}
                {busy === "import" ? t("import.importing", { done: progress, count: parsed.scenes.length }) : t("import.run")}
              </Button>
              <Button variant="ghost" disabled={busy !== null} onClick={() => setParsed(null)}>
                {t("import.cancel")}
              </Button>
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}
