import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Fingerprint, Sparkles, type LucideIcon } from "lucide-react";
import { DETAIL_LEVELS } from "@/lib/characters";
import { cn } from "@/lib/utils";
import type { CharacterDetailLevel } from "@/types";

const ICONS: Record<CharacterDetailLevel, LucideIcon> = {
  basic: Fingerprint,
  intermediate: Eye,
  advanced: Sparkles,
};

interface LevelPickerProps {
  value: CharacterDetailLevel | null;
  onChange: (level: CharacterDetailLevel) => void;
  disabled?: boolean;
}

/**
 * Choix du niveau de détail des fiches : Basique (l'identité), Moyen
 * (+ l'apparence), Avancé (+ la personnalité). Les niveaux couverts par le
 * choix sont mis en évidence.
 */
export function LevelPicker({ value, onChange, disabled }: LevelPickerProps) {
  const { t } = useTranslation("characters");
  const name = useId();
  const selectedIndex = value ? DETAIL_LEVELS.indexOf(value) : -1;

  return (
    <div role="radiogroup" aria-label={t("levels.title")} className="grid gap-3 md:grid-cols-3">
      {DETAIL_LEVELS.map((level, index) => {
        const Icon = ICONS[level];
        const selected = level === value;
        const included = index <= selectedIndex;

        return (
          <label
            key={level}
            className={cn(
              "flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              selected
                ? "border-primary bg-primary/5"
                : included
                  ? "border-primary/40 bg-primary/[0.02]"
                  : "border-border hover:bg-muted",
              disabled && "pointer-events-none opacity-60",
            )}
          >
            <span className="flex items-center gap-2">
              <input
                type="radio"
                name={name}
                value={level}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(level)}
                className="size-4 accent-primary"
              />
              <span className="text-sm font-medium">{t(`levels.${level}.label`)}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {index === 0 ? t("levels.count") : t("levels.countMore")}
              </span>
            </span>

            <span className="flex items-start gap-3">
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  included ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{t(`levels.${level}.theme`)}</span>
                <span className="block text-xs leading-5 text-muted-foreground">
                  {t(`levels.${level}.goal`)}
                </span>
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
