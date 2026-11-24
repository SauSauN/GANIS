import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ExportMenu } from "@/components/novel/ExportMenu";
import { api } from "@/lib/api";
import { fullName } from "@/lib/characters";
import { buildFilmDossier, stepOutline, treatment } from "@/lib/filmDocs";
import { htmlToBlocks, renderDocument, type ExportFormat } from "@/lib/novelExport";
import { EMPTY_FILM } from "@/lib/series";
import type { Project } from "@/types";
import { useFilmScript } from "./useFilmScript";

/**
 * « Exporter le dossier » : ce que demandent les producteurs et les aides à
 * l'écriture, assemblé à partir de ce qui existe déjà — logline, pitch et
 * note d'intention (fiche du film), synopsis du projet (Détails ›
 * Synopsis), personnages, séquencier (résumés des séquences) et traitement
 * (résumés des scènes). Rien n'est écrit deux fois.
 */
export function FilmDossierExport({ project }: { project: Project }) {
  const { t } = useTranslation("series");
  const { details, structure, levelCount, times, entries, byScene, labelOf, headingOf, numbers, duration, characters } = useFilmScript(project);
  const outline = useMemo(() => (structure ? stepOutline(structure.nodes, levelCount, times) : []), [structure, levelCount, times]);
  const scenes = useMemo(() => treatment(entries, byScene), [entries, byScene]);

  async function render(format: ExportFormat) {
    const synopsis = await api.getSynopsis(project.id);
    const doc = buildFilmDossier({
      project,
      details: details ?? EMPTY_FILM,
      synopsis: synopsis.content.trim() ? htmlToBlocks(synopsis.content, false) : [],
      outline,
      scenes,
      labelOf,
      headingOf,
      numbers,
      duration,
      characters: characters.map((c) => ({ name: fullName(c) || "—", role: t(`dossier.roles.${c.role}`, { defaultValue: c.role }), description: c.fields.description ?? "" })),
      labels: {
        subtitle: t("dossier.subtitle"),
        writer: t("read.writer"),
        logline: t("dossier.logline"),
        pitch: t("dossier.fields.pitch"),
        intention: t("dossier.fields.intention"),
        synopsis: t("dossier.synopsis"),
        characters: t("dossier.characters"),
        outline: t("dossier.outline"),
        treatment: t("dossier.treatment"),
        runtime: (d) => t("dossier.runtime", { duration: d }),
      },
    });
    return renderDocument(doc, format);
  }

  return (
    <ExportMenu
      label={t("dossier.export")}
      dialogTitle={t("dossier.exportTitle")}
      fileBase={`${project.name} — ${t("dossier.subtitle")}`}
      build={() => {
        throw new Error("render");
      }}
      render={render}
      disabled={!details || !structure}
    />
  );
}
