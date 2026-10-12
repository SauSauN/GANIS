import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { RecoveryKeyPanel } from "@/components/auth/RecoveryKeyPanel";
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
import { RECOVERY_KEY_ENABLED } from "@/lib/recoveryKey";
import {
  checkEmail,
  checkPassword,
  checkUsername,
  type ValidationIssue,
} from "@/lib/validators";
import { useAuthStore } from "@/stores/authStore";
import { useSetupStore } from "@/stores/setupStore";

/**
 * Erreur affichée sous le formulaire.
 *
 * On garde le code du problème (pas le texte) : le message suit la langue
 * si elle change pendant qu'il est affiché. `text` ne sert qu'aux erreurs
 * renvoyées par Rust (encore en français).
 */
type SetupError =
  | { issue: ValidationIssue }
  | { key: "failed" }
  | { text: string };

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
  const { t } = useTranslation(["setup", "common"]);

  const login = useAuthStore((state) => state.login);
  const markDone = useSetupStore((state) => state.markDone);
  const checkSetup = useSetupStore((state) => state.check);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<SetupError | null>(null);
  const [loading, setLoading] = useState(false);
  // Clé de récupération du compte créé, montrée une seule fois.
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

  function validate(): ValidationIssue | null {
    return (
      checkUsername(username) ??
      checkPassword(password) ??
      (password !== confirm ? "passwordMismatch" : null) ??
      checkEmail(email)
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const issue = validate();

    if (issue) {
      setError({ issue });
      return;
    }

    setLoading(true);

    let created: { recoveryKey: string | null };

    try {
      created = await api.setupAdmin({
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

      setError(err instanceof Error ? { text: err.message } : { key: "failed" });
      setLoading(false);
      return;
    }

    // La connexion se fait tout de suite, pendant que le mot de passe est
    // encore en mémoire ; l'accès au tableau de bord attend que la clé de
    // récupération soit notée.
    const loggedIn = await login(username.trim(), password);

    setPassword("");
    setConfirm("");
    setLoading(false);

    if (!loggedIn) {
      markDone();
      navigate("/", { replace: true });
      return;
    }

    // Clé de récupération (si activées) : montrée avant le tableau de bord.
    if (created.recoveryKey) {
      setRecoveryKey(created.recoveryKey);
    } else {
      onRecoveryKeyConfirmed();
    }
  }

  function onRecoveryKeyConfirmed() {
    markDone();
    navigate("/dashboard", { replace: true });
  }

  const errorMessage = !error
    ? null
    : "issue" in error
      ? t(`common:validation.${error.issue}`)
      : "key" in error
        ? t("errors.failed")
        : error.text;

  if (recoveryKey) {
    return (
      <main className="flex flex-1 items-center justify-center bg-background px-4 py-6">
        <Card className="w-full max-w-lg">
          <CardContent className="py-2">
            <RecoveryKeyPanel
              recoveryKey={recoveryKey}
              username={username.trim()}
              context="created"
              onConfirmed={onRecoveryKeyConfirmed}
            />
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-6">
      <Card className="w-full max-w-md">
        <form onSubmit={onSubmit} noValidate>
          <CardHeader>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Feather className="h-6 w-6" />
            </div>

            <CardTitle>{t("title")}</CardTitle>

            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>

          <CardContent className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="setup-username">{t("username.label")}</Label>
              <Input
                id="setup-username"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("username.placeholder")}
              />
              <p className="text-xs text-muted-foreground">
                {t("username.hint")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="setup-email">{t("email.label")}</Label>
              <Input
                id="setup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("email.placeholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="setup-password">{t("password.label")}</Label>
              <Input
                id="setup-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("password.hint")}
                {!RECOVERY_KEY_ENABLED && <> {t("password.warning")}</>}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="setup-confirm">{t("confirm")}</Label>
              <Input
                id="setup-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            {errorMessage && (
              <p role="alert" className="text-sm text-destructive">
                {errorMessage}
              </p>
            )}
          </CardContent>

          <CardFooter className="mt-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("submitting") : t("submit")}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
