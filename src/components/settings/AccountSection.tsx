import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { notifyError, notifySaved } from "@/lib/notify";
import { CalendarDays, Mail, ShieldCheck, Trash2, User as UserIcon } from "lucide-react";
import { RecoveryKeyPanel } from "@/components/auth/RecoveryKeyPanel";
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
import { cn } from "@/lib/utils";
import {
  checkEmail,
  checkPassword,
  type ValidationIssue,
} from "@/lib/validators";
import { IDLE_LOCK_DELAYS, setIdleLock, useIdleLock, type IdleLockDelay } from "@/lib/preferences";
import { RECOVERY_KEY_ENABLED } from "@/lib/recoveryKey";
import { useAuthStore } from "@/stores/authStore";

/** Messages propres à cette section (clés de `settings.json`). */
type AccountMessage =
  | "account.email.updated"
  | "account.email.removed"
  | "account.email.failed"
  | "account.password.currentRequired"
  | "account.password.changed"
  | "account.password.failed"
  | "account.recovery.currentRequired"
  | "account.recovery.failed"
  | "account.recovery.done"
  | "account.delete.passwordRequired"
  | "account.delete.confirmRequired"
  | "account.delete.failed";

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

/**
 * Retour d'une action du compte : en notification, pas dans la page, pour
 * que rien ne bouge. Le composant ne dessine rien ; il annonce chaque
 * nouveau retour.
 */
