import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import { ColorMenu } from "@/components/common/ColorMenu";
import { COLOR_CHOICES } from "@/lib/structure";

interface ColorSwatchesProps {
  /** Couleur choisie (« #rrggbb »), ou `null` : couleur par défaut. */
  value: string | null;
  onChange: (color: string | null) => void;
  /** Couleur appliquée quand `value` est `null` (niveau, place…). */
  fallback: string;
  /** Libellé du bouton « par défaut » (absent : pas de retour possible). */
  resetLabel?: string;
  disabled?: boolean;
  /** Nom du choix (« Couleur : Chapitre »), pour le bouton et les lecteurs d'écran. */
  label: string;
}

/**
 * Couleur d'un niveau du découpage ou d'une trame : un seul bouton montre la
 * couleur actuelle ; un clic ouvre les couleurs proposées, « Autre
 * couleur… » et, si `resetLabel` est fourni, le retour à la couleur par
 * défaut (voir `ColorMenu`).
 */
export function ColorSwatches({ value, onChange, fallback, resetLabel, disabled, label }: ColorSwatchesProps) {
  const { t } = useTranslation("structure");
  const current = (value ?? fallback).toLowerCase();

  return (
    <ColorMenu
      label={label}
      options={COLOR_CHOICES.map((color) => ({ value: color, swatch: color, label: color }))}
      value={current}
      current={current}
      onSelect={(color) => onChange(color)}
      custom={{ label: t("colors.custom") }}
      none={
        resetLabel && value !== null
          ? {
              label: resetLabel,
              icon: (
                <span className="relative flex size-4 items-center justify-center" aria-hidden="true">
                  <span className="size-4 rounded-full border" style={{ backgroundColor: fallback }} />
                  <RotateCcw className="absolute size-2.5 text-white drop-shadow" />
                </span>
              ),
            }
          : undefined
      }
      disabled={disabled}
    />
  );
}
