import { revisedBlocks } from "@/lib/filmTools";
import { elementsToDocx, pagesToPdf, pagesToText, paginate, type LayoutLabels, type RenderOptions, type ScreenplayElement } from "@/lib/screenplayLayout";
import { sceneHeadingText, type SeriesExportInput } from "@/lib/series";
import type { ExportFormat } from "@/lib/novelExport";

/*
 * Export d'un scénario (série ou film) au format standard : éléments mis
 * en page (`screenplayLayout`), puis PDF, texte paginé ou Word.
 */

export interface ScreenplayExportOptions {
  /** Numéros de scène à imprimer (film : 1, 2, 12A…) ; absent : pas de numéros. */
  labels?: Map<string, string>;
  /** Début de la révision en cours : les éléments modifiés depuis sont marqués. */
  revisionSince?: string | null;
  /** En-tête de chaque page (révision en cours). */
  header?: string;
  layout: LayoutLabels;
}

function speaker(input: SeriesExportInput, id: string | null): string {
  const character = id ? input.characters.find((c) => c.id === id) : undefined;
  return character ? input.nameOf(character) : "—";
}

/**
 * Éléments du scénario dans l'ordre : titres de saison et d'épisode (série
 * seulement), en-têtes de scène, puis les éléments. Une réplique du même
 * personnage après une action, dans la même scène, est suivie de
 * « (SUITE) ».
 */
export function screenplayElements(input: SeriesExportInput, options: Pick<ScreenplayExportOptions, "labels" | "revisionSince">): ScreenplayElement[] {
  const film = input.film ?? null;
  const locationName = (id: string) => input.locations.find((l) => l.id === id)?.name ?? null;
  const out: ScreenplayElement[] = [];
  let season: string | null | undefined;
  let episode: string | null | undefined;

  for (const entry of input.entries) {
    if (!film) {
      if ((entry.season?.id ?? null) !== season) {
        season = entry.season?.id ?? null;
        if (entry.season) out.push({ type: "section", text: input.labelOf(entry.season), pageBreakBefore: out.length > 0 });
      }
      if ((entry.episode?.id ?? null) !== episode) {
        episode = entry.episode?.id ?? null;
        if (entry.episode) out.push({ type: "section", text: input.labelOf(entry.episode), pageBreakBefore: out.length > 0 && out[out.length - 1].type !== "section" });
      }
    }
    const blocks = (input.blocks.get(entry.scene.id) ?? []).filter((b) => b.kind !== "note" && b.content.trim());
    const revised = revisedBlocks(blocks, options.revisionSince);
    const heading = sceneHeadingText(entry.scene, locationName, input.labels) || input.labels.untitledScene(input.labelOf(entry.scene));
    out.push({ type: "heading", text: heading, number: options.labels?.get(entry.scene.id) });
    if (!blocks.length) {
      out.push({ type: "action", text: input.labels.noScript });
      continue;
    }
    let lastSpeaker: string | null = null;
    let interrupted = false;
    for (const block of blocks) {
      const content = block.content.trim();
      const isRevised = revised.has(block.id);
      if (block.kind === "dialogue") {
        const contd = lastSpeaker !== null && lastSpeaker === block.characterId && interrupted;
        out.push({ type: "dialogue", character: speaker(input, block.characterId), parenthetical: block.parenthetical, text: content, contd, revised: isRevised });
        lastSpeaker = block.characterId;
        interrupted = false;
      } else if (block.kind === "transition") {
        out.push({ type: "transition", text: content, revised: isRevised });
        lastSpeaker = null;
      } else {
        out.push({ type: block.kind === "shot" ? "shot" : "action", text: content, revised: isRevised });
        interrupted = lastSpeaker !== null;
      }
    }
  }
  return out;
}

/** Page de titre du scénario. */
function titlePage(input: SeriesExportInput): RenderOptions["titlePage"] {
  const lines = [input.labels.subtitle];
  if (input.film?.writer.trim()) lines.push(`${input.labels.writer} ${input.film.writer.trim()}`);
  return { title: input.project.name, lines, footer: input.film?.logline.trim() || undefined };
}

/** Fichier du scénario au format demandé. */
export async function renderScreenplay(input: SeriesExportInput, format: ExportFormat, options: ScreenplayExportOptions): Promise<Uint8Array> {
  const elements = screenplayElements(input, options);
  const render: RenderOptions = { titlePage: titlePage(input), header: options.header };
  if (format === "docx") return elementsToDocx(elements, options.layout, render);
  const pages = paginate(elements, options.layout);
  if (format === "pdf") return pagesToPdf(pages, input.project.name, render);
  return new TextEncoder().encode(pagesToText(pages, render));
}
