import { useState } from "react";
import { useMatch, useNavigate } from "react-router-dom";
import { Feather, LogOut, Moon, Sun } from "lucide-react";
import { WindowControls } from "@/components/layout/WindowControls";
import { applyTheme, type Theme } from "@/lib/theme";
import { useAuthStore } from "@/stores/authStore";
import { useProjectStore } from "@/stores/projectStore";

const MENUS = ["Fichier", "Édition", "Affichage", "Projet", "Aide"];

const iconButton =
  "flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

/**
 * Barre de titre unique de l'application (remplace la barre native de Windows).
 * Seules les zones explicitement marquées `data-tauri-drag-region` permettent
 * de déplacer la fenêtre. Les boutons bloquent la propagation pour rester cliquables.
 */
export function TitleBar() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const match = useMatch("/workspace/:projectId");
  const projectId = match?.params.projectId;
  const projectName = useProjectStore((s) =>
    s.projects.find((p) => p.id === projectId)?.name
  );

  const [theme, setTheme] = useState<Theme>(
    document.documentElement.classList.contains("dark") ? "dark" : "light"
  );

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  async function onLogout() {
    await logout();
    navigate("/", { replace: true });
  }

  // Empêche le clic de démarrer un drag de la fenêtre.
  const stopDrag = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <header className="flex h-9 shrink-0 select-none items-center border-b border-border bg-card pl-2 text-sm">
      {/* Logo + navigation : interactif, pas de drag */}
      <div className="flex items-center gap-1" onMouseDown={stopDrag}>
        <button
          type="button"
          title="Accueil"
          aria-label="Accueil"
          onClick={() => navigate(user ? "/dashboard" : "/")}
          className="flex h-7 items-center gap-2 rounded px-2 font-semibold hover:bg-secondary"
        >
          <Feather className="h-4 w-4 text-primary" />
          <span className="hidden sm:inline">GANIS</span>
        </button>

        {user && (
          <nav className="hidden items-center md:flex" aria-label="Menus">
            {MENUS.map((m) => (
              <button
                key={m}
                type="button"
                disabled
                title="Disponible prochainement"
                className="h-7 rounded px-2 text-muted-foreground enabled:hover:bg-secondary"
              >
                {m}
              </button>
            ))}
          </nav>
        )}
      </div>

      {/* Zone centrale : seule zone draggable */}
      <div
        data-tauri-drag-region
        className="flex h-full min-w-0 flex-1 items-center justify-center px-3"
      >
        <span className="pointer-events-none truncate text-xs text-muted-foreground">
          {projectName ?? ""}
        </span>
      </div>

      {/* Actions utilisateur : interactif, pas de drag */}
      <div className="flex items-center gap-1 pr-2" onMouseDown={stopDrag}>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Changer de thème"
          title="Changer de thème"
          className={iconButton}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {user && (
          <>
            <span className="pointer-events-none hidden px-1 text-xs text-muted-foreground sm:inline">
              {user.username}
            </span>
            <button
              type="button"
              onClick={onLogout}
              aria-label="Se déconnecter"
              title="Se déconnecter"
              className={iconButton}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* Contrôles de fenêtre (Min / Max / Close) */}
      <WindowControls />
    </header>
  );
}