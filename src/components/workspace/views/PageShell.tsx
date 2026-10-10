import type { ReactNode } from "react";

/*
 * Mise en page commune des pages de l'espace de travail (accueil du projet,
 * synopsis, paramètres du projet…) : même largeur, mêmes marges, même
 * en-tête, mêmes cartes.
 */

/**
 * Carte à couleur de fond unique (`bg-card`), en-tête et pied compris :
 * gap-0 / py-0 évitent la bande vide au-dessus de l'en-tête, ring-0 +
 * border donnent le même contour que les autres blocs.
 */
export const cardClass = "gap-0 border py-0 shadow-sm ring-0";
export const cardHeaderClass = "border-b px-6 py-5";
export const cardContentClass = "px-6 py-6";
export const cardFooterClass = "border-t bg-transparent px-6 py-4";

/** Champ de saisie natif (liste déroulante, zone de texte). */
export const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

interface PageShellProps {
  /** Facultatif : sans titre ni actions, la page commence directement par son contenu. */
  title?: string;
  description?: ReactNode;
  /** Éléments à droite du titre (bouton…). */
  actions?: ReactNode;
  children: ReactNode;
}

export function PageShell({ title, description, actions, children }: PageShellProps) {
  return (
    <main className="relative flex min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div className="mx-auto w-full max-w-5xl px-6 py-8 pb-24 lg:px-10">
        {/* Pas de grand titre visible : le nom de la page est déjà dans son
            onglet. Il reste lisible par les lecteurs d'écran. */}
        {title && <h1 className="sr-only">{title}</h1>}

        {(description || actions) && (
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              {description && (
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
              )}
            </div>

            {actions}
          </header>
        )}

        {children}
      </div>
    </main>
  );
}