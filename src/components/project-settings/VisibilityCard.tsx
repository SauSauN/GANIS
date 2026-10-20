import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Globe, Lock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/authStore";
import { usePendingVisibility } from "@/stores/pendingVisibilityStore";
import { useProjectStore } from "@/stores/projectStore";
import { useSetupStore } from "@/stores/setupStore";
import { toast } from "@/stores/toastStore";
import type { Project } from "@/types";
import { errorText } from "@/lib/errors";

interface VisibilityCardProps {
  project: Project;
  /** Classes des cartes du panneau des paramètres (même apparence). */
  cardClass: string;
  cardHeaderClass: string;
}

/**
 * Visibilité du projet (paramètres → « Statut et organisation »).
 *
 * - Public → privé : connecté, le changement est immédiat ; sans
 *   connexion, une connexion est demandée d'abord, puis le projet est
 *   rendu privé dans la foulée.
 * - Privé → public : confirmation explicite (« Annuler » / « Rendre
 *   public ») ; rien ne change si on annule.
 *
 * Rust vérifie la session et le propriétaire ; le store est mis à jour
 * avec la réponse, si bien que les listes de chaque espace suivent aussitôt.
 */
export function VisibilityCard({
  project,
  cardClass,
  cardHeaderClass,
}: VisibilityCardProps) {
  const { t } = useTranslation(["projectSettings", "projects", "common"]);
  const signedIn = useAuthStore((state) => state.user !== null);
  const setVisibility = useProjectStore((state) => state.setVisibility);

  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPublic = project.visibility === "public";
  const Icon = isPublic ? Globe : Lock;

  async function apply(target: Project["visibility"]) {
    setBusy(true);
    setError(null);

    try {
      const updated = await setVisibility(project.id, target);
      toast({
        tone: "success",
        message: t(
          target === "private"
            ? "projects:visibility.madePrivate"
            : "projects:visibility.madePublic",
          { name: updated.name },
        ),
      });
    } catch (e) {
      setError(errorText(e, "projectSettings:visibility.failed"));
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  function handleClick() {
    if (!isPublic) {
      setConfirmOpen(true);
    } else if (signedIn) {
      void apply("private");
    } else {
      setSignInOpen(true);
    }
  }

  return (
    <Card className={cardClass}>
      <CardHeader className={cardHeaderClass}>
        <CardTitle>{t("visibility.title")}</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-wrap items-center gap-4 px-6 py-6">
        <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium">
          <Icon className="h-4 w-4" />
          {t(`projects:visibility.${project.visibility}`)}
        </span>

        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={handleClick}
        >
          {isPublic ? (
            <Lock className="mr-2 h-4 w-4" />
          ) : (
            <Globe className="mr-2 h-4 w-4" />
          )}
          {isPublic ? t("visibility.makePrivate") : t("visibility.makePublic")}
        </Button>

        {error && (
          <p role="alert" className="w-full text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>

      {/* Confirmation : privé → public */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!busy) setConfirmOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("visibility.confirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("visibility.confirmDescription")}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-6 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmOpen(false)}
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => void apply("public")}
            >
              <Globe className="mr-2 h-4 w-4" />
              {t("visibility.makePublic")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sans connexion : public → privé demande de se connecter */}
      <SignInToMakePrivate
        project={project}
        open={signInOpen}
        onOpenChange={setSignInOpen}
      />
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Connexion pour rendre privé
// ----------------------------------------------------------------------------

function SignInToMakePrivate({
  project,
  open,
  onOpenChange,
}: {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(["projectSettings", "login", "projects", "common"]);
  const navigate = useNavigate();

  const login = useAuthStore((state) => state.login);
  const authError = useAuthStore((state) => state.error);
  const clearError = useAuthStore((state) => state.clearError);
  const needsSetup = useSetupStore((state) => state.needsSetup);
  const setVisibility = useProjectStore((state) => state.setVisibility);
  const requestPending = usePendingVisibility((state) => state.request);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function close() {
    if (busy) return;
    setPassword("");
    setLocalError(null);
    clearError();
    onOpenChange(false);
  }

  /**
   * La connexion se termine ailleurs (création de compte, configuration
   * initiale, clé de récupération) : le tableau de bord rendra le projet
   * privé à l'arrivée du compte.
   */
  function continueElsewhere(path: string) {
    requestPending(project.id);
    onOpenChange(false);
    navigate(path);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);

    if (!username.trim()) {
      setLocalError(t("login:errors.usernameRequired"));
      return;
    }
    if (!password) {
      setLocalError(t("login:errors.passwordRequired"));
      return;
    }

    setBusy(true);

    // Le projet reste ouvert pendant la connexion.
    const ok = await login(username.trim(), password, { keepWorkspace: true });

    if (!ok) {
      setBusy(false);
      return;
    }

    setPassword("");

    // Compte tout juste chiffré : sa clé de récupération doit d'abord être
    // notée (page de connexion), le changement suivra.
    if (useAuthStore.getState().pendingRecoveryKey) {
      setBusy(false);
      continueElsewhere("/login");
      return;
    }

    try {
      const updated = await setVisibility(project.id, "private");
      toast({
        tone: "success",
        message: t("projects:visibility.madePrivate", { name: updated.name }),
      });
      setBusy(false);
      onOpenChange(false);
    } catch (e) {
      // Connecté, mais le changement a échoué : le message reste affiché,
      // le bouton « Rendre privé » de la carte permet de réessayer.
      setLocalError(errorText(e, "projectSettings:visibility.failed"));
      setBusy(false);
    }
  }

  const shownError = localError ?? authError;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("visibility.signIn.title")}</DialogTitle>
          <DialogDescription>{t("visibility.signIn.description")}</DialogDescription>
        </DialogHeader>

        {needsSetup ? (
          <DialogFooter className="mt-6 gap-2">
            <Button type="button" variant="outline" onClick={close}>
              {t("common:actions.cancel")}
            </Button>
            <Button type="button" onClick={() => continueElsewhere("/setup")}>
              {t("visibility.signIn.setupFirst")}
            </Button>
          </DialogFooter>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="visibility-username">{t("login:username")}</Label>
              <Input
                id="visibility-username"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="visibility-password">{t("login:password")}</Label>
              <Input
                id="visibility-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {shownError && (
              <p role="alert" className="text-sm text-destructive">
                {shownError}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              <LogIn className="mr-2 h-4 w-4" />
              {busy
                ? t("visibility.signIn.submitting")
                : t("visibility.signIn.submit")}
            </Button>

            <div className="flex items-center justify-between gap-2 text-sm">
              <button
                type="button"
                onClick={close}
                disabled={busy}
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("common:actions.cancel")}
              </button>
              <button
                type="button"
                onClick={() => continueElsewhere("/register")}
                disabled={busy}
                className="font-medium underline-offset-4 hover:underline"
              >
                {t("visibility.signIn.createAccount")}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}