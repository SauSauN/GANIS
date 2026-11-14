import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Blocks,
  Check,
  ChevronRight,
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
  "flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-accent";

/**
 * Langue de l'interface, sous forme de ligne du menu : « Langue · Français ».
 * Un clic déplie la liste des langues dans le menu même (une liste native
 * s'ouvrirait hors du menu, qui se refermerait au survol de ses options).
 * Elle tient autant de langues qu'il en faut : au-delà, elle défile.
 */
function LanguageItem() {
  const { t, i18n } = useTranslation(["usermenu", "common"]);
  const [open, setOpen] = useState(false);

  const current = isLanguage(i18n.resolvedLanguage)
    ? i18n.resolvedLanguage
    : DEFAULT_LANGUAGE;

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="user-menu-languages"
        onClick={() => setOpen((value) => !value)}
        className={itemClass}
      >
        <Languages className="h-4 w-4 shrink-0" />
        <span className="flex-1">{t("language")}</span>
        <span className="truncate text-xs text-muted-foreground" lang={current}>
          {LANGUAGE_NAMES[current]}
        </span>
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div
          id="user-menu-languages"
          role="radiogroup"
          aria-label={t("common:language.label")}
          className="mx-1 mb-1 max-h-48 overflow-y-auto rounded-md border bg-muted/30 p-1"
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
                onClick={() => {
                  if (!selected) void setLanguage(language);
                  setOpen(false);
                }}
                className={cn(
                  "flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-accent",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  selected && "font-medium",
                )}
              >
                <span className="w-6 shrink-0 text-xs text-muted-foreground uppercase">{language}</span>
                <span className="flex-1 truncate">{LANGUAGE_NAMES[language]}</span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
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

  // Ouvert au clic (convention des menus), fermé au clic extérieur ou avec Échap.
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) {
    return null;
  }

  function handleLogout() {
    requestLeave("leave", () => {
      void logout().then(() => navigateNow("/", { replace: true }));
    });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn("flex h-7 items-center gap-2 rounded px-2 text-sm hover:bg-secondary", open && "bg-secondary")}
        aria-label={t("label")}
        title={t("label")}
      >
        <UserIcon className="h-4 w-4" />

        <span className="hidden max-w-32 truncate sm:inline">
          {user.username}
        </span>
      </button>

      {open && (
      <div
        role="menu"
        onClick={(event) => {
          // Un choix ferme le menu (pas la langue, qui reste visible).
          if ((event.target as HTMLElement).closest("[data-close]")) setOpen(false);
        }}
        className="absolute right-0 top-full z-50 mt-1 flex w-56 flex-col rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <button type="button" data-close onClick={() => navigate("/settings")} className={itemClass}>
          <Settings className="h-4 w-4" />
          {t("settings")}
        </button>

        <button type="button" data-close onClick={() => navigate("/packages")} className={itemClass}>
          <Blocks className="h-4 w-4" />
          {t("packages")}
        </button>

        {/* Langue de l'interface (une fois connecté ; avant, dans la barre du haut) */}
        <LanguageItem />

        <div className="my-1 h-px bg-border" />

        <button
          type="button"
          data-close
          onClick={handleLogout}
          className={cn(itemClass, "text-destructive hover:bg-destructive/10")}
        >
          <LogOut className="h-4 w-4" />
          {t("logout")}
        </button>
      </div>
      )}
    </div>
  );
}