import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { notifyError, notifySaved } from "@/lib/notify";
import { CalendarDays, Feather, Mail, ShieldCheck, Trash2, User as UserIcon } from "lucide-react";
import { EmailCodeForm } from "@/components/auth/EmailCodeForm";
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
import { api, isTauri } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  checkEmail,
  checkPassword,
  type ValidationIssue,
} from "@/lib/validators";
import { IDLE_LOCK_DELAYS, setIdleLock, useIdleLock, type IdleLockDelay } from "@/lib/preferences";
import {
  EMAIL_RECOVERY_ENABLED,
  EmailRecoveryError,
  enableEmailRecovery,
  endEmailSession,
} from "@/lib/emailRecovery";
import { RECOVERY_KEY_ENABLED } from "@/lib/recoveryKey";
import { useAuthStore } from "@/stores/authStore";
import { TitleWithInfo } from "@/components/common/TitleWithInfo";
import type { AuthorProfile, User } from "@/types";

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
  | "account.delete.failed"
  | "account.profile.updated"
  | "account.profile.failed"
  | "account.emailRecovery.enabled"
  | "account.emailRecovery.disabled"
  | "account.emailRecovery.failed"
  | "account.deviceKey.failed";

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

const EMPTY_PROFILE: AuthorProfile = { penName: "", fullName: "", website: "", bio: "" };

/** Longueurs maximales (les mêmes que côté Rust, `AuthorProfile::MAX_*`). */
const PROFILE_MAX = { penName: 100, fullName: 100, website: 200, bio: 1000 } as const;

/**
 * Profil d'auteur : informations facultatives ajoutées au compte (nom
 * d'auteur, nom complet, site web, biographie). Chiffré sur l'appareil,
 * comme l'adresse e-mail.
 */
