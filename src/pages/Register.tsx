import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { RecoveryKeyPanel } from "@/components/auth/RecoveryKeyPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RECOVERY_KEY_ENABLED } from "@/lib/recoveryKey";
import { useAuthStore } from "@/stores/authStore";
import {
  checkEmail,
  checkPassword,
  checkUsername,
  type ValidationIssue,
} from "@/lib/validators";

export default function Register() {
  const navigate = useNavigate();
  const { t } = useTranslation(["register", "common"]);
  const { register, loading, error, clearError } = useAuthStore();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // On garde le code du problème (pas le texte) : le message suit la langue
  // même si elle change pendant qu'il est affiché.
  const [localIssue, setLocalIssue] = useState<ValidationIssue | null>(null);
  // Clé de récupération du compte créé, montrée une seule fois.
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);

  useEffect(() => clearError(), [clearError]);

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
    const problem = validate();
    setLocalIssue(problem);
    if (problem) return;

    const created = await register({
      username: username.trim(),
      password,
      email: email.trim() || undefined,
    });

    if (!created) return;

    // Le mot de passe n'a plus à rester en mémoire.
    setPassword("");
    setConfirm("");

    // Clé de récupération (si activées) : montrée avant de continuer.
    if (created.recoveryKey) {
      setRecoveryKey(created.recoveryKey);
    } else {
      navigate("/login", { replace: true });
    }
  }

  // Les erreurs renvoyées par Rust restent pour l'instant en français.
  const shownError = localIssue
    ? t(`common:validation.${localIssue}`)
    : error;

  if (recoveryKey) {
    return (
      <main className="flex flex-1 items-center justify-center bg-background px-4 py-6">
        <Card className="w-full max-w-lg">
          <CardContent className="py-2">
            <RecoveryKeyPanel
              recoveryKey={recoveryKey}
              username={username.trim()}
              context="created"
              onConfirmed={() => navigate("/login", { replace: true })}
            />
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="relative flex flex-1 items-center justify-center bg-background px-4 py-6">

      <Card className="w-full max-w-sm">
        <form onSubmit={onSubmit}>
          <CardHeader>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </CardHeader>

          <CardContent className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t("username")}</Label>
              <Input id="username" autoComplete="username" value={username}
                onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" type="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input id="password" type="password" autoComplete="new-password" value={password}
                onChange={(e) => setPassword(e.target.value)} />
              {!RECOVERY_KEY_ENABLED && (
                <p className="text-xs text-muted-foreground">{t("passwordWarning")}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">{t("confirm")}</Label>
              <Input id="confirm" type="password" autoComplete="new-password" value={confirm}
                onChange={(e) => setConfirm(e.target.value)} />
            </div>

            {shownError && <p role="alert" className="text-sm text-destructive">{shownError}</p>}
          </CardContent>

          <CardFooter className="mt-4 flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("submitting") : t("submit")}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t("hasAccount")}{" "}
              <Link to="/login" className="text-primary underline-offset-4 hover:underline">
                {t("signIn")}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
