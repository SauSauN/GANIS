import { Fragment, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import type { Selection } from "@/lib/useSelection";
import { cn } from "@/lib/utils";

interface SelectionBarProps {
  selection: Selection;
  /** Actions groupées, montrées quand au moins un élément est choisi. */
  children: ReactNode;
  /** Actions montrées quand rien n'est choisi (facultatif). */
  idle?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * Barre de sélection multiple : case « Tout sélectionner », nombre
 * d'éléments choisis et actions groupées (restaurer, supprimer, déplacer…).
 */
export function SelectionBar({ selection, children, idle, disabled, className }: SelectionBarProps) {
  const { t } = useTranslation("common");

  return (
    <div
      className={cn("flex min-h-11 flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-1.5", className)}
      role="group"
      aria-label={t("selection.label")}
    >
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={selection.allSelected}
          ref={(input) => {
            if (input) input.indeterminate = selection.partial;
          }}
          onChange={selection.toggleAll}
          disabled={disabled}
        />
        <span aria-live="polite">
          {selection.count > 0 ? t("selection.count", { count: selection.count }) : t("selection.all")}
        </span>
      </label>

      {selection.count > 0 && (
        <button
          type="button"
          onClick={selection.clear}
          disabled={disabled}
          className="flex h-7 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
          {t("selection.clear")}
        </button>
      )}

      {/* Clés distinctes : les boutons ne sont pas réutilisés d'un état à
          l'autre (sinon leurs couleurs s'animent de l'un vers l'autre). */}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {selection.count > 0 ? <Fragment key="actions">{children}</Fragment> : <Fragment key="idle">{idle}</Fragment>}
      </div>
    </div>
  );
}

/** Case à cocher d'une ligne, avec un nom accessible explicite. */
export function SelectionCheckbox({
  selection,
  id,
  label,
  disabled,
}: {
  selection: Selection;
  id: string;
  /** « Sélectionner « Chapitre 3 » ». */
  label: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      className="size-4 shrink-0 accent-primary"
      checked={selection.isSelected(id)}
      onChange={() => selection.toggle(id)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      disabled={disabled}
      aria-label={label}
    />
  );
}
