import { useTranslation } from "react-i18next";
import { Grid3x3, ListOrdered, type LucideIcon } from "lucide-react";
import { InfoTip } from "@/components/common/InfoTip";
import { cn } from "@/lib/utils";

/*
 * Commandes des vues Continuité (manga et autres types) : le choix de la vue
 * par deux icônes, en tête de la ligne des filtres, et le choix des colonnes
 * du tableau des présences. Le nombre se place en bout de ligne (`ml-auto`).
 */

export type ContinuityMode = "path" | "presence";

export const continuitySelect = "h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring";

interface ModeSwitchProps {
  mode: ContinuityMode;
  onMode: (mode: ContinuityMode) => void;
  /** Nom de chaque vue : bulle d'aide et nom accessible des icônes. */
  labels: Record<ContinuityMode, string>;
  /** Nom du groupe (titre de la vue). */
  label: string;
}

const ICONS: Record<ContinuityMode, LucideIcon> = { path: ListOrdered, presence: Grid3x3 };

/** Deux icônes : parcours (ou case par case) et tableau des présences. */
export function ContinuityModeSwitch({ mode, onMode, labels, label }: ModeSwitchProps) {
  return (
    <div className="inline-flex h-9 shrink-0 items-center rounded-md border bg-muted/40 p-0.5" role="tablist" aria-label={label}>
      {(["path", "presence"] as const).map((value) => {
        const Icon = ICONS[value];
        return (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            aria-label={labels[value]}
            title={labels[value]}
            onClick={() => onMode(value)}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded transition-colors",
              mode === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

interface LevelSelectProps {
  levels: Array<{ id: string; other: string }>;
  level: number;
  onLevel: (level: number) => void;
  /** Ce que compte une case du tableau. */
  hint: string;
}

/** Colonnes du tableau des présences : chapitres, épisodes, pages… */
export function ContinuityLevelSelect({ levels, level, onLevel, hint }: LevelSelectProps) {
  const { t } = useTranslation("structure");
  return (
    <div className="space-y-1.5 text-sm font-medium">
      <span className="flex items-center gap-1.5">
        <label htmlFor="continuity-columns">{t("continuity.columns")}</label>
        <InfoTip>{hint}</InfoTip>
      </span>
      <select id="continuity-columns" value={level} onChange={(e) => onLevel(Number(e.target.value))} className={cn(continuitySelect, "block w-48")}>
        {levels.map((l, index) => (
          <option key={l.id} value={index}>
            {l.other}
          </option>
        ))}
      </select>
    </div>
  );
}
