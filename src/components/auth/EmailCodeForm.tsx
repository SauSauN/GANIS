import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EMAIL_CODE_LENGTH,
  EmailRecoveryError,
  isEmailCodeComplete,
  normalizeEmailCode,
  sendEmailCode,
  verifyEmailCode,
  type EmailRecoveryIssue,
} from "@/lib/emailRecovery";

/** Délai avant de pouvoir redemander un code. */
const RESEND_DELAY_S = 60;

/**
 * Envoie un code à 6 chiffres à `email` dès l'affichage, puis le fait
 * saisir. `onVerified` reçoit l'identifiant Supabase de l'adresse.
 *
 * Formulaire autonome : à ne pas placer dans un autre `<form>`.
 */
export function EmailCodeForm({
  email,
  createUser,
  onVerified,
  onBack,
}: {
  email: string;
  /** Vrai à l'activation ; faux pour un mot de passe oublié. */
  createUser: boolean;
  onVerified: (supabaseUserId: string) => void | Promise<void>;
  onBack: () => void;
}) {
  const { t } = useTranslation("recovery");
  const [code, setCode] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [issue, setIssue] = useState<EmailRecoveryIssue | "codeFormat" | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const sentOnce = useRef(false);

  async function send() {
    setSending(true);
    setIssue(null);
    try {
      await sendEmailCode(email, createUser);
      setCooldown(RESEND_DELAY_S);
    } catch (e) {
      setIssue(e instanceof EmailRecoveryError ? e.issue : "network");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (sentOnce.current) return;
    sentOnce.current = true;
    void send();
    // Envoi unique à l'affichage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (!isEmailCodeComplete(code)) {
      setIssue("codeFormat");
      return;
    }

    setVerifying(true);
    setIssue(null);
    try {
      const supabaseUserId = await verifyEmailCode(email, code);
      await onVerified(supabaseUserId);
    } catch (e) {
      setIssue(e instanceof EmailRecoveryError ? e.issue : "network");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t("email.code.sentTo", { email: email.trim() })}
      </p>

      <div className="space-y-2">
        <Label htmlFor="email-code">{t("email.code.label")}</Label>
        <Input
          id="email-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={EMAIL_CODE_LENGTH + 2}
          placeholder={"0".repeat(EMAIL_CODE_LENGTH)}
          className="font-mono text-lg tracking-[0.4em]"
          value={code}
          onChange={(e) => setCode(normalizeEmailCode(e.target.value))}
        />
        <p className="text-xs text-muted-foreground">{t("email.code.hint")}</p>
      </div>

      {issue && (
        <p role="alert" className="text-sm text-destructive">
          {t(`email.errors.${issue}`)}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit" className="w-full" disabled={verifying || sending}>
          {verifying ? t("email.code.verifying") : t("email.code.verify")}
        </Button>

        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            {t("email.code.back")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={sending || cooldown > 0}
            onClick={() => void send()}
          >
            {sending
              ? t("email.code.sending")
              : cooldown > 0
                ? t("email.code.resendIn", { seconds: cooldown })
                : t("email.code.resend")}
          </Button>
        </div>
      </div>
    </form>
  );
}
