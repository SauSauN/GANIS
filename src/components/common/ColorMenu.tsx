import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Pipette } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ColorOption {
  /** Valeur enregistrée (« #rrggbb », « yellow »…). */
  value: string;
  /** Couleur affichée. */
  swatch: string;
  /** Nom lu au survol et par les lecteurs d'écran. */
  label: string;
}

interface ColorMenuProps {
  /** Identifiant du bouton (pour un `<Label htmlFor>`). */
  id?: string;
  /** Nom du choix (« Couleur : Chapitre »). */
  label: string;
  options: ColorOption[];
  /** Valeur choisie ; `null` : aucune (ou la couleur par défaut). */
  value: string | null;
  onSelect: (value: string | null) => void;
  /** Couleur montrée par le bouton (par défaut : celle de `value`). */
  current?: string | null;
  /** Entrée « aucune couleur » / « par défaut », en bas du menu. */
  none?: { label: string; swatch?: string; icon?: ReactNode };
  /** Entrée « Autre couleur… » : sélecteur du système (valeur « #rrggbb »). */
  custom?: { label: string };
  /** Bouton à la place de la pastille (ex. « + Ajouter »). */
  trigger?: ReactNode;
  /** Taille de la pastille du bouton. */
  size?: "xs" | "sm" | "md";
  triggerClassName?: string;
  disabled?: boolean;
}

const SWATCH_SIZE = { xs: "size-3.5", sm: "size-4", md: "size-6" } as const;

/**
 * Choix d'une couleur, compact : au repos, un seul bouton montre la couleur
 * actuelle ; un clic ouvre les couleurs proposées (et, selon les cas,
 * « Autre couleur… » et « aucune / par défaut »). Clavier : flèches entre
 * les pastilles, Échap pour fermer.
 *
 * Le menu est rendu hors de l'élément (portail) ; les appuis de pointeur
 * ne remontent pas à l'élément (une note qu'on déplace, par exemple).
 */
