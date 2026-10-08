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

interface SectionMeta {
  id: SectionId;
  label: string;
  description: string;
  icon: LucideIcon;
}

const SECTIONS: SectionMeta[] = [
  {
    id: "account",
    label: "Compte",
    description:
      "Vos informations, votre adresse e-mail et votre mot de passe.",
    icon: UserIcon,
  },
  {
    id: "appearance",
    label: "Apparence",
    description:
      "Thème et taille du texte de GANIS, valables pour tous vos projets.",
    icon: Palette,
  },
];

/** Style d'une entrée du menu, identique à celui des listes de l'espace de travail. */
const navItemClass = (selected: boolean) =>
  cn(
    "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-left text-sm transition-colors md:w-full",
    selected
      ? "bg-accent font-medium text-foreground"
      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
  );

function isSectionId(value: string | null): value is SectionId {
  return SECTIONS.some((section) => section.id === value);
}

/**
 * Page des paramètres généraux.
 *
 * Même structure que les vues de l'espace de travail : fil d'Ariane,
 * grand titre, description, puis cartes. Le conteneur qui défile occupe
 * toute la largeur de la fenêtre (la barre de défilement se place donc
 * tout à droite) ; seule la colonne de contenu est centrée.
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

  const meta = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];

  const canDiagnose = user?.role === "admin" || user?.role === "developer";
  const isAdmin = user?.role === "admin";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-8 pb-24 lg:px-10">
          {/* ================================================================
              EN-TÊTE
              ================================================================ */}

          <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                <span>Application</span>
                <span>/</span>
                <span>Paramètres généraux</span>
              </div>

              <h1 className="text-3xl font-semibold tracking-tight">
                {meta.label}
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {meta.description}
              </p>
            </div>

            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Button>
          </header>

          {/* ================================================================
              MENU + CONTENU
              ================================================================ */}

          <div className="grid gap-8 md:grid-cols-[14rem_minmax(0,1fr)]">
            <nav
              aria-label="Sections des paramètres"
              className="flex gap-1 overflow-x-auto md:sticky md:top-8 md:flex-col md:self-start md:overflow-visible"
            >
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-current={section === id ? "page" : undefined}
                  onClick={() =>
                    setParams({ section: id }, { replace: true })
                  }
                  className={navItemClass(section === id)}
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  {label}
                </button>
              ))}

              {(isAdmin || canDiagnose) && (
                <>
                  <p className="hidden px-2 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground md:block">
                    Outils
                  </p>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => navigate("/admin")}
                      className={navItemClass(false)}
                    >
                      <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                      Administration
                    </button>
                  )}

                  {canDiagnose && (
                    <button
                      type="button"
                      onClick={() => navigate("/diagnostics")}
                      className={navItemClass(false)}
                    >
                      <Activity className="h-4 w-4 shrink-0 text-primary" />
                      Diagnostics
                    </button>
                  )}
                </>
              )}
            </nav>

            <section aria-live="polite" className="min-w-0">
              {section === "account" && <AccountSection />}
              {section === "appearance" && <AppearanceSection />}
            </section>
          </div>
        </div>
      </main>

      <StatusBar />
    </div>
  );
}