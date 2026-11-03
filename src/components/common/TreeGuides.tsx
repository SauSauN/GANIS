import { cn } from "@/lib/utils";

interface TreeGuidesProps {
  /** Nombre de lignes : une par niveau au-dessus de la rangée. */
  depth: number;
  /** Écart entre deux niveaux (rem). */
  step?: number;
  /** Position de la première ligne (rem) : le milieu du chevron du parent. */
  offset?: number;
  /** Niveau de la ligne à marquer (dossier de l'élément actif). */
  active?: number | null;
}

/**
 * Lignes verticales d'une arborescence : elles relient une rangée aux dossiers
 * qui la contiennent. La rangée doit être en `position: relative`.
 */
export function TreeGuides({ depth, step = 0.875, offset = 0.75, active = null }: TreeGuidesProps) {
  return (
    <>
      {Array.from({ length: depth }, (_, level) => (
        <span
          key={level}
          aria-hidden="true"
          className={cn("pointer-events-none absolute -top-px bottom-0 w-px", level === active ? "bg-primary/60" : "bg-border")}
          style={{ left: `${offset + level * step}rem` }}
        />
      ))}
    </>
  );
}
