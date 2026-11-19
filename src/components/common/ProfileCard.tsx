import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { frameStyle, type ImageFrame } from "@/lib/imageFrame";
import { cn } from "@/lib/utils";

/**
 * Carte « profil » des listes (lieux, objets, faune et flore, factions,
 * peuples, magie), sur le modèle de la carte d'un personnage :
 *
 * - un bandeau : les couleurs de la palette de la fiche si elle en a, sinon
 *   l'image floutée, sinon une teinte douce de la catégorie ;
 * - devant, à cheval sur le bandeau, la vignette : l'image de la fiche, ou
 *   l'icône de son type sur la teinte de sa catégorie ;
 * - dessous, le contenu (nom, type, description…).
 */
export function ProfileCard({
  url,
  frame,
  palette,
  backdrop,
  icon: Icon,
  onOpen,
  children,
}: {
  url: string | null;
  /** Cadrage de l'image (vignette). */
  frame?: ImageFrame | null;
  /** Couleurs choisies dans la fiche (vide : pas de palette). */
  palette: string[];
  /** Teinte de la catégorie (fond de la vignette sans image). */
  backdrop: CSSProperties;
  icon: LucideIcon;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "group flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-all",
          "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        )}
      >
        <span className="relative block h-24 overflow-hidden bg-muted" aria-hidden="true">
          {palette.length > 0 ? (
            <span
              className="block size-full"
              style={{ background: palette.length === 1 ? palette[0] : `linear-gradient(120deg, ${palette.join(", ")})` }}
            />
          ) : url ? (
            <img src={url} alt="" className="size-full scale-125 object-cover opacity-60 blur-xl" />
          ) : (
            <span className="block size-full opacity-25" style={backdrop} />
          )}
        </span>

        <span className="-mt-10 flex flex-1 flex-col gap-3 px-5 pb-5">
          <span
            className={cn(
              "relative z-10 flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-white",
              // Sa propre palette : sa première couleur remplace le cadre blanc.
              palette.length > 0 ? "border-4 shadow-sm" : "profile-frame profile-frame-card",
            )}
            style={{ ...(url ? undefined : backdrop), ...(palette.length > 0 ? { borderColor: palette[0] } : undefined) }}
            aria-hidden="true"
          >
            {url ? (
              <img
                src={url}
                alt=""
                // Image cadrée : pas d'agrandissement au survol (il changerait la zone choisie).
                className={cn("size-full object-cover", !frameStyle(frame) && "transition-transform group-hover:scale-[1.04]")}
                style={frameStyle(frame)}
              />
            ) : (
              <Icon className="size-8 opacity-90" />
            )}
          </span>

          {children}
        </span>
      </button>
    </li>
  );
}
