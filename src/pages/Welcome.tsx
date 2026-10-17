import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import ganisLogo from "@/assets/ganis-logo.png";
import { Button } from "@/components/ui/button";
import { StoryMap } from "@/components/welcome/StoryMap";
import { useAuthStore } from "@/stores/authStore";
import { useSetupStore } from "@/stores/setupStore";

/**
 * Accueil.
 *
 * - « Commencer » : sans compte, ouvre le tableau de bord de l'espace
 *   public (le guide de démarrage s'y affiche à la première visite).
 * - « Se connecter » : espace privé du compte.
 *
 * À droite, un plateau de trame en miniature (`StoryMap`) donne le ton :
 * intrigues, scènes, personnages et lieux reliés.
 */
export default function Welcome() {
  const navigate = useNavigate();
  const { t } = useTranslation("welcome");

  const user = useAuthStore((s) => s.user);
  const startGuest = useAuthStore((s) => s.startGuest);
  const needsSetup = useSetupStore((s) => s.needsSetup);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleStart = () => {
    startGuest();
    navigate("/dashboard");
  };

  /** Aucun compte encore : la connexion passe par l'assistant. */
  const handleSignIn = () => navigate(needsSetup ? "/setup" : "/login");

  return (
    <main className="relative isolate flex flex-1 items-center overflow-hidden bg-background">
      {/* Trame de points, estompée vers les bords */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_70%_65%_at_65%_50%,black,transparent)]"
        style={{
          backgroundImage:
            "radial-gradient(circle, var(--border) 1px, transparent 1.5px)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* Halo derrière l'illustration */}
      <div
        aria-hidden
        className="pointer-events-none absolute -z-10 right-[-10%] top-1/2 h-[42rem] w-[42rem] -translate-y-1/2 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--primary) 18%, transparent), transparent 65%)",
        }}
      />

      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 py-12 sm:px-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-6">
        {/* Marque, message, actions */}
        <section className="relative z-10 max-w-md">
          <div className="flex items-center gap-3">
            <img
              src={ganisLogo}
              alt=""
              className="h-11 w-11 shrink-0 object-contain"
            />
            <div className="leading-tight">
              <p className="text-lg font-semibold tracking-tight">GANIS</p>
              <p className="text-sm text-muted-foreground">{t("tagline")}</p>
            </div>
          </div>

          <h1 className="mt-10 text-[2.75rem] font-semibold leading-[1.05] tracking-[-0.03em] text-balance sm:text-6xl">
            {t("headline")}
          </h1>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" className="sm:min-w-36" onClick={handleStart}>
              {t("actions.start")}
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="bg-background/70 backdrop-blur sm:min-w-36"
              onClick={handleSignIn}
            >
              <LogIn className="mr-2 h-4 w-4" />
              {t("actions.signIn")}
            </Button>
          </div>
        </section>

        {/* Plateau de trame en miniature */}
        <div className="relative -mx-4 sm:mx-0">
          <StoryMap className="mx-auto w-full max-w-[38rem] opacity-90 lg:opacity-100" />
        </div>
      </div>
    </main>
  );
}
