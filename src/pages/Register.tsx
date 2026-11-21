import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { EmailCodeForm } from "@/components/auth/EmailCodeForm";
import { RecoveryKeyPanel } from "@/components/auth/RecoveryKeyPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EMAIL_RECOVERY_ENABLED,
  enableEmailRecovery,
  endEmailSession,
} from "@/lib/emailRecovery";
import { notifyError } from "@/lib/notify";
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
  const { t } = useTranslation(["register", "common", "recovery"]);
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
  // Adresse en cours de vérification par code (récupération par e-mail).
  const [verifyingEmail, setVerifyingEmail] = useState(false);

  useEffect(() => clearError(), [clearError]);

  // La session Supabase éventuelle est fermée en quittant la page.
  useEffect(() => () => void endEmailSession(), []);

  /** Vrai si l'adresse saisie servira à la récupération par e-mail. */
  const withEmailRecovery = EMAIL_RECOVERY_ENABLED && email.trim() !== "";

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

    // Adresse donnée : elle est d'abord vérifiée par un code, puis le
    // compte est créé avec sa récupération par e-mail (`createAccount`).
    if (withEmailRecovery) {
      clearError();
      setVerifyingEmail(true);
      return;
    }

    await createAccount(null);
  }

  /** Crée le compte ; avec `supabaseUserId`, active aussi la récupération par e-mail. */
  async function createAccount(supabaseUserId: string | null) {
    const created = await register({
      username: username.trim(),
      password,
      email: email.trim() || undefined,
    });

    if (!created) {
      // Erreur affichée sur le formulaire (nom déjà pris…).
      setVerifyingEmail(false);
      return;
    }

    if (supabaseUserId) {
      try {
        await enableEmailRecovery({ supabaseUserId, username: username.trim(), password });
      } catch {
        // Le compte existe : la récupération pourra être activée depuis
        // les paramètres du compte.
        notifyError(t("recovery:email.errors.signupSetupFailed"));
      } finally {
        await endEmailSession();
      }
    }

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

  if (verifyingEmail && !recoveryKey) {
    return (
      <main className="flex flex-1 items-center justify-center bg-background px-4 py-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>{t("recovery:email.signup.title")}</CardTitle>
            <CardDescription>{t("recovery:email.signup.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="mt-4">
            <EmailCodeForm
              email={email}
              createUser
              onVerified={createAccount}
              onBack={() => setVerifyingEmail(false)}
            />
          </CardContent>
        </Card>
      </main>
    );
  }

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
              <Input id="username" placeholder={t("common:placeholders.chooseUsername")} autoComplete="username" value={username}
                onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" placeholder={t("common:placeholders.email")} type="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} />
              {EMAIL_RECOVERY_ENABLED && (
                <p className="text-xs text-muted-foreground">{t("recovery:email.signup.emailHint")}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input id="password" placeholder={t("common:placeholders.newPassword")} type="password" autoComplete="new-password" value={password}
                onChange={(e) => setPassword(e.target.value)} />
              {!RECOVERY_KEY_ENABLED && !withEmailRecovery && (
                <p className="text-xs text-muted-foreground">{t("passwordWarning")}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">{t("confirm")}</Label>
              <Input id="confirm" placeholder={t("common:placeholders.confirmPassword")} type="password" autoComplete="new-password" value={confirm}
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
