import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { fullName } from "@/lib/characters";
import { episodeSceneLabels, sceneLabels, sceneTimes } from "@/lib/filmTools";
import { blocksByScene, formatMinutes, isFilmProject, sceneHeadingText, scenesInOrder, type SeriesExportInput } from "@/lib/series";
import type { LayoutLabels } from "@/lib/screenplayLayout";
import { useProjectCharacters } from "@/stores/characterStore";
import { useProjectLocations } from "@/stores/locationStore";
import { useFilmDetails, useSeriesBlocks } from "@/stores/seriesStore";
import { useProjectStructureLinks } from "@/stores/structureStore";
import type { Project, ScenePlace, SceneTime } from "@/types";

/**
 * Tout le scénario d'une série ou d'un film, prêt à afficher : scènes dans
 * l'ordre du plan, éléments par scène, numéros (verrouillés pour un film),
 * minute de début et durée de chaque scène, personnages présents, fiche du
 * film, libellés des en-têtes et des durées.
 */
export function useFilmScript(project: Project) {
  const { t } = useTranslation("series");
  const film = isFilmProject(project);
  const { structure, labelOf, colorOf, levels } = useProjectStructure(project.id);
  const { blocks, error } = useSeriesBlocks(project.id);
  const { characters } = useProjectCharacters(project.id);
  const { locations } = useProjectLocations(project.id);
  // Fiche du film : pour un film ; révisions et numéros verrouillés : film et série.
  const { film: details, save: saveDetails } = useFilmDetails(project.id, true);
  const links = useProjectStructureLinks(project.id);

  const levelCount = structure?.levels.length ?? 0;
  const entries = useMemo(() => (structure ? scenesInOrder(structure.nodes, levelCount) : []), [structure, levelCount]);
  const byScene = useMemo(() => blocksByScene(blocks ?? []), [blocks]);
  // Base : 1, 2, 3… pour un film ; épisode.scène pour une série. Verrouillés : ceux du tournage.
  const base = useMemo(() => (film ? undefined : episodeSceneLabels(entries)), [film, entries]);
  const numbers = useMemo(() => sceneLabels(entries, details?.lockedNumbers ?? {}, base), [entries, details?.lockedNumbers, base]);
  const times = useMemo(() => sceneTimes(entries, byScene), [entries, byScene]);
  // Personnages liés à chaque scène (présents sans forcément parler).
  const present = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of links?.characters ?? []) {
      const set = map.get(link.nodeId) ?? new Set<string>();
      set.add(link.characterId);
      map.set(link.nodeId, set);
    }
    return map;
  }, [links]);

  const headingLabels = useMemo(
    () => ({
      place: (v: ScenePlace) => t(`place.${v}`),
      time: (v: SceneTime) => t(`time.${v}`),
    }),
    [t],
  );
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? null;
  const headingOf = (scene: (typeof entries)[number]["scene"]) => sceneHeadingText(scene, locationName, headingLabels) || labelOf(scene).toUpperCase();
  const characterName = (id: string | null) => {
    const c = id ? characters.find((item) => item.id === id) : undefined;
    return c ? fullName(c) || "—" : "—";
  };
  const duration = (minutes: number) =>
    formatMinutes(minutes, {
      lessThanOne: t("duration.lessThanOne"),
      minutes: (n) => t("duration.minutes", { count: n }),
      hours: (h, m) => t("duration.hours", { hours: h, minutes: m }),
    });
  const layoutLabels: LayoutLabels = { more: t("layout.more"), contd: t("layout.contd") };

  /** Données de l'export du scénario (lecture, extraits d'un comédien). */
  const exportInput = (selection = entries): SeriesExportInput => ({
    project,
    entries: selection,
    blocks: byScene,
    labelOf,
    characters,
    locations,
    nameOf: (c) => fullName(c) || "—",
    labels: {
      ...headingLabels,
      subtitle: t("read.subtitle"),
      untitledScene: (label) => t("read.untitledScene", { label }),
      logline: t("read.logline"),
      writer: t("read.writer"),
      noScript: t("read.noScript"),
    },
    ...(film && details ? { film: details } : {}),
  });

  return {
    film,
    structure,
    levels,
    labelOf,
    colorOf,
    levelCount,
    blocks,
    error,
    loading: !structure || !blocks,
    entries,
    byScene,
    numbers,
    baseNumbers: base,
    times,
    present,
    links,
    characters,
    locations,
    details,
    saveDetails,
    headingOf,
    characterName,
    duration,
    layoutLabels,
    exportInput,
  };
}

export type FilmScript = ReturnType<typeof useFilmScript>;
