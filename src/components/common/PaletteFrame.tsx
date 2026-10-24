import type { ReactNode } from "react";
import { paletteRing } from "@/components/characters/PortraitPicker";

/**
 * Cadre aux couleurs de la palette d'une fiche (lieu, objet, faune et
 * flore), comme l'anneau autour de la photo d'un personnage : un liseré
 * dégradé, puis un fin espace de la couleur de la carte. Sans couleur, le
 * contenu est montré tel quel.
 */
export function PaletteFrame({ colors, children }: { colors: string[]; children: ReactNode }) {
  const ring = paletteRing(colors);

  if (!ring) return <>{children}</>;

  return (
    <div className="w-full rounded-xl p-1" style={{ background: ring }}>
      <div className="rounded-lg bg-card p-1">{children}</div>
    </div>
  );
}
