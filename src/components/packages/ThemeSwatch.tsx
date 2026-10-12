import type { CSSProperties } from "react";
import { paletteToVars } from "@/lib/colorTheme";
import { cn } from "@/lib/utils";
import type { ThemePalette } from "@/types";

/**
 * Variables d'un thème à poser sur un conteneur (`style`).
 *
 * Les classes Tailwind (`bg-background`, `text-primary`…) lisent ces
 * variables : tout ce qui est à l'intérieur prend les couleurs du thème,
 * sans toucher au reste de l'interface.
 */
export function themeStyle(palette: ThemePalette, radius?: number): CSSProperties {
  return {
    ...paletteToVars(palette),
    ...(radius === undefined ? {} : { "--radius": `${radius}rem` }),
  } as CSSProperties;
}

/**
 * Miniature d'une palette : une fenêtre GANIS stylisée
 * (panneau latéral, titre, texte, carte et boutons).
 * Purement décorative : le nom du thème est donné à côté.
 */
export function ThemeSwatch({
  palette,
  className,
}: {
  palette: ThemePalette;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      style={themeStyle(palette)}
      className={cn(
        "flex h-20 overflow-hidden rounded-md border border-border bg-background",
        className,
      )}
    >
      <div className="flex w-1/4 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-1.5">
        <span className="h-1.5 w-full rounded-full bg-sidebar-accent" />
        <span className="h-1 w-3/4 rounded-full bg-muted-foreground/40" />
        <span className="h-1 w-2/3 rounded-full bg-muted-foreground/40" />
        <span className="h-1 w-3/4 rounded-full bg-muted-foreground/40" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2">
        <span className="h-1.5 w-2/3 rounded-full bg-foreground" />
        <span className="h-1 w-5/6 rounded-full bg-muted-foreground/60" />

        <div className="mt-auto flex items-center gap-1 rounded-sm border border-border bg-card p-1">
          <span className="h-2 w-6 rounded-sm bg-primary" />
          <span className="h-2 w-4 rounded-sm bg-secondary" />
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-success" />
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
        </div>
      </div>
    </div>
  );
}
