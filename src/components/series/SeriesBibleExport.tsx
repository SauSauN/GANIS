import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ExportMenu } from "@/components/novel/ExportMenu";
import { api } from "@/lib/api";
import { fullName } from "@/lib/characters";
import { buildSeriesBible, stepOutline } from "@/lib/filmDocs";
import { htmlToBlocks, renderDocument, type ExportFormat } from "@/lib/novelExport";
import type { Project } from "@/types";
import { useFilmScript } from "./useFilmScript";

/**
 * « Exporter la bible » d'une série : le concept (synopsis du projet), les
 * personnages, puis chaque saison et ses épisodes (logline, résumé,
 * scénariste, durée visée). Rien ne s'écrit deux fois.
 */
export function SeriesBibleExport({ project }: { project: Project }) {
  const { t } = useTranslation("series");
  const { structure, levelCount, times, labelOf, duration, characters } = useFilmScript(project);
  const outline = useMemo(() => (structure ? stepOutline(structure.nodes, levelCount, times) : []), [structure, levelCount, times]);

  async function render(format: ExportFormat) {
    const synopsis = await api.getSynopsis(project.id);
    const doc = buildSeriesBible({
      project,
      synopsis: synopsis.content.trim() ? htmlToBlocks(synopsis.content, false) : [],
      characters: characters.map((c) => ({ name: fullName(c) || "—", role: t(`dossier.roles.${c.role}`, { defaultValue: c.role }), description: c.fields.description ?? "" })),
      outline,
      labelOf,
      duration,
      labels: {
        subtitle: t("bible.subtitle"),
        concept: t("bible.concept"),
        characters: t("dossier.characters"),
        seasons: t("bible.seasons"),
        logline: t("read.logline"),
        writer: t("read.writer"),
        runtime: (d) => t("dossier.runtime", { duration: d }),
      },
    });
    return renderDocument(doc, format);
  }

  return (
    <ExportMenu
      label={t("bible.export")}
      dialogTitle={t("bible.exportTitle")}
      fileBase={`${project.name} — ${t("bible.subtitle")}`}
      build={() => {
        throw new Error("render");
      }}
      render={render}
      disabled={!structure || outline.length === 0}
    />
  );
}
