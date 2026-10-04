import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Feather } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/authStore";

export default function Welcome() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const devLogin = useAuthStore((s) => s.devLogin);
  const { login, loading, error, clearError } = useAuthStore();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => clearError(), [clearError]);

  if (user) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    if (await login(username.trim(), password)) {
      navigate("/dashboard", { replace: true });
    }
  }

  return (
    <main className="flex min-h-screen bg-background">
      {/* Colonne gauche : présentation GANIS */}
      <section className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-gradient-to-br from-primary/5 via-background to-secondary/40 px-12 py-10 md:flex">

        {/* Halo décoratif en haut à gauche */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl"
        />
        {/* Halo décoratif en bas à droite */}
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl"
        />

        {/* En-tête : logo + marque */}
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/30">
            <Feather className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">GANIS</span>
        </div>

        {/* Bloc central */}
        <div className="relative max-w-md space-y-6">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Donnez vie à vos{" "}
            <span className="text-primary">univers</span>.
          </h1>

          <p className="text-base leading-relaxed text-muted-foreground">
            Organisez vos personnages, vos lieux et vos récits dans un espace de travail
            modulaire. Tout reste sur votre ordinateur, sans connexion Internet.
          </p>
        </div>

        {/* Pied : version + mode démo */}
        <div className="relative flex items-center justify-between text-xs text-muted-foreground">
          <span>v0.1.0</span>
          {import.meta.env.DEV && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                devLogin();
                navigate("/dashboard");
              }}
            >
              Mode démo
            </Button>
          )}
        </div>
      </section>

      {/* Colonne droite : fond identique, panneau arrondi centré */}
      <section className="flex w-full items-center justify-center bg-background px-6 py-12 md:w-[480px]">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-lg">
          <div className="mb-6 space-y-1 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">Connexion</h2>
            <p className="text-sm text-muted-foreground">
              Accédez à votre espace personnel.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Nom d'utilisateur</Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Connexion…" : "Se connecter"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Pas encore de compte ?{" "}
            <button
              type="button"
              onClick={() => navigate("/register")}
              className="text-primary underline-offset-4 hover:underline"
            >
              Créer un compte
            </button>
          </p>

          {import.meta.env.DEV && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Formulaire seul pour l'instant : l'authentification est branchée à la Phase 3.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}