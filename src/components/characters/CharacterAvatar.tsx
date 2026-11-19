import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { avatarColor, fullName, initials } from "@/lib/characters";
import { cn } from "@/lib/utils";
import { usePortraitUrl } from "@/stores/characterStore";
import { frameStyle, portraitFrameKey, type ImageFrame } from "@/lib/imageFrame";
import { useImageFrame } from "@/stores/imageFrameStore";
import type { Character } from "@/types";

export type AvatarSize = "xs" | "panel" | "sm" | "md" | "lg" | "xl" | "2xl" | "fill";

const SIZES: Record<AvatarSize, string> = {
  xs: "size-6 text-[0.6rem]",
  /** Panneau du milieu : taille réglée dans Paramètres › Apparence (`--panel-thumb`). */
  panel: "size-(--panel-thumb) text-[length:calc(var(--panel-thumb)*0.4)]",
  sm: "size-8 text-xs",
  md: "size-12 text-base",
  lg: "size-16 text-xl",
  xl: "size-24 text-3xl",
  "2xl": "size-36 text-5xl",
  /** Remplit son cadre (image de la carte de profil). */
  fill: "size-full text-6xl",
};

interface AvatarFaceProps {
  /** Identifiant (couleur des initiales) ; un brouillon peut en passer un provisoire. */
  colorKey: string;
  name: string;
  /** Photo (`data:` ou `blob:`) ; `null` : initiales. */
  url: string | null;
  size?: AvatarSize;
  /** Coins arrondis au lieu d'un cercle (cadre de la carte de profil). */
  square?: boolean;
  className?: string;
  /** Style ajouté (couleur du cadre…). */
  style?: CSSProperties;
  /** Cadrage de la photo (zone affichée). */
  frame?: ImageFrame | null;
}

/**
 * Avatar d'un personnage : sa photo, ou à défaut ses initiales sur une
 * couleur propre au personnage.
 */
export function AvatarFace({ colorKey, name, url, size = "md", square = false, className, style, frame }: AvatarFaceProps) {
  const { t } = useTranslation("characters");

  const shape = cn(
    "shrink-0 overflow-hidden ring-1 ring-border",
    square ? "rounded-lg" : "rounded-full",
    SIZES[size],
    className,
  );

  const framed = frameStyle(frame);
  if (url && framed) {
    // Photo cadrée : l'image agrandie est découpée par le cadre.
    return (
      <span className={cn(shape, "block bg-muted")} style={style}>
        <img src={url} alt={t("portrait.alt", { name })} draggable={false} className="size-full object-cover" style={framed} />
      </span>
    );
  }

  if (url) {
    return (
      <img
        src={url}
        alt={t("portrait.alt", { name })}
        draggable={false}
        className={cn(shape, "bg-muted object-cover")}
        style={style}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(shape, "inline-flex items-center justify-center font-semibold text-white select-none")}
      style={{ backgroundColor: avatarColor(colorKey), ...style }}
    >
      {initials(name)}
    </span>
  );
}

interface CharacterAvatarProps {
  projectId: string;
  character: Character;
  size?: AvatarSize;
  className?: string;
}

/** Avatar d'un personnage enregistré (sa photo est chargée à la demande). */
export function CharacterAvatar({ projectId, character, size, className }: CharacterAvatarProps) {
  const url = usePortraitUrl(projectId, character);
  const frame = useImageFrame(projectId, portraitFrameKey("character", character.id));

  return (
    <AvatarFace
      colorKey={character.id}
      name={fullName(character)}
      url={url}
      frame={frame}
      size={size}
      className={className}
    />
  );
}