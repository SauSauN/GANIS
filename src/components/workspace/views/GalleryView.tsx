import { useTranslation } from "react-i18next";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { ProjectGallery, ProjectLogoEditor } from "@/components/workspace/ProjectVisuals";
import { PageShell } from "@/components/workspace/views/PageShell";
import type { Project } from "@/types";

/**
 * Onglet « Galerie » du module Détails :
 * - le logo du projet (affiché sur l'accueil, à côté du nom) ;
 * - les images de l'univers et de l'histoire (affiches, cartes du monde,
 *   ambiances, croquis…).
 */
export function GalleryView({ project, feature }: { project: Project; feature: WorkspaceFeature }) {
  const { t } = useTranslation("workspaceHome");

  return (
    <PageShell title={feature.label} info={feature.description}>
      <div className="space-y-6">
        <section className="rounded-xl border bg-card p-6 shadow-sm" aria-labelledby="gallery-logo-title">
          <h2 id="gallery-logo-title" className="text-sm font-semibold">
            {t("logo.title")}
          </h2>
          <p className="mt-1 mb-4 text-xs text-muted-foreground">{t("logo.hint")}</p>
          <ProjectLogoEditor project={project} />
        </section>

        <section className="rounded-xl border bg-card p-6 shadow-sm">
          <ProjectGallery projectId={project.id} label={t("gallery.label")} />
        </section>
      </div>
    </PageShell>
  );
}
