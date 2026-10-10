import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
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
import { api } from "@/lib/api";
import { isRecoveryKeyFormat } from "@/lib/recoveryKey";
import { checkPassword, type ValidationIssue } from "@/lib/validators";

/**
 * Problème affiché sous le formulaire.
 *
 * On garde un code plutôt qu'un texte : le message suit la langue si elle
 * change pendant qu'il est affiché. `text` sert aux erreurs de Rust.
 */
type RecoverIssue =
  | { local: "usernameRequired" | "keyFormat" }
  | { issue: ValidationIssue }
  | { text: string };

/**
 * Mot de passe oublié.
 *
 * La clé de récupération ouvre la clé du compte ; le nouveau mot de passe
 * la referme. Les projets sont conservés. Toute la vérification est faite
 * par Rust (tentatives limitées, même message que le compte existe ou non).
 */
export default function Recover() {
  const { t } = useTranslation(["recovery", "common"]);
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [problem, setProblem] = useState<RecoverIssue | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  function validate(): RecoverIssue | null {
    if (!username.trim()) return { local: "usernameRequired" };
    if (!isRecoveryKeyFormat(recoveryKey)) return { local: "keyFormat" };

    const issue =
      checkPassword(password) ??
      (password !== confirm ? "passwordMismatch" : null);

    return issue ? { issue } : null;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    const found = validate();
    setProblem(found);
    if (found) return;

    setLoading(true);

    try {
      await api.recoverAccount({
        username: username.trim(),
        recoveryKey,
        newPassword: password,
      });

      setRecoveryKey("");
      setPassword("");
      setConfirm("");
      setDone(true);
    } catch (e) {
      setProblem({
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <main className="flex flex-1 items-center justify-center bg-background px-4 py-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CheckCircle2 className="mb-2 h-8 w-8 text-success" />
            <CardTitle>{t("forgot.success.title")}</CardTitle>
            <CardDescription>{t("forgot.success.description")}</CardDescription>
          </CardHeader>

          <CardFooter className="mt-4">
            <Button
              className="w-full"
              onClick={() => navigate("/login", { replace: true })}
            >
              {t("forgot.success.login")}
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  const message = !problem
    ? null
    : "local" in problem
      ? t(`forgot.errors.${problem.local}`)
      : "issue" in problem
        ? t(`common:validation.${problem.issue}`)
        : problem.text;

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-6">
      <Card className="w-full max-w-md">
        <form onSubmit={onSubmit} noValidate>
          <CardHeader>
            <CardTitle>{t("forgot.title")}</CardTitle>
            <CardDescription>{t("forgot.subtitle")}</CardDescription>
          </CardHeader>

          <CardContent className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recover-username">{t("forgot.username")}</Label>
              <Input
                id="recover-username"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="recover-key">{t("forgot.recoveryKey")}</Label>
              <Input
                id="recover-key"
                autoComplete="off"
                spellCheck={false}
                placeholder="XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX"
                className="font-mono uppercase tracking-wider"
                value={recoveryKey}
                onChange={(e) => setRecoveryKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("forgot.recoveryKeyHint")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recover-password">{t("forgot.newPassword")}</Label>
              <Input
                id="recover-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="recover-confirm">{t("forgot.confirm")}</Label>
              <Input
                id="recover-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            {message && (
              <p role="alert" className="text-sm text-destructive">
                {message}
              </p>
            )}

            <p className="text-xs text-muted-foreground">{t("forgot.noKey")}</p>
          </CardContent>

          <CardFooter className="mt-4 flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("forgot.submitting") : t("forgot.submit")}
            </Button>

            <Link
              to="/login"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {t("forgot.back")}
            </Link>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
