import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NumberStepperProps {
  /** Valeur enregistrée ; `null` : aucune (champ vide). */
  value: number | null;
  /** Appelé avec la nouvelle valeur : tout de suite avec − / +, à la fin de la saisie (Entrée, sortie du champ) sinon. */
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  /** Pas des boutons − et + (1 par défaut). */
  step?: number;
  /** Un champ vidé donne `null` (sinon la valeur précédente revient). */
  allowEmpty?: boolean;
  /** Affichage hors saisie (« 240 px », « +2 »…) ; la saisie se fait toujours en chiffres. */
  format?: (value: number) => string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  title?: string;
  /** Libellés des boutons (par défaut « Diminuer » / « Augmenter »). */
  decreaseLabel?: string;
  increaseLabel?: string;
  /** Hauteur : `sm` (28 px), `md` (36 px, comme les autres champs). */
  size?: "sm" | "md";
  /** Largeur de la valeur (classe Tailwind, `w-16` par défaut). */
  valueClassName?: string;
  className?: string;
}

/** Bouton − ou + du choix « − valeur + » (même apparence partout). */
export function stepperButtonClass(size: "sm" | "md" = "md") {
  return cn(
    "flex shrink-0 items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
    size === "sm" ? "w-7" : "w-9",
  );
}

/** Cadre du choix « − valeur + ». */
export function stepperFrameClass(size: "sm" | "md" = "md") {
  return cn("inline-flex shrink-0 items-stretch overflow-hidden rounded-lg border border-input bg-background", size === "sm" ? "h-7" : "h-9");
}

/**
 * « − … + » dont le milieu n'est pas une valeur à taper (zoom : un bouton
 * qui revient à 100 % ou ajuste à l'écran). Même apparence que
 * `NumberStepper`.
 */
export function StepperGroup({
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
  minusLabel,
  plusLabel,
  label,
  size = "md",
  className,
  children,
}: {
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
  minusLabel: string;
  plusLabel: string;
  /** Nom du groupe pour les lecteurs d'écran. */
  label?: string;
  size?: "sm" | "md";
  className?: string;
  /** Le milieu : valeur affichée, ou bouton. */
  children: ReactNode;
}) {
  // Dans une barre d'outils : à la hauteur des boutons (32 px, ou 28 px en `sm`).
  const frame = cn(stepperFrameClass(size), size === "md" && "h-8");
  const button = cn(stepperButtonClass(size), size === "md" && "w-8");
  return (
    <div role="group" aria-label={label} className={cn(frame, className)}>
      <button type="button" onClick={onMinus} disabled={minusDisabled} aria-label={minusLabel} title={minusLabel} className={button}>
        <Minus className="size-3.5" />
      </button>
      <div className="flex min-w-14 items-center justify-center border-x border-input font-mono text-xs tabular-nums">{children}</div>
      <button type="button" onClick={onPlus} disabled={plusDisabled} aria-label={plusLabel} title={plusLabel} className={button}>
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

/** Nombre entier lu d'une saisie (`null` : vide ou illisible). */
function parse(text: string): number | null {
  const cleaned = text.replace(/[\s  ]/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Choix d'une valeur numérique « − valeur + », le même partout dans
 * GANIS : les boutons changent la valeur d'un pas, la valeur se tape aussi
 * directement (validée par Entrée ou en quittant le champ).
 */
export function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  allowEmpty = false,
  format,
  placeholder = "—",
  disabled,
  id,
  title,
  decreaseLabel,
  increaseLabel,
  size = "md",
  valueClassName = "w-16",
  className,
  ...rest
}: NumberStepperProps) {
  const { t } = useTranslation("common");
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value === null ? "" : String(value));

  useEffect(() => {
    if (!editing) setText(value === null ? "" : String(value));
  }, [value, editing]);

  const clamp = (n: number) => Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, n));
  // Valeurs décimales (0,5 rem…) : arrondies au pas, sans erreur d'arrondi.
  const decimals = (String(step).split(".")[1] ?? "").length;
  const round = (n: number) => Number(n.toFixed(decimals));

  function commit() {
    setEditing(false);
    const n = parse(text);
    if (n === null) {
      if (allowEmpty) {
        if (value !== null) onChange(null);
      } else setText(value === null ? "" : String(value));
      return;
    }
    const next = round(clamp(n));
    setText(String(next));
    if (next !== value) onChange(next);
  }

  function nudge(direction: 1 | -1) {
    const base = value ?? (direction > 0 ? (min ?? 0) - step : (min ?? 0));
    const next = round(clamp(base + direction * step));
    // Pendant une saisie (flèches ↑ ↓) : le champ montre aussi la nouvelle valeur.
    setText(String(next));
    if (next !== value) onChange(next);
  }

  const atMin = min !== undefined && value !== null && value <= min;
  const atMax = max !== undefined && value !== null && value >= max;
  const button = stepperButtonClass(size);


  return (
    // Dans le code, le champ vient avant les boutons (affiché au milieu par `order`) : un
    // clic sur un libellé qui l'entoure y place le curseur au lieu d'appuyer sur « − ».
    <div
      className={cn(stepperFrameClass(size), disabled && "opacity-50", className)}
      title={title}
    >
      <input
        id={id}
        inputMode="decimal"
        value={editing ? text : value === null ? "" : format ? format(value) : String(value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={rest["aria-label"]}
        onFocus={() => {
          setEditing(true);
          setText(value === null ? "" : String(value));
        }}
        onChange={(e) => setText(e.target.value.replace(/[^\d\s.,-]/g, "").slice(0, 12))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "ArrowUp") {
            e.preventDefault();
            nudge(1);
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            nudge(-1);
          }
        }}
        className={cn(
          "order-2 min-w-0 border-x border-input bg-transparent text-center font-mono text-sm tabular-nums outline-none placeholder:text-muted-foreground focus:bg-secondary/40",
          valueClassName,
        )}
      />
      <button type="button" onClick={() => nudge(-1)} disabled={disabled || atMin} aria-label={decreaseLabel ?? t("stepper.decrease")} title={decreaseLabel ?? t("stepper.decrease")} className={cn(button, "order-1")}>
        <Minus className="size-3.5" />
      </button>
      <button type="button" onClick={() => nudge(1)} disabled={disabled || atMax} aria-label={increaseLabel ?? t("stepper.increase")} title={increaseLabel ?? t("stepper.increase")} className={cn(button, "order-3")}>
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
