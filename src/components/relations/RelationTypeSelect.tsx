import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown } from "lucide-react";
import { useRelationColors } from "@/components/relations/useRelationColors";
import { RELATION_TYPES } from "@/lib/relations";
import { cn } from "@/lib/utils";
import type { RelationType } from "@/types";

interface RelationTypeSelectProps {
  id?: string;
  value: RelationType;
  onChange: (type: RelationType) => void;
  disabled?: boolean;
}

/**
 * Liste déroulante des types de relation, chacun avec sa couleur.
 *
 * Une liste native (`<select>`) ne sait pas afficher de pastille de
 * couleur : celle-ci suit le modèle « listbox » (bouton + liste), au
 * clavier comme à la souris. Les couleurs viennent du thème actif
 * (voir `useRelationColors`).
 */
export function RelationTypeSelect({ id, value, onChange, disabled = false }: RelationTypeSelectProps) {
  const { t } = useTranslation("relations");
  const colors = useRelationColors();
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (type: RelationType) => `${baseId}-${type}`;

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<RelationType>(value);

  function openList() {
    if (disabled) return;
    setActive(value);
    setOpen(true);
  }

  function close(focusButton = true) {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  }

  function choose(type: RelationType) {
    onChange(type);
    close();
  }

  // Liste ouverte : le focus y passe, l'option active reste visible.
  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[id="${CSS.escape(optionId(active))}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  // Un clic en dehors ferme la liste.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onButtonKeyDown(event: KeyboardEvent) {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openList();
    }
  }

  function onListKeyDown(event: KeyboardEvent) {
    const index = RELATION_TYPES.indexOf(active);
    const last = RELATION_TYPES.length - 1;
    const move = (next: number) => setActive(RELATION_TYPES[Math.max(0, Math.min(last, next))]);

    switch (event.key) {
      case "ArrowDown":
        move(index + 1);
        break;
      case "ArrowUp":
        move(index - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(last);
        break;
      case "Enter":
      case " ":
        choose(active);
        break;
      case "Escape":
        // Ferme la liste seulement, pas le panneau de la relation.
        event.stopPropagation();
        close();
        break;
      case "Tab":
        close(false);
        return;
      default: {
        // Première lettre : saute au type correspondant.
        if (event.key.length === 1) {
          const letter = event.key.toLocaleLowerCase();
          const match = RELATION_TYPES.find((type) =>
            t(`types.${type}`).toLocaleLowerCase().startsWith(letter),
          );
          if (match) setActive(match);
        }
        return;
      }
    }

    event.preventDefault();
  }

  const color = colors[value];

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onButtonKeyDown}
        className={cn(
          "flex h-9 w-full items-center gap-2.5 rounded-md border border-input bg-background px-3 text-left text-sm transition-colors",
          "hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "ring-2 ring-ring",
        )}
        style={{ borderLeftColor: color, borderLeftWidth: 3 }}
      >
        <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate font-medium">{t(`types.${value}`)}</span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={id}
          aria-activedescendant={optionId(active)}
          onKeyDown={onListKeyDown}
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none"
        >
          {RELATION_TYPES.map((type) => {
            const selected = type === value;

            return (
              <li
                key={type}
                id={optionId(type)}
                role="option"
                aria-selected={selected}
                onPointerMove={() => setActive(type)}
                onClick={() => choose(type)}
                className={cn(
                  "flex h-8 cursor-pointer items-center gap-2.5 rounded-sm px-2.5 text-sm",
                  type === active && "bg-muted",
                  selected && "font-medium",
                )}
              >
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: colors[type] }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{t(`types.${type}`)}</span>
                {selected && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
