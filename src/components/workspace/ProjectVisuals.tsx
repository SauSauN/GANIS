import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorText } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useProjectLogo, useProjectLogoStore } from "@/stores/projectLogoStore";
import type { Project } from "@/types";

/** Charge le logo du projet (une fois) et le renvoie. */
function useLoadedLogo(projectId: string) {
  const url = useProjectLogo(projectId);
  const fetchLogo = useProjectLogoStore((state) => state.fetchLogo);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLogo(projectId).catch((e) => setError(errorText(e)));
  }, [projectId, fetchLogo]);

  return { url: url ?? null, error };
}

/** Classes du cadre du logo : même hauteur pour tous, largeur selon l'image. */
const logoFrame = "relative flex h-24 items-center justify-center overflow-hidden rounded-lg sm:h-28";

/**
 * Logo du projet sur l'accueil, à côté de son nom, en lecture seule (on
 * l'ajoute dans Détails › Galerie, dossier « Logo »). Le cadre suit la forme de l'image : un
 * logo long reste entier, jamais rogné. Rien n'est affiché sans logo.
 */
export function ProjectLogo({ project }: { project: Project }) {
  const { t } = useTranslation("workspaceHome");
  const { url } = useLoadedLogo(project.id);

  if (!url) return null;

  return (
    <div className={cn(logoFrame, "ml-auto max-w-[min(100%,24rem)] shrink-0 justify-end")} data-testid="project-logo">
      <img
        src={url}
        alt={t("logo.alt", { name: project.name })}
        className="h-full w-auto max-w-full object-contain"
        draggable={false}
      />
    </div>
  );
}
