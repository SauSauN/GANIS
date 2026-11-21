import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { RecoveryKeyPanel } from "@/components/auth/RecoveryKeyPanel";
import { FieldError, PasswordInput, useAccountValidation } from "@/components/auth/AccountFields";
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
import { useAuthStore } from "@/stores/authStore";
import { useSetupStore } from "@/stores/setupStore";

/**
 * Erreur du formulaire entier, affichée sous les champs (les erreurs de
 * saisie, elles, s'affichent sous chaque champ). `text` ne sert qu'aux
 * erreurs renvoyées par Rust (encore en français).
 */
type SetupError =
  | { key: "failed" }
  | { text: string };

/**
 * Assistant de configuration initiale (§37.9).
 *
 * Affiché au premier lancement, lorsqu'aucun compte n'existe encore
 * (voir `SetupGate`). Crée le premier compte, un compte « Utilisateur »
 * comme les suivants (chacun administre ses projets), puis connecte
 * directement l'utilisateur.
 *
 * La protection réelle est côté Rust : `setup_first_account` échoue dès qu'un
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

  // Une erreur sous chaque champ, reliée au champ (voir `AccountFields`).
  const validation = useAccountValidation(
    { username, email, password, confirm },
    { username: "setup-username", email: "setup-email", password: "setup-password", confirm: "setup-confirm" },
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!validation.validateAll()) return;

    setLoading(true);

    let created: { recoveryKey: string | null };

    try {
      created = await api.setupFirstAccount({
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
                autoComplete="username"
                autoFocus
                value={username}
                {...validation.fieldProps("username", "setup-username-hint")}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("username.placeholder")}
              />
              <FieldError id={validation.errorId("username")} issue={validation.shown("username")} />
              <p id="setup-username-hint" className="text-xs text-muted-foreground">
                {t("username.hint")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="setup-email">{t("email.label")}</Label>
              <Input
                type="email"
                autoComplete="email"
                value={email}
                {...validation.fieldProps("email")}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("email.placeholder")}
              />
              <FieldError id={validation.errorId("email")} issue={validation.shown("email")} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="setup-password">{t("password.label")}</Label>
              <PasswordInput
                placeholder={t("common:placeholders.newPassword")}
                autoComplete="new-password"
                value={password}
                {...validation.fieldProps("password", "setup-password-hint")}
                onChange={(e) => setPassword(e.target.value)}
              />
              <FieldError id={validation.errorId("password")} issue={validation.shown("password")} />
              <p id="setup-password-hint" className="text-xs text-muted-foreground">
                {t("password.hint")}
                {!RECOVERY_KEY_ENABLED && <> {t("password.warning")}</>}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="setup-confirm">{t("confirm")}</Label>
              <PasswordInput
                placeholder={t("common:placeholders.confirmPassword")}
                autoComplete="new-password"
                value={confirm}
                {...validation.fieldProps("confirm")}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <FieldError id={validation.errorId("confirm")} issue={validation.shown("confirm")} />
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
