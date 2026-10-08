import { useState, type FormEvent } from "react";
import { CalendarDays, Mail, ShieldCheck, User as UserIcon } from "lucide-react";
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
import { validateEmail, validatePassword } from "@/lib/validators";
import { useAuthStore } from "@/stores/authStore";
import { ROLE_LABELS } from "@/types";

interface Feedback {
  kind: "success" | "error";
  text: string;
}

const errorMessage = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : fallback;

function FeedbackMessage({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) {
    return null;
  }

  return (
    <p
      role={feedback.kind === "error" ? "alert" : "status"}
      className={
        feedback.kind === "error"
          ? "text-sm text-destructive"
          : "text-sm text-success"
      }
    >
      {feedback.text}
    </p>
  );
}

/** Une information du compte, avec son icône (même présentation que l'accueil du projet). */
function InfoCell({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof UserIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 bg-card p-5">
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

    const problem = validateEmail(email);

    if (problem) {
      setEmailFeedback({ kind: "error", text: problem });
      return;
    }

    setEmailSaving(true);

    try {
      const updated = await api.updateProfile({ email: email.trim() });

      setUser(updated);
      setEmail(updated.email ?? "");
      setEmailFeedback({
        kind: "success",
        text: updated.email
          ? "Adresse e-mail mise à jour."
          : "Adresse e-mail supprimée.",
      });
    } catch (e) {
      setEmailFeedback({
        kind: "error",
        text: errorMessage(e, "Impossible de modifier l'adresse e-mail."),
      });
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
        text: "Le mot de passe actuel est requis.",
      });
      return;
    }

    const problem = validatePassword(newPassword);

    if (problem) {
      setPasswordFeedback({ kind: "error", text: problem });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordFeedback({
        kind: "error",
        text: "Les deux mots de passe ne correspondent pas.",
      });
      return;
    }

    setPasswordSaving(true);

    try {
      await api.changePassword({ currentPassword, newPassword });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordFeedback({
        kind: "success",
        text: "Mot de passe modifié.",
      });
    } catch (e) {
      setPasswordFeedback({
        kind: "error",
        text: errorMessage(e, "Impossible de modifier le mot de passe."),
      });
    } finally {
      setPasswordSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* ==================================================================
          INFORMATIONS DU COMPTE
          ================================================================== */}

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20 px-6 py-5">
          <CardTitle>Informations du compte</CardTitle>

          <CardDescription>
            Ces informations sont stockées localement, sur cet appareil.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          <div className="grid gap-px bg-border sm:grid-cols-2">
            <InfoCell icon={UserIcon} label="Nom d'utilisateur">
              {user.username}
            </InfoCell>

            <InfoCell icon={Mail} label="Adresse e-mail">
              {user.email ?? (
                <span className="font-normal text-muted-foreground">
                  Non renseignée
                </span>
              )}
            </InfoCell>

            <InfoCell icon={ShieldCheck} label="Rôle">
              <span className="inline-flex items-center rounded-md border bg-muted/40 px-2.5 py-1 text-xs font-medium">
                {ROLE_LABELS[user.role] ?? user.role}
              </span>
            </InfoCell>

            <InfoCell icon={CalendarDays} label="Compte créé le">
              {new Date(user.createdAt).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </InfoCell>
          </div>
        </CardContent>
      </Card>

      {/* ==================================================================
          ADRESSE E-MAIL
          ================================================================== */}

      <Card className="overflow-hidden">
        <form onSubmit={handleEmailSubmit} noValidate>
          <CardHeader className="border-b bg-muted/20 px-6 py-5">
            <CardTitle>Adresse e-mail</CardTitle>

            <CardDescription>
              Facultative, utilisée uniquement comme contact local. Laissez
              le champ vide pour la supprimer.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 px-6 py-6">
            <div className="max-w-md space-y-2">
              <Label htmlFor="profile-email">Adresse e-mail</Label>

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

          <CardFooter className="border-t bg-muted/10 px-6 py-4">
            <Button type="submit" disabled={emailSaving}>
              {emailSaving ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* ==================================================================
          MOT DE PASSE
          ================================================================== */}

      <Card className="overflow-hidden">
        <form onSubmit={handlePasswordSubmit}>
          <CardHeader className="border-b bg-muted/20 px-6 py-5">
            <CardTitle>Mot de passe</CardTitle>

            <CardDescription>
              Au moins 8 caractères, avec une lettre et un chiffre.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 px-6 py-6">
            <div className="max-w-md space-y-2">
              <Label htmlFor="current-password">Mot de passe actuel</Label>

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
                <Label htmlFor="new-password">Nouveau mot de passe</Label>

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
                  Confirmer le nouveau mot de passe
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

          <CardFooter className="border-t bg-muted/10 px-6 py-4">
            <Button type="submit" disabled={passwordSaving}>
              {passwordSaving ? "Modification…" : "Changer le mot de passe"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}