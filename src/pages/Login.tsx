import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/authStore";

export default function Login() {
  const navigate = useNavigate();
  const { login, loading, error, clearError } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => clearError(), [clearError]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    if (await login(username.trim(), password)) navigate("/dashboard", { replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <form onSubmit={onSubmit}>
          <CardHeader>
            <CardTitle>Connexion</CardTitle>
            <CardDescription>Accédez à votre espace personnel.</CardDescription>
          </CardHeader>

          <CardContent className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Nom d'utilisateur</Label>
              <Input id="username" autoComplete="username" value={username}
                onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} />
            </div>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {import.meta.env.DEV && (
              <p className="text-xs text-muted-foreground">
                Formulaire seul pour l'instant : l'authentification est branchée à la Phase 3.
              </p>
            )}
          </CardContent>

          <CardFooter className="mt-4 flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Connexion…" : "Se connecter"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Pas encore de compte ?{" "}
              <Link to="/register" className="text-primary underline-offset-4 hover:underline">
                Créer un compte
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
