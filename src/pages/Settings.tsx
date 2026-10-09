import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Palette,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import { StatusBar } from "@/components/layout/StatusBar";
import { AccountSection } from "@/components/settings/AccountSection";
import { AppearanceSection } from "@/components/settings/AppearanceSection";
import { Button } from "@/components/ui/button";
import { clampPanelWidth, usePanelWidth } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";

type SectionId = "account" | "appearance";

/** Sections, dans l'ordre du menu (libellés dans `settings.json`). */
const SECTIONS: { id: SectionId; icon: LucideIcon }[] = [
  { id: "account", icon: UserIcon },
  { id: "appearance", icon: Palette },
];

/** Entrée du menu : même style que le panneau latéral de l'espace de travail. */
const navItemClass = (selected: boolean) =>
  cn(
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent",
    selected && "bg-sidebar-accent font-medium",
  );

function isSectionId(value: string | null): value is SectionId {
  return SECTIONS.some((section) => section.id === value);
}

/**
 * Page des paramètres généraux.
 *
 * Reprend la direction artistique de l'espace de travail, sans en être
 * une vue : pas de barre d'activité ni d'onglets.
 * - à gauche, un panneau identique au panneau des fonctionnalités
 *   (`bg-sidebar`, même largeur que celle choisie dans l'espace de travail) ;
 * - au centre, la même mise en page que les paramètres du projet :
 *   grand titre, description, puis cartes.
 *
 * La section affichée est pilotée par l'adresse (`?section=appearance`),
 * ce qui permet d'y accéder directement depuis un autre écran.
 */
export default function Settings() {
  const navigate = useNavigate();
  const { t } = useTranslation("settings");
  const [params, setParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const panelWidth = clampPanelWidth(usePanelWidth());

  const requested = params.get("section");
  const section: SectionId = isSectionId(requested) ? requested : "account";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex min-h-0 flex-1">
        {/* =========================================================
            PANNEAU DE GAUCHE (sections)
            ========================================================= */}
        <aside
          aria-label={t("nav.label")}
          style={{ width: panelWidth }}
          className="flex shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
        >
          <div className="px-4 py-3">
            <p className="text-xs text-muted-foreground">{t("nav.title")}</p>
            <p className="truncate text-sm font-semibold">
              {user?.username}
            </p>
          </div>

          <ul className="px-2">
            {SECTIONS.map(({ id, icon: Icon }) => (
              <li key={id}>
                <button
                  type="button"
                  aria-current={section === id ? "page" : undefined}
                  onClick={() => setParams({ section: id }, { replace: true })}
                  className={navItemClass(section === id)}
                >
                  <Icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="flex-1 truncate text-left">
                    {t(`sections.${id}.label`)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* =========================================================
            ZONE CENTRALE
            ========================================================= */}
        <main className="flex min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-6 py-8 pb-24 lg:px-10">
            <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-3xl font-semibold tracking-tight">
                  {t(`sections.${section}.label`)}
                </h1>

                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {t(`sections.${section}.description`)}
                </p>
              </div>

              <Button variant="outline" onClick={() => navigate(-1)}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t("back")}
              </Button>
            </header>

            <section aria-live="polite" className="min-w-0">
              {section === "account" && <AccountSection />}
              {section === "appearance" && <AppearanceSection />}
            </section>
          </div>
        </main>
      </div>

      <StatusBar />
    </div>
  );
}
