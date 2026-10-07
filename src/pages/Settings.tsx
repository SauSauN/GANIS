import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  Palette,
  ShieldCheck,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import { StatusBar } from "@/components/layout/StatusBar";
import { AccountSection } from "@/components/settings/AccountSection";
import { AppearanceSection } from "@/components/settings/AppearanceSection";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";

type SectionId = "account" | "appearance";

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon }[] = [
  { id: "account", label: "Compte", icon: UserIcon },
  { id: "appearance", label: "Apparence", icon: Palette },
];

const navItemClass = (selected: boolean) =>
  cn(
    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
    selected
      ? "bg-accent font-medium text-accent-foreground"
      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
  );

function isSectionId(value: string | null): value is SectionId {
  return SECTIONS.some((section) => section.id === value);
}

/**
 * Page des paramètres généraux.
 *
 * La section affichée est pilotée par l'adresse (`?section=appearance`),
 * ce qui permet d'y accéder directement depuis un autre écran.
 */
export default function Settings() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);

  const requested = params.get("section");
  const section: SectionId = isSectionId(requested) ? requested : "account";

  const canDiagnose = user?.role === "admin" || user?.role === "developer";
  const isAdmin = user?.role === "admin";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Paramètres généraux
            </h1>
            <p className="text-sm text-muted-foreground">
              Votre compte et l'apparence de GANIS, valables pour tous
              vos projets. Les réglages d'un projet se trouvent dans son
              espace de travail.
            </p>
          </div>

          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
          <nav aria-label="Sections des paramètres" className="space-y-1">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-current={section === id ? "page" : undefined}
                onClick={() => setParams({ section: id }, { replace: true })}
                className={navItemClass(section === id)}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}

            {(isAdmin || canDiagnose) && (
              <>
                <p className="px-3 pb-1 pt-4 text-xs uppercase tracking-wide text-muted-foreground">
                  Outils
                </p>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => navigate("/admin")}
                    className={navItemClass(false)}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Administration
                  </button>
                )}

                {canDiagnose && (
                  <button
                    type="button"
                    onClick={() => navigate("/diagnostics")}
                    className={navItemClass(false)}
                  >
                    <Activity className="h-4 w-4" />
                    Diagnostics
                  </button>
                )}
              </>
            )}
          </nav>

          <section aria-live="polite">
            {section === "account" && <AccountSection />}
            {section === "appearance" && <AppearanceSection />}
          </section>
        </div>
      </main>

      <StatusBar />
    </div>
  );
}