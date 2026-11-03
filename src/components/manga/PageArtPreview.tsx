import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ReadingView } from "@/components/documents/ReadingView";
import { Thumbnail, useThumbnails } from "@/components/manga/Thumbnail";
import { documentKind, extensionOf } from "@/lib/documents";
import type { StructureDocument } from "@/types";

/**
 * Dessin d'une page, à côté de son scénario. Une image s'ouvre en grand ; un
 * fichier source (PSD, CLIP…) n'a pas d'aperçu : son type et son nom suffisent.
 */
export function PageArtPreview({ projectId, document, title }: { projectId: string; document: StructureDocument; title: string }) {
  const { t } = useTranslation("manga");
  const load = useThumbnails(projectId);
  const [reading, setReading] = useState(false);

  if (documentKind(document) !== "image") {
    return (
      <div className="flex aspect-[5/7] w-full max-w-60 flex-col items-center justify-center gap-1 rounded-sm border-2 border-success bg-card px-3 text-center" title={document.name}>
        <span className="text-lg font-semibold text-muted-foreground">{extensionOf(document.name)}</span>
        <span className="line-clamp-2 text-xs break-all text-muted-foreground">{document.name}</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setReading(true)}
        title={t("page.artOpen")}
        aria-label={`${t("page.artOpen")} : ${document.name}`}
        className="relative block aspect-[5/7] w-full max-w-60 overflow-hidden rounded-sm border-2 border-success outline-none transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Thumbnail document={document} load={load} alt="" />
      </button>
      {reading && <ReadingView projectId={projectId} title={title} pages={[document]} onClose={() => setReading(false)} />}
    </>
  );
}
