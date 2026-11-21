import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { EmailCodeForm } from "@/components/auth/EmailCodeForm";
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
import { endEmailSession, fetchRecoverySecrets } from "@/lib/emailRecovery";
import { errorText } from "@/lib/errors";
import { RECOVERY_KEY_ENABLED } from "@/lib/recoveryKey";
import { checkEmail, checkPassword, type ValidationIssue } from "@/lib/validators";

type Step = "identify" | "code" | "password" | "done";

type Problem =
  | { local: "usernameRequired" | "emailRequired" }
  | { issue: ValidationIssue }
  | { text: string };

/**
 * Mot de passe oublié, par e-mail.
 *
 * 1. Nom d'utilisateur et adresse e-mail ;
 * 2. code à 6 chiffres envoyé par Supabase ;
 * 3. nouveau mot de passe : Rust ouvre la clé du compte avec le secret
 *    rendu par Supabase et la referme avec ce mot de passe.
 *
 * Les secrets ne restent qu'en mémoire, le temps de cette page.
 */
export default function RecoverEmail() {
  const { t } = useTranslation(["recovery", "common"]);
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("identify");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [secrets, setSecrets] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [loading, setLoading] = useState(false);

  // La session Supabase est fermée en quittant la page.
  useEffect(() => () => void endEmailSession(), []);

  function onIdentify(event: FormEvent) {
    event.preventDefault();

    if (!username.trim()) return setProblem({ local: "usernameRequired" });
    if (!email.trim()) return setProblem({ local: "emailRequired" });
    const issue = checkEmail(email);
    if (issue) return setProblem({ issue });

    setProblem(null);
    setStep("code");
  }

  async function onVerified() {
    // Les erreurs remontent au formulaire du code, qui les affiche.
    setSecrets(await fetchRecoverySecrets());
    await endEmailSession();
    setStep("password");
  }

  async function onSubmitPassword(event: FormEvent) {
    event.preventDefault();

    const issue = checkPassword(password) ?? (password !== confirm ? "passwordMismatch" : null);
    if (issue) return setProblem({ issue });

    setProblem(null);
    setLoading(true);
    try {
      await api.recoverWithEmail({ username: username.trim(), secrets, newPassword: password });
      setSecrets([]);
      setPassword("");
      setConfirm("");
      setStep("done");
    } catch (e) {
      setProblem({ text: errorText(e) });
    } finally {
      setLoading(false);
    }
  }

  const message = !problem
    ? null
    : "local" in problem
      ? t(`email.errors.${problem.local}`)
      : "issue" in problem
        ? t(`common:validation.${problem.issue}`)
        : problem.text;

  if (step === "done") {
    return (
      <main className="flex flex-1 items-center justify-center bg-background px-4 py-6">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CheckCircle2 className="mb-2 h-8 w-8 text-success" />
            <CardTitle>{t("forgot.success.title")}</CardTitle>
            <CardDescription>{t("forgot.success.description")}</CardDescription>
          </CardHeader>
          <CardFooter className="mt-4">
            <Button className="w-full" onClick={() => navigate("/login", { replace: true })}>
              {t("forgot.success.login")}
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("forgot.title")}</CardTitle>
          <CardDescription>
            {step === "password" ? t("email.recover.passwordSubtitle") : t("email.recover.subtitle")}
          </CardDescription>
        </CardHeader>

        <CardContent className="mt-4">
          {step === "identify" && (
            <form onSubmit={onIdentify} noValidate className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recover-email-username">{t("forgot.username")}</Label>
                <Input
                  id="recover-email-username"
                  placeholder={t("common:placeholders.username")}
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recover-email-address">{t("email.recover.email")}</Label>
                <Input
                  id="recover-email-address"
                  type="email"
                  autoComplete="email"
                  placeholder={t("common:placeholders.email")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t("email.recover.emailHint")}</p>
              </div>

              {message && <p role="alert" className="text-sm text-destructive">{message}</p>}

              <Button type="submit" className="w-full">
                {t("email.recover.sendCode")}
              </Button>
            </form>
          )}

          {step === "code" && (
            <EmailCodeForm
              email={email}
              createUser={false}
              onVerified={onVerified}
              onBack={() => setStep("identify")}
            />
          )}

          {step === "password" && (
            <form onSubmit={onSubmitPassword} noValidate className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="recover-email-password">{t("forgot.newPassword")}</Label>
                <Input
                  id="recover-email-password"
                  placeholder={t("common:placeholders.newPassword")}
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recover-email-confirm">{t("forgot.confirm")}</Label>
                <Input
                  id="recover-email-confirm"
                  placeholder={t("common:placeholders.confirmPassword")}
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>

              {message && <p role="alert" className="text-sm text-destructive">{message}</p>}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("forgot.submitting") : t("forgot.submit")}
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="mt-4 flex-col gap-2">
          {RECOVERY_KEY_ENABLED && step === "identify" && (
            <Link
              to="/recover"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {t("email.recover.useKey")}
            </Link>
          )}
          <Link
            to="/login"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("forgot.back")}
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