function FeedbackMessage({ feedback }: { feedback: Feedback | null }) {
  const { t } = useTranslation(["settings", "common"]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const message =
      "key" in feedback
        ? t(feedback.key)
        : "issue" in feedback
          ? t(`common:validation.${feedback.issue}`)
          : feedback.text;

    if (feedback.kind === "error") {
      notifyError(message, "account");
    } else {
      notifySaved(message, "account");
    }
    // Un nouveau retour = un nouvel objet : annoncé une fois.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback]);

  return null;
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
 * Clé de récupération : en créer une nouvelle (l'ancienne cesse de
 * fonctionner). La nouvelle clé est affichée une seule fois, à la place
 * du formulaire, jusqu'à ce que l'utilisateur confirme l'avoir notée.
 */
function RecoveryKeyCard({ username }: { username: string }) {
  const { t } = useTranslation(["settings", "common"]);

  const [currentPassword, setCurrentPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);

    if (!currentPassword) {
      setFeedback({ kind: "error", key: "account.recovery.currentRequired" });
      return;
    }

    setSaving(true);

    try {
      const key = await api.regenerateRecoveryKey({ currentPassword });

      setCurrentPassword("");
      setNewKey(key);
    } catch (e) {
      setFeedback(failure(e, "account.recovery.failed"));
    } finally {
      setSaving(false);
    }
  }

  if (newKey) {
    return (
      <Card className={cardClass}>
        <CardContent className="px-6 py-6">
          <div className="max-w-xl">
            <RecoveryKeyPanel
              recoveryKey={newKey}
              username={username}
              context="regenerated"
              onConfirmed={() => {
                setNewKey(null);
                setFeedback({ kind: "success", key: "account.recovery.done" });
              }}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cardClass}>
      <form onSubmit={handleSubmit}>
        <CardHeader className={cardHeaderClass}>
          <CardTitle>{t("account.recovery.title")}</CardTitle>

          <CardDescription>{t("account.recovery.description")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 px-6 py-6">
          <div className="max-w-md space-y-2">
            <Label htmlFor="recovery-current-password">
              {t("account.recovery.current")}
            </Label>

            <Input
              id="recovery-current-password"
              placeholder={t("common:placeholders.currentPassword")}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>

          <FeedbackMessage feedback={feedback} />
        </CardContent>

        <CardFooter className={cardFooterClass}>
          <Button type="submit" variant="outline" disabled={saving}>
            {saving
              ? t("account.recovery.submitting")
              : t("account.recovery.submit")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

/**
 * Verrouillage automatique : après le délai choisi sans aucun geste, la
 * clé du compte est effacée de la mémoire et le mot de passe est demandé
 * pour reprendre (voir `IdleLock`). Réglage propre à cet ordinateur.
 */
function IdleLockCard() {
  const { t } = useTranslation(["settings", "common"]);
  const minutes = useIdleLock();

  return (
    <Card className={cardClass}>
      <CardHeader className={cardHeaderClass}>
        <CardTitle>{t("lock.settingTitle")}</CardTitle>

        <CardDescription>{t("lock.settingDescription")}</CardDescription>
      </CardHeader>

      <CardContent className="px-6 py-6">
        <div className="max-w-xs space-y-2">
          <Label htmlFor="idle-lock-delay">{t("lock.delayLabel")}</Label>

          <select
            id="idle-lock-delay"
            value={minutes}
            onChange={(e) => setIdleLock(Number(e.target.value) as IdleLockDelay)}
            className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {IDLE_LOCK_DELAYS.map((value) => (
              <option key={value} value={value}>
                {value === 0 ? t("lock.never") : t("lock.after", { count: value })}
              </option>
            ))}
          </select>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Suppression du compte : le mot de passe est redemandé et la case « Je
 * comprends » doit être cochée. Le compte et ses projets privés (corbeille
 * comprise) sont effacés définitivement ; les projets publics restent.
 */
function DeleteAccountCard() {
  const { t } = useTranslation(["settings", "common"]);
  const navigate = useNavigate();
  const deleteAccount = useAuthStore((state) => state.deleteAccount);

  const [password, setPassword] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);

    if (!password) {
      setFeedback({ kind: "error", key: "account.delete.passwordRequired" });
      return;
    }

    if (!understood) {
      setFeedback({ kind: "error", key: "account.delete.confirmRequired" });
      return;
    }

    setBusy(true);

    try {
      await deleteAccount(password);
      navigate("/", { replace: true });
    } catch (e) {
      setFeedback(failure(e, "account.delete.failed"));
      setBusy(false);
    }
  }

  return (
    <Card className={cn(cardClass, "border-destructive/40")}>
      <form onSubmit={handleSubmit} noValidate>
        <CardHeader className={cn(cardHeaderClass, "border-destructive/20")}>
          <CardTitle className="text-destructive">{t("account.delete.title")}</CardTitle>

          <CardDescription>{t("account.delete.description")}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 px-6 py-6">
          <p className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-muted-foreground">
            {t("account.delete.exportFirst")}
          </p>

          <div className="max-w-md space-y-2">
            <Label htmlFor="delete-account-password">{t("account.delete.password")}</Label>

            <Input
              id="delete-account-password"
              placeholder={t("common:placeholders.password")}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-primary"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
            />
            {t("account.delete.understand")}
          </label>

          <FeedbackMessage feedback={feedback} />
        </CardContent>

        <CardFooter className={cardFooterClass}>
          <Button type="submit" variant="destructive" disabled={busy}>
            <Trash2 className="mr-2 h-4 w-4" />
            {busy ? t("account.delete.submitting") : t("account.delete.submit")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

/**
 * Section « Compte » : informations du compte, adresse e-mail,
 * changement de mot de passe et clé de récupération.
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
                placeholder={t("common:placeholders.email")}
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
              {t("common:actions.save")}
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
                placeholder={t("common:placeholders.currentPassword")}
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
                  placeholder={t("common:placeholders.newPassword")}
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
                  placeholder={t("common:placeholders.confirmPassword")}
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

      {/* ==================================================================
          CLÉ DE RÉCUPÉRATION
          ================================================================== */}

      {/* Désactivée pour l'instant : voir RECOVERY_KEY_ENABLED. */}
      {RECOVERY_KEY_ENABLED && <RecoveryKeyCard username={user.username} />}

      {/* ==================================================================
          VERROUILLAGE AUTOMATIQUE
          ================================================================== */}

      <IdleLockCard />

      {/* ==================================================================
          SUPPRESSION DU COMPTE
          ================================================================== */}

      <DeleteAccountCard />
    </div>
  );
}
