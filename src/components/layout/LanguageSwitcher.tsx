import { useTranslation } from "react-i18next";

import {
  LANGUAGE_NAMES,
  LANGUAGES,
  isLanguage,
  setLanguage,
  DEFAULT_LANGUAGE,
} from "@/i18n";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  className?: string;
}

/**
 * Sélecteur de langue compact (FR / EN).
 *
 * Chaque bouton affiche le code de la langue et annonce son nom complet,
 * écrit dans sa propre langue (`lang`), pour les lecteurs d'écran.
 */
export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation("common");

  const current = isLanguage(i18n.resolvedLanguage)
    ? i18n.resolvedLanguage
    : DEFAULT_LANGUAGE;

  return (
    <div
      role="group"
      aria-label={t("language.label")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border bg-card p-0.5",
        className,
      )}
    >
      {LANGUAGES.map((language) => {
        const active = language === current;

        return (
          <button
            key={language}
            type="button"
            lang={language}
            aria-pressed={active}
            aria-label={LANGUAGE_NAMES[language]}
            title={LANGUAGE_NAMES[language]}
            onClick={() => {
              if (!active) void setLanguage(language);
            }}
            className={cn(
              "h-6 rounded-md px-2 text-xs font-medium uppercase transition-colors outline-none",
              "focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {language}
          </button>
        );
      })}
    </div>
  );
}
