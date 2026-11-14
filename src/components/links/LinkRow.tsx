import type { CSSProperties, ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * Présentation commune des liens d'une fiche (« Liens avec l'univers »,
 * « Récit », « Trame ») : une liste encadrée, une ligne par lien.
 *
 *   [vignette]  nature du lien  Nom de l'autre élément  · précision   [badge] [✎]
 *               ligne secondaire (période, description…)
 */

export function LinkList({ children, ordered }: { children: ReactNode; ordered?: boolean }) {
  // `overflow-hidden` : le survol d'une ligne suit les coins arrondis.
  const className = "divide-y overflow-hidden rounded-lg border";
  return ordered ? <ol className={className}>{children}</ol> : <ul className={className}>{children}</ul>;
}

/** Groupe de lignes sous un petit titre (« Personnages (3) »). */
export function LinkGroup({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
        {count !== undefined && <span className="tabular-nums"> ({count})</span>}
      </h3>
      {children}
    </section>
  );
}

/** Vignette sans image : un carré teinté (couleur du niveau, de la piste…) avec une icône ou un numéro. */
export function LinkMark({ color, children }: { color?: string; children: ReactNode }) {
  const style: CSSProperties | undefined = color ? { color, backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)` } : undefined;
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary tabular-nums [&_svg]:size-4"
      style={style}
      aria-hidden="true"
    >
      {children}
    </span>
  );
}

interface LinkRowProps {
  /** Vignette de l'autre élément (avatar, image, `LinkMark`). */
  thumb?: ReactNode;
  /** Nature du lien (« possède », « habite », « Point de vue »…). */
  label?: ReactNode;
  /** Couleur de la nature du lien (sinon : couleur principale). */
  labelColor?: string;
  /** Nom de l'autre élément ; un clic l'ouvre. */
  name: ReactNode;
  onOpen?: () => void;
  /** Précision, après le nom (« · Maison familiale »). */
  detail?: ReactNode;
  /** Ligne sous le nom (période, description…). */
  secondary?: ReactNode;
  /** Étiquette à droite (sorte d'élément, rôle, statut). */
  badge?: ReactNode;
  /** Texte montré au survol de la ligne (description gardée hors de la vue). */
  hint?: string;
  /** Pastille d'état à droite (statut d'un événement…), son nom au survol. */
  status?: { color: string; label: string };
  /** Bouton crayon : modifier le lien. */
  onEdit?: () => void;
  editLabel?: string;
  /** Icône du bouton d'action, à la place du crayon (« + » : lier). */
  editIcon?: ReactNode;
}

/**
 * Ligne d'un lien. Avec `onOpen`, toute la ligne est cliquable : le bouton
 * du nom s'étend sur la ligne entière (un seul arrêt au clavier) ; le crayon
 * reste au-dessus et garde son propre clic.
 */
export function LinkRow({ thumb, label, labelColor, name, onOpen, detail, secondary, badge, hint, status, onEdit, editLabel, editIcon }: LinkRowProps) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 px-3 py-2.5",
        onOpen && "relative transition-colors hover:bg-muted/50 focus-within:bg-muted/50",
      )}
      title={hint}
    >
      {thumb}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          {label && (
            <span className="font-medium text-primary" style={labelColor ? { color: labelColor } : undefined}>
              {label}
            </span>
          )}
          {onOpen ? (
            <button
              type="button"
              data-open=""
              onClick={onOpen}
              className="max-w-full truncate text-left font-medium underline-offset-4 outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:underline"
            >
              {name}
            </button>
          ) : (
            <span className="max-w-full truncate font-medium">{name}</span>
          )}
          {detail && <span className="text-muted-foreground">· {detail}</span>}
        </p>
        {secondary && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{secondary}</p>}
      </div>
      {badge && <span className="hidden max-w-40 shrink-0 truncate rounded-full border px-2 py-0.5 text-xs text-muted-foreground sm:inline">{badge}</span>}
      {status && (
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} title={status.label} role="img" aria-label={status.label} />
      )}
      {onEdit && (
        <Button type="button" size="icon-sm" variant="ghost" onClick={onEdit} aria-label={editLabel} title={editLabel} className="relative z-10">
          {editIcon ?? <Pencil />}
        </Button>
      )}
    </li>
  );
}
