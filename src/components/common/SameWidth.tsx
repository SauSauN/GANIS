import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Plusieurs libellés dans la même case, un seul visible : le bouton garde la
 * largeur du plus long (« Suivant » / « C'est parti ! ») et ses voisins ne
 * bougent pas.
 */
export function SameWidth({ labels, active }: { labels: ReactNode[]; active: number }) {
  return (
    <span className="grid">
      {labels.map((label, index) => (
        <span
          key={index}
          aria-hidden={index !== active}
          className={cn("col-start-1 row-start-1 flex items-center justify-center", index !== active && "invisible")}
        >
          {label}
        </span>
      ))}
    </span>
  );
}
