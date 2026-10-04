import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyTheme, type Theme } from "@/lib/theme";
import { useAuthStore } from "@/stores/authStore";

const MENUS = ["Fichier", "Édition", "Affichage", "Projet", "Aide"];

export function TitleBar({ projectName }: { projectName?: string }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [theme, setTheme] = useState<Theme>(
    document.documentElement.classList.contains("dark") ? "dark" : "light",
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

  return (
    <header className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-card px-3 text-sm">
      <button
        type="button"
        onClick={() => navigate("/dashboard")}
        className="font-semibold tracking-wide text-foreground hover:text-primary"
      >
        GANIS
      </button>

      <nav className="hidden items-center md:flex" aria-label="Menus">
        {MENUS.map((m) => (
          <button
            key={m}
            type="button"
            disabled
            title="Disponible prochainement"
            className="rounded px-2 py-1 text-muted-foreground enabled:hover:bg-secondary"
          >
            {m}
          </button>
        ))}
      </nav>

      <span className="min-w-0 flex-1 truncate text-center text-muted-foreground">{projectName ?? ""}</span>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Changer de thème">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        {user && <span className="px-2 text-muted-foreground">{user.username}</span>}
        <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Se déconnecter">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
