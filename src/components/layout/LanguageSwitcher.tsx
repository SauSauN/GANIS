import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";

import {
  DEFAULT_LANGUAGE,
  isLanguage,
  LANGUAGES,
  setLanguage,
} from "@/i18n";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  className?: string;
}

export function LanguageSwitcher({
  className,
}: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation("common");

  const current = isLanguage(i18n.resolvedLanguage)
    ? i18n.resolvedLanguage
    : DEFAULT_LANGUAGE;

  async function handleLanguageChange(
    event: ChangeEvent<HTMLSelectElement>,
  ): Promise<void> {
    const language = event.target.value;

    if (isLanguage(language) && language !== current) {
      await setLanguage(language);
    }
  }

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <select
        value={current}
        onChange={handleLanguageChange}
        aria-label={t("language.label")}
        title={current.toUpperCase()}
        className={cn(
          "h-7 w-12 appearance-none rounded-md",
          "cursor-pointer border border-transparent",
          "bg-transparent pl-2 pr-5 text-xs font-medium",
          "text-foreground hover:bg-secondary",
          "focus-visible:outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring/50",
        )}
      >
        {LANGUAGES.map((language) => (
          <option key={language} value={language} lang={language}>
            {language.toUpperCase()}
          </option>
        ))}
      </select>

      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-1 h-3 w-3 text-muted-foreground"
      />
    </div>
  );
}