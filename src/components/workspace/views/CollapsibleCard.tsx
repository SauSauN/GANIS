import { useCallback, useId, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, type LucideIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  cardClass,
  cardContentClass,
  cardHeaderClass,
} from "@/components/workspace/views/PageShell";
import { cn } from "@/lib/utils";

/**
 * État replié d'une carte, mémorisé sur l'appareil sous `storageKey`
 * (le même pour toutes les fiches : replier « Histoire » sur un lieu la
 * replie sur tous).
 */
export function useCollapsible(storageKey: string): [boolean, (open: boolean) => void] {
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== "1";
    } catch {
      return true;
    }
  });

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      try {
        localStorage.setItem(storageKey, next ? "0" : "1");
      } catch {
        // Stockage indisponible : le choix vaut pour cette session.
      }
    },
    [storageKey],
  );

  return [open, setOpen];
}

interface CollapsibleCardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** Couleurs de la pastille de l'icône (sinon : couleur principale). */
  tint?: CSSProperties;
  /** Boutons de l'en-tête (ne replient pas la carte). */
  actions?: ReactNode;
  /** Nombre affiché à côté du chevron (facultatif). */
  count?: number;
  /** Classes du contenu (par défaut : marges de carte). */
  contentClassName?: string;
  id?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Carte repliable, comme les niveaux de la fiche personnage et la carte
 * « Relations » : l'en-tête entier replie ou déplie la carte, avec une
 * animation de hauteur ; les boutons d'action restent cliquables.
 */
export function CollapsibleCard({
  open,
  onOpenChange,
  icon: Icon,
  title,
  description,
  tint,
  actions,
  count,
  contentClassName,
  id,
  className,
  children,
}: CollapsibleCardProps) {
  const { t } = useTranslation("characters");
  const contentId = useId();
  const toggleTitle = open ? t("levels.collapse") : t("levels.expand");

  return (
    <Card id={id} className={cn(cardClass, "scroll-mt-4", className)}>
      <CardHeader
        className={cn(
          cardHeaderClass,
          "flex flex-row items-center gap-2 rounded-t-xl p-0 transition-colors hover:bg-muted/40",
          !open && "border-b-0",
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          title={toggleTitle}
          onClick={() => onOpenChange(!open)}
          className="flex min-w-0 flex-1 items-center gap-4 rounded-tl-xl py-5 pl-6 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg",
              !tint && "bg-primary/10 text-primary",
            )}
            style={tint}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>

          <span className="min-w-0 flex-1">
            <CardTitle className="truncate">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </span>
        </button>

        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}

        {/* Compteur + chevron : même place que sur les cartes de la fiche personnage. */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          title={toggleTitle}
          onClick={() => onOpenChange(!open)}
          className="flex shrink-0 items-center gap-4 self-stretch rounded-tr-xl py-5 pr-6 pl-2"
        >
          {count !== undefined && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground tabular-nums">
              {count}
            </span>
          )}
          <ChevronDown
            className={cn(
              "size-5 text-muted-foreground transition-transform duration-300",
              !open && "-rotate-90",
            )}
          />
        </button>
      </CardHeader>

      {/* Repli animé : la hauteur passe de 0 à « auto » (grille 0fr → 1fr). */}
      <div
        id={contentId}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <CardContent className={contentClassName ?? cardContentClass}>{children}</CardContent>
        </div>
      </div>
    </Card>
  );
}
