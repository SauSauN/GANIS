import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Feather } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import {
  validateEmail,
  validatePassword,
  validateUsername,
} from "@/lib/validators";
import { useAuthStore } from "@/stores/authStore";
import { useSetupStore } from "@/stores/setupStore";

/**
 * Assistant de configuration initiale (§37.9).
 *
 * Affiché au premier lancement, lorsqu'aucun compte n'existe encore
 * (voir `SetupGate`). Crée le compte administrateur, puis connecte
 * directement l'utilisateur.
 *
 * La protection réelle est côté Rust : `setup_admin` échoue dès qu'un
 * compte existe, même si deux demandes arrivent en même temps.
 */
export default function Setup() {
  const navigate = useNavigate();

  const login = useAuthStore((state) => state.login);
  const markDone = useSetupStore((state) => state.markDone);
  const checkSetup = useSetupStore((state) => state.check);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function validate(): string | null {
    const usernameError = validateUsername(username);
    if (usernameError) return usernameError;

    const passwordError = validatePassword(password);
    if (passwordError) return passwordError;

    if (password !== confirm) {
      return "Les deux mots de passe ne correspondent pas.";
    }

    return validateEmail(email);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const problem = validate();

    if (problem) {
      setError(problem);
      return;
    }

    setLoading(true);

    try {
      await api.setupAdmin({
        username: username.trim(),
        password,
        email: email.trim() || undefined,
      });
    } catch (err) {
      // La configuration a peut-être été faite entre-temps :
      // on revérifie, ce qui redirige si besoin.
      if (err instanceof ApiError && err.code === "CONFLICT") {
        void checkSetup();
      }

      setError(
        err instanceof Error
          ? err.message
          : "Une erreur est survenue lors de la configuration.",
      );
      setLoading(false);
      return;
    }

    markDone();

    const loggedIn = await login(username.trim(), password);

    navigate(loggedIn ? "/dashboard" : "/", { replace: true });
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-6">
      <Card className="w-full max-w-md">
        <form onSubmit={onSubmit} noValidate>
          <CardHeader>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Feather className="h-6 w-6" />
            </div>

            <CardTitle>Bienvenue dans GANIS</CardTitle>

            <CardDescription>
              Créez le compte administrateur pour commencer. Il permettra
              de gérer les autres comptes de cet ordinateur. Tout reste
              enregistré localement, sans connexion à Internet.
            </CardDescription>
          </CardHeader>

          <CardContent className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="setup-username">Nom d'utilisateur</Label>
              <Input
                id="setup-username"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="administrateur"
              />
              <p className="text-xs text-muted-foreground">
                3 à 50 caractères : lettres, chiffres, « _ » et « - ».
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="setup-email">
                Adresse e-mail (facultatif)
              </Label>
              <Input
                id="setup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="setup-password">Mot de passe</Label>
              <Input
                id="setup-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Au moins 8 caractères, avec une lettre et un chiffre.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="setup-confirm">
                Confirmer le mot de passe
              </Label>
              <Input
                id="setup-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </CardContent>

          <CardFooter className="mt-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Création…" : "Créer le compte administrateur"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
