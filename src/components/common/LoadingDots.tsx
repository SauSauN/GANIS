import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Indicateur de chargement : trois points qui rebondissent l'un après
 * l'autre. C'est un SVG de 24 × 24, comme les icônes Lucide : il prend la
 * même taille (`size-4`, `h-4 w-4`, taille par défaut dans les boutons) et
 * la couleur du texte (`text-muted-foreground`…).
 *
 * `animate-spin` (hérité de l'ancienne icône qui tournait) est ignoré.
 * Si le système demande moins d'animations, les points restent immobiles.
 */
export function LoadingDots({ className, ...props }: SVGProps<SVGSVGElement>) {
  const classes = className
    ?.split(/\s+/)
    .filter((name) => name && name !== "animate-spin")
    .join(" ");

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("loading-dots shrink-0", classes)}
      data-testid="loading-dots"
      {...props}
    >
      <circle cx="4" cy="12" r="2.6" />
      <circle cx="12" cy="12" r="2.6" />
      <circle cx="20" cy="12" r="2.6" />
    </svg>
  );
}