function AuthorProfileCard({ user, onSaved }: { user: User; onSaved: (user: User) => void }) {
  const { t } = useTranslation(["settings", "common"]);
  const saved = { ...EMPTY_PROFILE, ...user.profile };
  const [profile, setProfile] = useState<AuthorProfile>(saved);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const dirty = (Object.keys(EMPTY_PROFILE) as Array<keyof AuthorProfile>).some((key) => profile[key] !== saved[key]);
  const set = (key: keyof AuthorProfile) => (value: string) => setProfile((current) => ({ ...current, [key]: value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await api.updateAuthorProfile(profile);
      onSaved(updated);
      setProfile({ ...EMPTY_PROFILE, ...updated.profile });
      setFeedback({ kind: "success", key: "account.profile.updated" });
    } catch (e) {
      setFeedback(failure(e, "account.profile.failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={cardClass}>
      <form onSubmit={handleSubmit} noValidate>
        <CardHeader className={cardHeaderClass}>
          <TitleWithInfo info={t("account.profile.description")}>{t("account.profile.title")}</TitleWithInfo>
        </CardHeader>

        <CardContent className="space-y-6 px-6 py-6">
          <div className="grid max-w-2xl gap-x-6 gap-y-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="profile-pen-name">{t("account.profile.penName")}</Label>
              <Input
                id="profile-pen-name"
                maxLength={PROFILE_MAX.penName}
                placeholder={t("account.profile.penNamePlaceholder")}
                value={profile.penName}
                onChange={(e) => set("penName")(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile-full-name">{t("account.profile.fullName")}</Label>
              <Input
                id="profile-full-name"
                maxLength={PROFILE_MAX.fullName}
                autoComplete="name"
                placeholder={t("account.profile.fullNamePlaceholder")}
                value={profile.fullName}
                onChange={(e) => set("fullName")(e.target.value)}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="profile-website">{t("account.profile.website")}</Label>
              <Input
                id="profile-website"
                type="url"
                maxLength={PROFILE_MAX.website}
                autoComplete="url"
                placeholder={t("account.profile.websitePlaceholder")}
                value={profile.website}
                onChange={(e) => set("website")(e.target.value)}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="profile-bio">{t("account.profile.bio")}</Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {profile.bio.length} / {PROFILE_MAX.bio}
                </span>
              </div>
              <textarea
                id="profile-bio"
                rows={4}
                maxLength={PROFILE_MAX.bio}
                placeholder={t("account.profile.bioPlaceholder")}
                value={profile.bio}
                onChange={(e) => set("bio")(e.target.value)}
                className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-border/30"
              />
            </div>
          </div>

          <FeedbackMessage feedback={feedback} />
        </CardContent>

        <CardFooter className={cardFooterClass}>
          <Button type="submit" disabled={saving || !dirty}>
            {t("common:actions.save")}
          </Button>
        </CardFooter>
      </form>
    </Card>
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
          <TitleWithInfo info={t("account.recovery.description")}>{t("account.recovery.title")}</TitleWithInfo>
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
 * Clé de secours de cet ordinateur : la base de l'application est chiffrée
 * avec une clé liée à ce compte Windows (voir `security/device_key.rs`).
 * Après une réinstallation de Windows, seul ce fichier permet de retrouver
 * les données.
 */
function DeviceKeyBackupCard() {
  const { t, i18n } = useTranslation(["settings", "common"]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function save() {
    setSaving(true);
    setFeedback(null);
    try {
      const file = await api.saveDeviceKeyBackup({
        language: i18n.language.startsWith("en") ? "en" : "fr",
        dialogTitle: t("account.deviceKey.dialogTitle"),
      });
      if (file) setSaved(file);
    } catch (e) {
      setFeedback(failure(e, "account.deviceKey.failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={cardClass}>
      <CardHeader className={cardHeaderClass}>
        <TitleWithInfo info={t("account.deviceKey.description")}>{t("account.deviceKey.title")}</TitleWithInfo>
      </CardHeader>

      <CardContent className="space-y-3 px-6 py-6 text-sm text-muted-foreground">
        <p>{t("account.deviceKey.intro")}</p>
        <p>{t("account.deviceKey.keepSafe")}</p>
        {saved && (
          <p role="status" className="text-foreground">
            {t("account.deviceKey.saved", { file: saved })}
          </p>
        )}
        <FeedbackMessage feedback={feedback} />
      </CardContent>

      <CardFooter className={cardFooterClass}>
        <Button type="button" variant="outline" disabled={saving} onClick={() => void save()}>
          <ShieldCheck />
          {saving ? t("account.deviceKey.saving") : t("account.deviceKey.save")}
        </Button>
      </CardFooter>
    </Card>
  );
}

/**
 * Récupération par e-mail : un code envoyé à l'adresse choisie permettra
 * de choisir un nouveau mot de passe sans perdre les projets (voir
 * `lib/emailRecovery.ts`). L'adresse est vérifiée par un code avant
 * l'activation ; le mot de passe actuel est demandé.
 */
function EmailRecoveryCard({ user }: { user: User }) {
  const { t } = useTranslation(["settings", "recovery", "common"]);

  const [active, setActive] = useState<boolean | null>(null);
  const [email, setEmail] = useState(user.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [step, setStep] = useState<"form" | "code">("form");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .hasEmailRecovery()
      .then((value) => !cancelled && setActive(value))
      .catch(() => !cancelled && setActive(false));
    return () => {
      cancelled = true;
      void endEmailSession();
    };
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFeedback(null);

    const issue: ValidationIssue | null = email.trim() ? checkEmail(email) : "emailInvalid";
    if (issue) {
      setFeedback({ kind: "error", issue });
      return;
    }
    if (!currentPassword) {
      setFeedback({ kind: "error", key: "account.recovery.currentRequired" });
      return;
    }

    setStep("code");
  }

  async function onVerified(supabaseUserId: string) {
    try {
      await enableEmailRecovery({ supabaseUserId, username: user.username, password: currentPassword });
      setActive(true);
      setFeedback({ kind: "success", key: "account.emailRecovery.enabled" });
    } catch (e) {
      setFeedback(
        e instanceof EmailRecoveryError
          ? { kind: "error", text: t(`recovery:email.errors.${e.issue}`) }
          : failure(e, "account.emailRecovery.failed"),
      );
    } finally {
      setCurrentPassword("");
      setStep("form");
      await endEmailSession();
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await api.disableEmailRecovery();
      setActive(false);
      setFeedback({ kind: "success", key: "account.emailRecovery.disabled" });
    } catch (e) {
      setFeedback(failure(e, "account.emailRecovery.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={cardClass}>
      <CardHeader className={cardHeaderClass}>
        <TitleWithInfo info={t("account.emailRecovery.description")}>{t("account.emailRecovery.title")}</TitleWithInfo>
      </CardHeader>

      <CardContent className="space-y-6 px-6 py-6">
        <p className="text-sm text-muted-foreground">
          {active === null
            ? "…"
            : active
              ? t("account.emailRecovery.statusOn")
              : t("account.emailRecovery.statusOff")}
        </p>

        {step === "code" ? (
          <div className="max-w-md">
            <EmailCodeForm
              email={email}
              createUser
              onVerified={onVerified}
              onBack={() => setStep("form")}
            />
          </div>
        ) : (
          <form id="email-recovery-form" onSubmit={handleSubmit} noValidate className="grid max-w-2xl gap-x-6 gap-y-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email-recovery-address">{t("account.emailRecovery.email")}</Label>
              <Input
                id="email-recovery-address"
                type="email"
                autoComplete="email"
                placeholder={t("common:placeholders.email")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email-recovery-password">{t("account.recovery.current")}</Label>
              <Input
                id="email-recovery-password"
                type="password"
                autoComplete="current-password"
                placeholder={t("common:placeholders.currentPassword")}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
          </form>
        )}

        <FeedbackMessage feedback={feedback} />
      </CardContent>

      {step === "form" && (
        <CardFooter className={cn(cardFooterClass, "gap-2")}>
          {active && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void disable()}>
              {t("account.emailRecovery.disable")}
            </Button>
          )}
          <Button type="submit" form="email-recovery-form" variant="outline" disabled={busy}>
            {active ? t("account.emailRecovery.renew") : t("account.emailRecovery.enable")}
          </Button>
        </CardFooter>
      )}
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
        <TitleWithInfo info={t("lock.settingDescription")}>{t("lock.settingTitle")}</TitleWithInfo>
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
            <Trash2 />
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
      checkPassword(newPassword, user?.username) ??
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

            {user.profile?.penName && (
              <InfoCell icon={Feather} label={t("account.profile.penName")}>
                {user.profile.penName}
              </InfoCell>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ==================================================================
          PROFIL D'AUTEUR
          ================================================================== */}

      <AuthorProfileCard user={user} onSaved={setUser} />

      {/* ==================================================================
          ADRESSE E-MAIL
          ================================================================== */}

      <Card className={cardClass}>
        <form onSubmit={handleEmailSubmit} noValidate>
          <CardHeader className={cardHeaderClass}>
            <TitleWithInfo info={t("account.email.description")}>{t("account.email.title")}</TitleWithInfo>
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
            <TitleWithInfo info={t("account.password.description")}>{t("account.password.title")}</TitleWithInfo>
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

      {/* Récupération par e-mail : seulement si Supabase est configuré. */}
      {EMAIL_RECOVERY_ENABLED && <EmailRecoveryCard user={user} />}

      {/* Clé de secours des données de cet ordinateur (clé d'appareil). */}
      {isTauri() && <DeviceKeyBackupCard />}

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
