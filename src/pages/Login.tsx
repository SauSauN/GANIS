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

type LoginIssue = "usernameRequired" | "passwordRequired";

export default function Login() {
  const navigate = useNavigate();
  const { t } = useTranslation("login");
  const { login, loading, error, clearError } = useAuthStore();
  const user = useAuthStore((state) => state.user);
  const pendingRecoveryKey = useAuthStore((state) => state.pendingRecoveryKey);
  const clearPendingRecoveryKey = useAuthStore(
    (state) => state.clearPendingRecoveryKey,
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // On garde le code du problème (pas le texte) : le message suit la langue
  // même si elle change pendant qu'il est affiché.
  const [localIssue, setLocalIssue] = useState<LoginIssue | null>(null);

  useEffect(() => clearError(), [clearError]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalIssue(null);

    if (!username.trim()) {
      setLocalIssue("usernameRequired");
      return;
    }
    if (!password) {
      setLocalIssue("passwordRequired");
      return;
    }

    const ok = await login(username.trim(), password);
    if (!ok) return;

    setPassword("");

    // Compte créé avant le chiffrement : il vient d'être chiffré, sa clé de
    // récupération est d'abord montrée (une seule fois).
    if (!useAuthStore.getState().pendingRecoveryKey) {
      navigate("/dashboard", { replace: true });
    }
  }

  function onRecoveryKeyConfirmed() {
    clearPendingRecoveryKey();
    navigate("/dashboard", { replace: true });
  }

  // Les erreurs renvoyées par Rust restent pour l'instant en français.
  const shownError = localIssue ? t(`errors.${localIssue}`) : error;

  if (pendingRecoveryKey) {
    return (
      <main className="flex flex-1 items-center justify-center bg-background px-4 py-6">
        <Card className="w-full max-w-lg">
          <CardContent className="py-2">
            <RecoveryKeyPanel
              recoveryKey={pendingRecoveryKey}
              username={user?.username ?? username.trim()}
              context="migrated"
              onConfirmed={onRecoveryKeyConfirmed}
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
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="password">{t("password")}</Label>
                {RECOVERY_KEY_ENABLED && (
                  <Link
                    to="/recover"
                    className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {t("forgotPassword")}
                  </Link>
                )}
              </div>
              <Input id="password" type="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} />
            </div>

            {shownError && <p role="alert" className="text-sm text-destructive">{shownError}</p>}
          </CardContent>

          <CardFooter className="mt-4 flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("submitting") : t("submit")}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t("noAccount")}{" "}
              <Link to="/register" className="text-primary underline-offset-4 hover:underline">
                {t("createAccount")}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
