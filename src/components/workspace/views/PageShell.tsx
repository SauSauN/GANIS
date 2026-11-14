import type { ReactNode } from "react";
import { InfoTip } from "@/components/common/InfoTip";

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

/**
 * Carte de gauche des fiches (personnage, lieu, objet, faune et flore,
 * faction, peuple, magie). Elle reste à sa place pendant que les
 * formulaires de droite défilent : accrochée à la hauteur où elle commence
 * (`top-8` : la marge haute de la page), elle ne bouge pas, et elle ne
 * défile jamais. Toutes ont la même hauteur, celle de la carte d'un
 * personnage, ou moins si la fenêtre est basse : l'image rétrécit alors
 * (`profileImageClass`) pour que le reste tienne toujours.
 */
export const profileCardClass = "@xl:sticky @xl:top-8 @xl:h-[min(34rem,calc(100dvh-11rem))] @xl:overflow-hidden";

/**
 * Image de la carte de gauche : aussi large que la carte, mais jamais plus
 * haute que la place laissée par le reste du contenu (environ 20,5 rem :
 * nom, badges, emplacement, « Fiche remplie »).
 */
export const profileImageClass = "mx-auto w-full @xl:w-[min(100%,calc(min(34rem,100dvh-11rem)-20.5rem))]";

/**
 * Grande image des fiches sans « Fiche remplie » (lieux, objets, faune et
 * flore, factions, peuples, magie) : toute la largeur de la carte, et
 * les trois quarts de la hauteur laissée par le nom, les badges et
 * l'emplacement (10 rem).
 */
export const profileTallImageClass = "aspect-square @xl:aspect-auto @xl:h-[calc((min(34rem,100dvh-11rem)-10rem)*0.75)]";

/** Champ de saisie natif (liste déroulante, zone de texte). */
export const fieldClass =
  "w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

interface PageShellProps {
  /** Facultatif : sans titre ni actions, la page commence directement par son contenu. */
  title?: string;
  description?: ReactNode;
  /**
   * Explication de la page, cachée derrière un petit « i » (survol ou clic)
   * au lieu d'un long texte en haut de la page.
   */
  info?: ReactNode;
  /** Éléments à droite du titre (bouton…). */
  actions?: ReactNode;
  children: ReactNode;
}

export function PageShell({ title, description, info, actions, children }: PageShellProps) {
  return (
    <main className="relative flex min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
      {/* `@container` : les fiches s'organisent selon la place de la page
          (panneau du milieu ouvert ou non, demi-écran…), pas selon la fenêtre. */}
      <div className="@container mx-auto w-full max-w-5xl 2xl:max-w-7xl min-[137.5rem]:max-w-[100rem] px-6 py-8 pb-24 lg:px-10">
        {/* Pas de grand titre visible : le nom de la page est déjà dans son
            onglet. Il reste lisible par les lecteurs d'écran. */}
        {title && <h1 className="sr-only">{title}</h1>}

        {(description || info || actions) && (
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              {info && <InfoTip className="size-7">{info}</InfoTip>}
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