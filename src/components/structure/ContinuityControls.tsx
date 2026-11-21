import { useTranslation } from "react-i18next";
import { SEGMENTED_GROUP, SEGMENTED_ITEM, SEGMENTED_ON } from "@/components/common/segmented";
import { Grid3x3, ListOrdered, type LucideIcon } from "lucide-react";
import { InfoTip } from "@/components/common/InfoTip";
import { cn } from "@/lib/utils";

/*
 * Commandes des vues Continuité (manga et autres types) : le choix de la vue
 * par deux icônes, en tête de la ligne des filtres, et le choix des colonnes
 * du tableau des présences. Le nombre se place en bout de ligne (`ml-auto`).
 */

export type ContinuityMode = "path" | "presence";

export const continuitySelect = "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring";

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
    <div className={SEGMENTED_GROUP} role="tablist" aria-label={label}>
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
            className={cn(SEGMENTED_ITEM, mode === value && SEGMENTED_ON)}
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
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="flex shrink-0 items-center gap-1.5">
        <label htmlFor="continuity-columns">{t("continuity.columns")}</label>
        <InfoTip>{hint}</InfoTip>
      </span>
      <select id="continuity-columns" value={level} onChange={(e) => onLevel(Number(e.target.value))} className={cn(continuitySelect, "w-48 text-foreground")}>
        {levels.map((l, index) => (
          <option key={l.id} value={index}>
            {l.other}
          </option>
        ))}
      </select>
    </div>
  );
}
