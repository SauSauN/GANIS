import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { useIdleLock } from "@/lib/preferences";
import { saveEntries, useUnsavedStore } from "@/lib/unsavedChanges";
import { useAuthStore } from "@/stores/authStore";
import { usePlotStore } from "@/stores/plotStore";

/** Gestes qui comptent comme une activité. */
const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

/** Intervalle de vérification de l'inactivité (ms). */
const CHECK_EVERY = 15_000;

/**
 * Verrouillage après une période d'inactivité (Paramètres › Compte).
 *
 * Désactivé par défaut. Une fois le délai écoulé sans aucun geste :
 * 1. les modifications en attente sont enregistrées ;
 * 2. la session Rust est fermée : la clé du compte est effacée de la
 *    mémoire, plus aucune donnée chiffrée n'est lisible ;
 * 3. un écran de verrouillage recouvre l'application, qui reste en place
 *    (onglets, saisies en cours) derrière lui, inerte.
 *
 * Le mot de passe rouvre la session et l'on reprend là où l'on en était.
 * « Se déconnecter » ramène à l'accueil.
 */
export function IdleLock() {
  const { t } = useTranslation(["settings", "common"]);
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const minutes = useIdleLock();

  /** Nom du compte verrouillé ; `null` tant que l'application est ouverte. */
  const [locked, setLocked] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastActivity = useRef(Date.now());
  const locking = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Suivi de l'activité et déclenchement du verrouillage.
  useEffect(() => {
    if (!user || minutes === 0 || locked) return;

    const touch = () => {
      lastActivity.current = Date.now();
    };
    touch();

    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, touch, { capture: true, passive: true });
    }

    const timer = window.setInterval(() => {
      if (locking.current || Date.now() - lastActivity.current < minutes * 60_000) return;
      void lock(user.username);
    }, CHECK_EVERY);

    return () => {
      window.clearInterval(timer);
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, touch, { capture: true });
      }
    };
    // `lock` ne dépend que de valeurs stables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, minutes, locked]);

  // Pendant le verrouillage, l'application derrière l'écran est inerte
  // (ni clic, ni clavier, ni lecteur d'écran).
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root || !locked) return;

    root.inert = true;
    inputRef.current?.focus();

    return () => {
      root.inert = false;
    };
  }, [locked]);

  // Déconnexion depuis ailleurs : plus rien à déverrouiller.
  useEffect(() => {
    if (!user) setLocked(null);
  }, [user]);

  async function lock(username: string) {
    locking.current = true;

    try {
      // Dernières modifications enregistrées tant que la clé est là.
      await saveEntries(Object.keys(useUnsavedStore.getState().entries));
      await usePlotStore.getState().flush();
    } catch {
      /* elles restent en mémoire et repartiront après le déverrouillage */
    }

    try {
      await api.logout();
    } catch {
      /* la session est fermée côté interface dans tous les cas */
    }

    setPassword("");
    setError(null);
    setLocked(username);
    locking.current = false;
  }

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (!locked || busy) return;

    if (!password) {
      setError(t("lock.passwordRequired"));
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await api.login({ username: locked, password });
      setLocked(null);
      setPassword("");
      lastActivity.current = Date.now();
    } catch (e) {
      setError(errorText(e, "settings:lock.failed"));
      setPassword("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setLocked(null);
    await logout();
    navigate("/", { replace: true });
  }

  if (!locked) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-lock-title"
      aria-describedby="idle-lock-description"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-4 backdrop-blur-md"
    >
      <form
        onSubmit={(event) => void unlock(event)}
        className="w-full max-w-sm space-y-5 rounded-xl border bg-card p-6 shadow-xl"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-secondary">
            <Lock className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="idle-lock-title" className="text-lg font-semibold">
              {t("lock.title")}
            </h2>
            <p id="idle-lock-description" className="text-sm text-muted-foreground">
              {t("lock.description", { name: locked })}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="idle-lock-password">{t("lock.password")}</Label>
          <Input
            ref={inputRef}
            id="idle-lock-password"
            type="password"
            placeholder={t("common:placeholders.password")}
            autoComplete="current-password"
            value={password}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "idle-lock-error" : undefined}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p id="idle-lock-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? t("lock.unlocking") : t("lock.unlock")}
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void signOut()}>
            {t("lock.signOut")}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
