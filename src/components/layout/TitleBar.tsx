import type { MouseEvent } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { Feather, Moon, Settings, Sun } from "lucide-react";
import { UserMenu } from "@/components/layout/UserMenu";
import { WindowControls } from "@/components/layout/WindowControls";
import { applyTheme, useResolvedTheme, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useProjectStore } from "@/stores/projectStore";

const MENUS = ["Fichier", "Édition", "Affichage", "Projet", "Aide"];

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
          title="Accueil"
          aria-label="Accueil"
          onClick={() => navigate(user ? "/dashboard" : "/")}
          className="flex h-7 items-center gap-2 rounded px-2 font-semibold hover:bg-secondary"
        >
          <Feather className="h-4 w-4 text-primary" />

          <span className="hidden sm:inline">
            GANIS
          </span>
        </button>

        {user && (
          <nav
            className="hidden items-center md:flex"
            aria-label="Menus"
          >
            {MENUS.map((menu) => (
              <button
                key={menu}
                type="button"
                disabled
                title="Disponible prochainement"
                className="h-7 rounded px-2 text-muted-foreground enabled:hover:bg-secondary"
              >
                {menu}
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
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Changer de thème"
          title="Changer de thème"
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
            aria-label="Paramètres généraux"
            title="Paramètres généraux"
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