export function ColorMenu({
  id,
  label,
  options,
  value,
  onSelect,
  current,
  none,
  custom,
  trigger,
  size = "md",
  triggerClassName,
  disabled,
}: ColorMenuProps) {
  const shown = current !== undefined ? current : (options.find((option) => option.value === value)?.swatch ?? value);
  const isCustom = value !== null && !options.some((option) => option.value === value);
  /** Couleur de départ du sélecteur du système (« #rrggbb »). */
  const startColor = /^#[0-9a-f]{6}$/i.test(shown ?? "") ? (shown as string).toLowerCase() : "#6366f1";

  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // « change » part quand le sélecteur du système se ferme : la couleur est
  // enregistrée à ce moment. Le champ reste hors du menu pour exister encore.
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onNativeChange = () => selectRef.current(input.value.toLowerCase());
    input.addEventListener("change", onNativeChange);
    return () => input.removeEventListener("change", onNativeChange);
  }, [custom !== undefined]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !panelRef.current) return;
    const button = buttonRef.current.getBoundingClientRect();
    const panel = panelRef.current.getBoundingClientRect();
    const below = button.bottom + 4 + panel.height <= window.innerHeight - 8;
    const top = below ? button.bottom + 4 : Math.max(8, button.top - 4 - panel.height);
    const left = Math.min(Math.max(8, button.left), window.innerWidth - panel.width - 8);
    setPosition({ top, left });
    (
      panelRef.current.querySelector<HTMLButtonElement>('[aria-checked="true"]') ??
      panelRef.current.querySelector<HTMLButtonElement>("button")
    )?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node) && !buttonRef.current?.contains(event.target as Node)) {
        dismiss(false);
      }
    };
    const onResize = () => dismiss(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  function dismiss(focusButton: boolean) {
    setOpen(false);
    setPosition(null);
    if (focusButton) buttonRef.current?.focus();
  }

  function choose(next: string | null) {
    dismiss(true);
    onSelect(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      dismiss(true);
      return;
    }
    const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % buttons.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + buttons.length) % buttons.length;
    if (next !== null && buttons[next]) {
      event.preventDefault();
      buttons[next].focus();
    }
  }

  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  const rowClass =
    "flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none";

  return (
    <span className="relative inline-flex" onPointerDown={stop}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={trigger ? label : `${label}${shown ? ` : ${options.find((o) => o.value === value)?.label ?? shown}` : ""}`}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault() /* garde la sélection de l'éditeur */}
        onClick={() => (open ? dismiss(false) : setOpen(true))}
        className={cn(
          trigger
            ? "inline-flex items-center"
            : cn(
                "inline-flex items-center gap-1 rounded-md transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                size === "md" ? "h-9 border bg-background pr-2 pl-1.5 text-muted-foreground shadow-xs" : "h-6 px-1",
              ),
          "disabled:pointer-events-none disabled:opacity-50",
          open && !trigger && "bg-muted",
          triggerClassName,
        )}
      >
        {trigger ?? (
          <>
            <span
              className={cn(SWATCH_SIZE[size], "rounded-full border border-black/15 shadow-sm", !shown && "bg-card")}
              style={shown ? { backgroundColor: shown } : undefined}
              aria-hidden="true"
            />
            {size === "md" && <ChevronDown className="size-3.5" aria-hidden="true" />}
          </>
        )}
      </button>

      {/* Champ libre (non contrôlé) : React ne doit pas remettre l'ancienne
          valeur pendant qu'on règle la couleur dans le sélecteur du système,
          sinon « change » lirait l'ancienne couleur à la fermeture. Sa
          valeur de départ est posée juste avant l'ouverture. */}
      {custom && (
        <input
          ref={inputRef}
          type="color"
          defaultValue={startColor}
          disabled={disabled}
          aria-label={custom.label}
          tabIndex={-1}
          className="pointer-events-none absolute inset-0 size-full opacity-0"
        />
      )}

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={label}
            onKeyDown={onKeyDown}
            onPointerDown={stop}
            onMouseDown={(event) => {
              stop(event);
              event.preventDefault();
            }}
            style={{ top: position?.top ?? -9999, left: position?.left ?? -9999 }}
            className="fixed z-[60] w-60 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg"
          >
            <div role="radiogroup" aria-label={label} className="grid grid-cols-6 gap-1.5 p-1">
              {options.map((option) => {
                const selected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={option.label}
                    title={option.label}
                    onClick={() => choose(option.value)}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full border border-black/10 shadow-sm transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                      selected && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-popover",
                    )}
                    style={{ backgroundColor: option.swatch }}
                  >
                    {selected && <Check className="size-3.5 text-white drop-shadow" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            {(custom || none) && <div className="my-1.5 h-px bg-border" role="separator" />}

            {custom && (
              <button
                type="button"
                onClick={() => {
                  dismiss(false);
                  const input = inputRef.current;
                  if (!input) return;
                  input.value = startColor;
                  // `showPicker` : ouverture fiable du sélecteur (Chromium,
                  // WebView2) ; `click` en secours.
                  try {
                    if (typeof input.showPicker === "function") input.showPicker();
                    else input.click();
                  } catch {
                    input.click();
                  }
                }}
                className={rowClass}
              >
                {isCustom && shown ? (
                  <span className="size-4 rounded-full border" style={{ backgroundColor: shown }} aria-hidden="true" />
                ) : (
                  <Pipette className="size-4 text-muted-foreground" aria-hidden="true" />
                )}
                {custom.label}
              </button>
            )}

            {none && (
              <button type="button" onClick={() => choose(null)} className={rowClass}>
                {none.icon ?? (
                  <span
                    className="size-4 rounded-full border bg-card"
                    style={none.swatch ? { backgroundColor: none.swatch } : undefined}
                    aria-hidden="true"
                  />
                )}
                {none.label}
              </button>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
