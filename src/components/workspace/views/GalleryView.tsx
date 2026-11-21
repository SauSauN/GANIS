import { useTranslation } from "react-i18next";
import { ProjectGalleryBoard } from "@/components/gallery/ProjectGalleryBoard";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { PageShell } from "@/components/workspace/views/PageShell";
import type { Project } from "@/types";

/**
 * Onglet « Galerie » du module Détails : les images de l'univers et de
 * l'histoire (affiches, cartes du monde, ambiances, croquis…), rangées en
 * dossiers. Le logo du projet (affiché sur l'accueil, à côté du nom) est
 * dans le dossier système « Logo ».
 */
export function GalleryView({ project, feature }: { project: Project; feature: WorkspaceFeature }) {
  const { t } = useTranslation("workspaceHome");

  return (
    <PageShell title={feature.label} info={feature.description}>
      <section className="rounded-xl border bg-card p-6 shadow-sm" aria-labelledby="gallery-images-title">
        <h2 id="gallery-images-title" className="mb-4 text-sm font-semibold">
          {t("gallery.label")}
        </h2>
        <ProjectGalleryBoard projectId={project.id} />
      </section>
    </PageShell>
  );
}
