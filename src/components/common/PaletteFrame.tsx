import type { ReactNode } from "react";
import { paletteRing } from "@/components/characters/PortraitPicker";

/**
 * Cadre aux couleurs de la palette d'une fiche (lieu, objet, faune et
 * flore), comme l'anneau autour de la photo d'un personnage : un liseré
 * dégradé, directement autour de l'image (il remplace le cadre blanc des
 * photos). Sans couleur, le contenu est montré tel quel.
 */
export function PaletteFrame({ colors, children }: { colors: string[]; children: ReactNode }) {
  const ring = paletteRing(colors);

  if (!ring) return <>{children}</>;

  return (
    <div className="w-full rounded-xl p-1" style={{ background: ring }}>
      {children}
    </div>
  );
}
