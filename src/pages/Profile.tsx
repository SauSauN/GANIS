import { useState, type FormEvent } from "react";
import { StatusBar } from "@/components/layout/StatusBar";
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
  if (!feedback) return null;

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

/**
 * Page de profil : informations du compte, adresse e-mail
 * et changement de mot de passe.
 */
export default function Profile() {
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
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <main className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Profil</h1>
        <p className="text-sm text-muted-foreground">
          Informations de votre compte GANIS.
        </p>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Informations du compte</CardTitle>
            <CardDescription>
              Ces informations sont stockées localement.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3 text-sm">
            <div>
              <span className="font-medium">Nom d'utilisateur</span>
              <p className="text-muted-foreground">{user.username}</p>
            </div>

            <div>
              <span className="font-medium">Adresse e-mail</span>
              <p className="text-muted-foreground">
                {user.email ?? "Non renseignée"}
              </p>
            </div>

            <div>
              <span className="font-medium">Rôle</span>
              <p className="text-muted-foreground">
                {ROLE_LABELS[user.role] ?? user.role}
              </p>
            </div>

            <div>
              <span className="font-medium">Compte créé le</span>
              <p className="text-muted-foreground">
                {new Date(user.createdAt).toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <form onSubmit={handleEmailSubmit}>
            <CardHeader>
              <CardTitle>Adresse e-mail</CardTitle>
              <CardDescription>
                Facultative, utilisée uniquement comme contact local.
                Laissez le champ vide pour la supprimer.
              </CardDescription>
            </CardHeader>

            <CardContent className="mt-4 space-y-2">
              <Label htmlFor="profile-email">Adresse e-mail</Label>
              <Input
                id="profile-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <FeedbackMessage feedback={emailFeedback} />
            </CardContent>

            <CardFooter className="mt-4">
              <Button type="submit" disabled={emailSaving}>
                {emailSaving ? "Enregistrement…" : "Enregistrer"}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card className="mt-6">
          <form onSubmit={handlePasswordSubmit}>
            <CardHeader>
              <CardTitle>Mot de passe</CardTitle>
              <CardDescription>
                Au moins 8 caractères, avec une lettre et un chiffre.
              </CardDescription>
            </CardHeader>

            <CardContent className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">
                  Mot de passe actuel
                </Label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>

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

              <FeedbackMessage feedback={passwordFeedback} />
            </CardContent>

            <CardFooter className="mt-4">
              <Button type="submit" disabled={passwordSaving}>
                {passwordSaving
                  ? "Modification…"
                  : "Changer le mot de passe"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </main>

      <StatusBar />
    </div>
  );
}