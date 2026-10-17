import type { Project, ProjectVisibility } from "@/types";

/**
 * Espaces de projets.
 *
 * Le mode de l'utilisateur décide seul de ce qu'il voit, sans filtre :
 * - sans connexion (« Commencer ») → espace public : projets publics ;
 * - connecté → espace privé : projets privés du compte.
 *
 * Les deux ne sont jamais mélangés dans une même vue. Rust contrôle de son
 * côté ce qui est accessible ; ceci ne règle que l'affichage.
 */
export type ProjectSpace = ProjectVisibility;

/** Espace correspondant au mode actuel. */
export function spaceOf(signedIn: boolean): ProjectSpace {
  return signedIn ? "private" : "public";
}

/** Projets qui appartiennent à l'espace donné. */
export function projectsInSpace(
  projects: Project[],
  space: ProjectSpace,
): Project[] {
  return projects.filter((project) => project.visibility === space);
}
