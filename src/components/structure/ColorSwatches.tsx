import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Check, Pipette, RotateCcw } from "lucide-react";
import { COLOR_CHOICES } from "@/lib/structure";
import { cn } from "@/lib/utils";

interface ColorSwatchesProps {
  /** Couleur choisie (« #rrggbb »), ou `null` : couleur par défaut. */
  value: string | null;
  onChange: (color: string | null) => void;
  /** Couleur appliquée quand `value` est `null` (niveau, place…). */
  fallback: string;
  /** Libellé du bouton « par défaut » (absent : pas de retour possible). */
  resetLabel?: string;
  disabled?: boolean;
  /** Nom du groupe, pour les lecteurs d'écran. */
  label: string;
}

/**
 * Choix d'une couleur : pastilles proposées, couleur libre (sélecteur du
 * système) et, si `resetLabel` est fourni, retour à la couleur par défaut.
 */
export function ColorSwatches({ value, onChange, fallback, resetLabel, disabled, label }: ColorSwatchesProps) {
  const { t } = useTranslation("structure");
  const current = (value ?? fallback).toLowerCase();
  const custom = !COLOR_CHOICES.includes(current);
  const inputRef = useRef<HTMLInputElement>(null);

  // L'évènement natif « change » part quand le sélecteur se ferme : la
  // couleur est enregistrée à ce moment (pas à chaque mouvement).
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onNativeChange = () => changeRef.current(input.value.toLowerCase());
    input.addEventListener("change", onNativeChange);
    return () => input.removeEventListener("change", onNativeChange);
  }, []);

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      {COLOR_CHOICES.map((color) => {
        const selected = current === color;

        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={color}
            title={color}
            disabled={disabled}
            onClick={() => onChange(color)}
            className={cn(
              "flex size-7 items-center justify-center rounded-full border shadow-sm transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50",
              selected && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-background",
            )}
            style={{ backgroundColor: color }}
          >
            {selected && <Check className="size-3.5 text-white drop-shadow" aria-hidden="true" />}
          </button>
        );
      })}

      {/* Couleur libre */}
      <label
        title={t("colors.custom")}
        className={cn(
          "relative flex size-7 cursor-pointer items-center justify-center rounded-full border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary",
          "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
          custom && "border-solid ring-2 ring-foreground/70 ring-offset-2 ring-offset-background",
          disabled && "pointer-events-none opacity-50",
        )}
        style={custom ? { backgroundColor: current } : undefined}
      >
        {!custom && <Pipette className="size-3.5" aria-hidden="true" />}
        <input
          ref={inputRef}
          type="color"
          value={current}
          disabled={disabled}
          aria-label={t("colors.custom")}
          onChange={() => {}}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>

      {resetLabel && value !== null && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(null)}
          className="ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RotateCcw className="size-3" aria-hidden="true" />
          {resetLabel}
        </button>
      )}
    </div>
  );
}
