/*
 * Sélecteur à plusieurs choix (« Graphe / Matrice / Liste », « Par plan /
 * Par trame », « Scénario / Fabrication »…) : un seul style pour toute
 * l'application, pour que tous aient exactement la même taille.
 *
 * - le cadre : 32 px de haut, bordure, fond de la page ;
 * - chaque choix : toute la hauteur du cadre, texte 14 px, icône 16 px ;
 * - le choix actif : en bleu (couleur principale).
 */

/** Cadre du sélecteur. */
export const SEGMENTED_GROUP = "inline-flex h-8 shrink-0 items-center rounded-lg border bg-background p-0.5";

/** Un choix (bouton) du sélecteur. */
export const SEGMENTED_ITEM =
  "flex h-full items-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&_svg]:size-4 [&_svg]:shrink-0";

/** Le choix actif. */
export const SEGMENTED_ON = "bg-primary text-primary-foreground hover:text-primary-foreground";
