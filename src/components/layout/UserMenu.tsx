import { useTranslation } from "react-i18next";
import {
  Blocks,
  Languages,
  LogOut,
  Settings,
  User as UserIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useGuardedNavigate } from "@/components/layout/UnsavedChangesGuard";
import {
  DEFAULT_LANGUAGE,
  isLanguage,
  LANGUAGE_NAMES,
  LANGUAGES,
  setLanguage,
} from "@/i18n";
import { cn } from "@/lib/utils";
import { useUnsavedStore } from "@/lib/unsavedChanges";
import { useAuthStore } from "@/stores/authStore";

const itemClass =
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent";

/**
 * Langue de l'interface, sous forme de ligne du menu.
 *
 * Des boutons plutôt qu'une liste déroulante native : la liste native
 * s'ouvre hors du menu, qui se refermerait au survol de ses options.
 */
function LanguageItem() {
  const { t, i18n } = useTranslation(["usermenu", "common"]);

  const current = isLanguage(i18n.resolvedLanguage)
    ? i18n.resolvedLanguage
    : DEFAULT_LANGUAGE;

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
      <Languages className="h-4 w-4 shrink-0" />
      <span className="flex-1">{t("language")}</span>

      <div
        role="radiogroup"
        aria-label={t("common:language.label")}
        className="flex rounded-md border bg-muted/40 p-0.5"
      >
        {LANGUAGES.map((language) => {
          const selected = language === current;

          return (
            <button
              key={language}
              type="button"
              role="radio"
              aria-checked={selected}
              lang={language}
              title={LANGUAGE_NAMES[language]}
              aria-label={LANGUAGE_NAMES[language]}
              onClick={() => !selected && void setLanguage(language)}
              className={cn(
                "rounded px-1.5 py-0.5 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                selected
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {language.toUpperCase()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function UserMenu() {
  // Sorties de page : demandent d'abord quoi faire des modifications.
  const navigate = useGuardedNavigate();
  const navigateNow = useNavigate();
  const requestLeave = useUnsavedStore((state) => state.requestLeave);
  const { t } = useTranslation("usermenu");

  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  if (!user) {
    return null;
  }

  function handleLogout() {
    requestLeave("leave", () => {
      void logout().then(() => navigateNow("/", { replace: true }));
    });
  }

  return (
    <div className="group relative">
      <button
        type="button"
        className="flex h-7 items-center gap-2 rounded px-2 text-sm hover:bg-secondary"
        aria-label={t("label")}
        title={t("label")}
      >
        <UserIcon className="h-4 w-4" />

        <span className="hidden max-w-32 truncate sm:inline">
          {user.username}
        </span>
      </button>

      <div className="absolute right-0 top-full z-50 hidden w-56 flex-col rounded-md border bg-popover p-1 text-popover-foreground shadow-md group-hover:flex group-focus-within:flex">
        <button type="button" onClick={() => navigate("/settings")} className={itemClass}>
          <Settings className="h-4 w-4" />
          {t("settings")}
        </button>

        <button type="button" onClick={() => navigate("/packages")} className={itemClass}>
          <Blocks className="h-4 w-4" />
          {t("packages")}
        </button>

        {/* Langue de l'interface (une fois connecté ; avant, dans la barre du haut) */}
        <LanguageItem />

        <div className="my-1 h-px bg-border" />

        <button
          type="button"
          onClick={handleLogout}
          className={cn(itemClass, "text-destructive hover:bg-destructive/10")}
        >
          <LogOut className="h-4 w-4" />
          {t("logout")}
        </button>
      </div>
    </div>
  );
}
