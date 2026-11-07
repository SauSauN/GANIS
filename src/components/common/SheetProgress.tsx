/** Une ligne de « Fiche remplie » : une section et ce qui y est rempli. */
export interface SheetProgressRow {
  key: string;
  label: string;
  filled: number;
  total: number;
  /** Clic : aller à la section (facultatif). */
  onClick?: () => void;
}

/** Barre de progression d'une section. */
export function ProgressBar({ filled, total }: { filled: number; total: number }) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
      <span
        className="block h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${total > 0 ? Math.round((filled / total) * 100) : 0}%` }}
      />
    </span>
  );
}

/**
 * « Fiche remplie » : ce qui est rempli dans chaque section de la fiche, en
 * bas de la carte de gauche (personnages, lieux, objets, faune et flore,
 * factions, peuples, magie). Les sections sans champ ne sont pas montrées.
 */
export function SheetProgress({ title, rows }: { title: string; rows: SheetProgressRow[] }) {
  const shown = rows.filter((row) => row.total > 0);
  if (shown.length === 0) return null;

  return (
    <div className="w-full space-y-2.5 border-t pt-4 text-left">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>

      {shown.map((row) => {
        const content = (
          <>
            <span className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{row.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {row.filled} / {row.total}
              </span>
            </span>
            <ProgressBar filled={row.filled} total={row.total} />
          </>
        );

        return row.onClick ? (
          <button
            key={row.key}
            type="button"
            onClick={row.onClick}
            className="block w-full space-y-1 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {content}
          </button>
        ) : (
          <div key={row.key} className="space-y-1">
            {content}
          </div>
        );
      })}
    </div>
  );
}

/** Nombre de champs remplis parmi `keys` (texte non vide, liste non vide). */
export function countFilled(fields: Record<string, string>, keys: string[]): number {
  return keys.filter((key) => {
    const value = (fields[key] ?? "").trim();
    return value !== "" && value !== "[]";
  }).length;
}
