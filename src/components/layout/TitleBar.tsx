import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useMatch, useNavigate } from "react-router-dom";
import { Moon, Settings, Sun } from "lucide-react";
import ganisLogo from "@/assets/ganis-logo.png";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { UserMenu } from "@/components/layout/UserMenu";
import { WindowControls } from "@/components/layout/WindowControls";
import { applyTheme, useResolvedTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useProjectStore } from "@/stores/projectStore";

/** Menus de l'application (libellés dans `titlebar.json`). */
const MENUS = ["file", "edit", "view", "project", "help"] as const;

const iconButton =
  "flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

/**
 * Barre de titre unique de l'application.
 *
 * Remplace la barre native de Windows.
 *
 * Seule la zone explicitement marquée
 * `data-tauri-drag-region` permet de déplacer la fenêtre.
 *
 * Les zones interactives empêchent la propagation de `mousedown`
 * afin que les boutons restent cliquables.
 */
export function TitleBar() {
  const navigate = useNavigate();
  const { t } = useTranslation("titlebar");

  const user = useAuthStore((s) => s.user);

  const onSettingsPage = useMatch("/settings") !== null;

  const match = useMatch("/workspace/:projectId");
  const projectId = match?.params.projectId;

  const projectName = useProjectStore((s) =>
    s.projects.find((project) => project.id === projectId)?.name,
  );

  const theme = useResolvedTheme();

  /**
   * Change le thème clair/sombre.
   */
  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";

    applyTheme(next);
  }

  /**
   * Empêche le clic de démarrer le déplacement de la fenêtre.
   */
  const stopDrag = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <header className="flex h-9 shrink-0 select-none items-center border-b border-border bg-card pl-2 text-sm">
      {/* ------------------------------------------------------------------ */}
      {/* Logo + navigation                                                   */}
      {/* ------------------------------------------------------------------ */}

      <div
        className="flex items-center gap-1"
        onMouseDown={stopDrag}
      >
        <button
          type="button"
          title={t("home")}
          aria-label={t("home")}
          onClick={() => navigate(user ? "/dashboard" : "/")}
          className="flex h-7 items-center gap-2 rounded px-2 font-semibold hover:bg-secondary"
        >
          <img
            src={ganisLogo}
            alt=""
            aria-hidden="true"
            className="h-6 w-6 shrink-0 object-contain"
          />

          <span className="hidden sm:inline">
            GANIS
          </span>
        </button>

        {user && (
          <nav
            className="hidden items-center md:flex"
            aria-label={t("menusLabel")}
          >
            {MENUS.map((menu) => (
              <button
                key={menu}
                type="button"
                disabled
                title={t("comingSoon")}
                className="h-7 rounded px-2 text-muted-foreground enabled:hover:bg-secondary"
              >
                {t(`menus.${menu}`)}
              </button>
            ))}
          </nav>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Zone centrale draggable                                             */}
      {/* ------------------------------------------------------------------ */}

      <div
        data-tauri-drag-region
        className="flex h-full min-w-0 flex-1 items-center justify-center px-3"
      >
        <span className="pointer-events-none truncate text-xs text-muted-foreground">
          {projectName ?? ""}
        </span>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Actions utilisateur                                                 */}
      {/* ------------------------------------------------------------------ */}

      <div
        className="flex items-center gap-1 pr-2"
        onMouseDown={stopDrag}
      >
        {/* Langue de l'interface (seul emplacement du sélecteur) */}
        <LanguageSwitcher className="mr-1" />

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={t("toggleTheme")}
          title={t("toggleTheme")}
          className={iconButton}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </button>

        {/* Paramètres généraux (compte, apparence) */}
        {user && (
          <button
            type="button"
            onClick={() => navigate("/settings")}
            aria-label={t("settings")}
            title={t("settings")}
            aria-current={onSettingsPage ? "page" : undefined}
            className={cn(iconButton, onSettingsPage && "bg-secondary text-foreground")}
          >
            <Settings className="h-4 w-4" />
          </button>
        )}

        {/* Menu du compte : paramètres, administration, déconnexion */}
        <UserMenu />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Contrôles de fenêtre                                                */}
      {/* ------------------------------------------------------------------ */}

      <WindowControls />
    </header>
  );
}