import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, Mail, ShieldCheck, User as UserIcon } from "lucide-react";
import {
  cardClass,
  cardFooterClass,
  cardHeaderClass,
} from "@/components/settings/styles";
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
import {
  checkEmail,
  checkPassword,
  type ValidationIssue,
} from "@/lib/validators";
import { useAuthStore } from "@/stores/authStore";

/** Messages propres à cette section (clés de `settings.json`). */
type AccountMessage =
  | "account.email.updated"
  | "account.email.removed"
  | "account.email.failed"
  | "account.password.currentRequired"
  | "account.password.changed"
  | "account.password.failed";

/**
 * Retour affiché sous un formulaire.
 *
 * On garde une clé de traduction plutôt qu'un texte : le message suit la
 * langue si elle change pendant qu'il est affiché. `text` ne sert qu'aux
 * erreurs renvoyées par Rust (encore en français).
 */
type Feedback =
  | { kind: "success" | "error"; key: AccountMessage }
  | { kind: "error"; issue: ValidationIssue }
  | { kind: "error"; text: string };

/** Erreur de Rust si elle a un message, sinon le message de secours traduit. */
const failure = (e: unknown, key: AccountMessage): Feedback =>
  e instanceof Error ? { kind: "error", text: e.message } : { kind: "error", key };

function FeedbackMessage({ feedback }: { feedback: Feedback | null }) {
  const { t } = useTranslation(["settings", "common"]);

  if (!feedback) {
    return null;
  }

  const message =
    "key" in feedback
      ? t(feedback.key)
      : "issue" in feedback
        ? t(`common:validation.${feedback.issue}`)
        : feedback.text;

  return (
    <p
      role={feedback.kind === "error" ? "alert" : "status"}
      className={
        feedback.kind === "error"
          ? "text-sm text-destructive"
          : "text-sm text-success"
      }
    >
      {message}
    </p>
  );
}

/** Une information du compte, avec son icône : posée directement sur la carte, sans cadre. */
function InfoCell({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof UserIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>

        <div className="mt-1 break-words text-sm font-medium">{children}</div>
      </div>
    </div>
  );
}

/**
 * Section « Compte » : informations du compte, adresse e-mail
 * et changement de mot de passe.
 */
export function AccountSection() {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);

  const [email, setEmail] = useState(user?.email ?? "");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<Feedback | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordFeedback, setPasswordFeedback] =
    useState<Feedback | null>(null);

  if (!user) {
    return null;
  }

  async function handleEmailSubmit(event: FormEvent) {
    event.preventDefault();
    setEmailFeedback(null);

    const issue = checkEmail(email);

    if (issue) {
      setEmailFeedback({ kind: "error", issue });
      return;
    }

    setEmailSaving(true);

    try {
      const updated = await api.updateProfile({ email: email.trim() });

      setUser(updated);
      setEmail(updated.email ?? "");
      setEmailFeedback({
        kind: "success",
        key: updated.email ? "account.email.updated" : "account.email.removed",
      });
    } catch (e) {
      setEmailFeedback(failure(e, "account.email.failed"));
    } finally {
      setEmailSaving(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setPasswordFeedback(null);

    if (!currentPassword) {
      setPasswordFeedback({
        kind: "error",
        key: "account.password.currentRequired",
      });
      return;
    }

    const issue =
      checkPassword(newPassword) ??
      (newPassword !== confirmPassword ? "passwordMismatch" : null);

    if (issue) {
      setPasswordFeedback({ kind: "error", issue });
      return;
    }

    setPasswordSaving(true);

    try {
      await api.changePassword({ currentPassword, newPassword });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFeedback({ kind: "success", key: "account.password.changed" });
    } catch (e) {
      setPasswordFeedback(failure(e, "account.password.failed"));
    } finally {
      setPasswordSaving(false);
    }
  }

  // Date au format de la langue choisie (« 8 octobre 2026 » / « October 8, 2026 »).
  const createdAt = new Date(user.createdAt).toLocaleDateString(
    i18n.resolvedLanguage,
    { day: "numeric", month: "long", year: "numeric" },
  );

  return (
    <div className="space-y-8">
      {/* ==================================================================
          INFORMATIONS DU COMPTE
          ================================================================== */}

      <Card className={cardClass}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("account.info.title")}</CardTitle>

          <CardDescription>{t("account.info.description")}</CardDescription>
        </CardHeader>

        <CardContent className="px-6 py-6">
          <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <InfoCell icon={UserIcon} label={t("account.info.username")}>
              {user.username}
            </InfoCell>

            <InfoCell icon={Mail} label={t("account.info.email")}>
              {user.email ?? (
                <span className="font-normal text-muted-foreground">
                  {t("account.info.emailEmpty")}
                </span>
              )}
            </InfoCell>

            <InfoCell icon={ShieldCheck} label={t("account.info.role")}>
              <span className="inline-flex items-center rounded-md border bg-muted/40 px-2.5 py-1 text-xs font-medium">
                {t(`account.roles.${user.role}`, { defaultValue: user.role })}
              </span>
            </InfoCell>

            <InfoCell icon={CalendarDays} label={t("account.info.createdAt")}>
              {createdAt}
            </InfoCell>
          </div>
        </CardContent>
      </Card>

      {/* ==================================================================
          ADRESSE E-MAIL
          ================================================================== */}

      <Card className={cardClass}>
        <form onSubmit={handleEmailSubmit} noValidate>
          <CardHeader className={cardHeaderClass}>
            <CardTitle>{t("account.email.title")}</CardTitle>

            <CardDescription>{t("account.email.description")}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 px-6 py-6">
            <div className="max-w-md space-y-2">
              <Label htmlFor="profile-email">{t("account.email.label")}</Label>

              <Input
                id="profile-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <FeedbackMessage feedback={emailFeedback} />
          </CardContent>

          <CardFooter className={cardFooterClass}>
            <Button type="submit" disabled={emailSaving}>
              {emailSaving ? t("common:actions.saving") : t("common:actions.save")}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* ==================================================================
          MOT DE PASSE
          ================================================================== */}

      <Card className={cardClass}>
        <form onSubmit={handlePasswordSubmit}>
          <CardHeader className={cardHeaderClass}>
            <CardTitle>{t("account.password.title")}</CardTitle>

            <CardDescription>{t("account.password.description")}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 px-6 py-6">
            <div className="max-w-md space-y-2">
              <Label htmlFor="current-password">
                {t("account.password.current")}
              </Label>

              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>

            <div className="grid max-w-2xl gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-password">{t("account.password.new")}</Label>

                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">
                  {t("account.password.confirm")}
                </Label>

                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            <FeedbackMessage feedback={passwordFeedback} />
          </CardContent>

          <CardFooter className={cardFooterClass}>
            <Button type="submit" disabled={passwordSaving}>
              {passwordSaving
                ? t("account.password.submitting")
                : t("account.password.submit")}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}