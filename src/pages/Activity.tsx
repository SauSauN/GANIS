import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { StatusBar } from "@/components/layout/StatusBar";
import { WorkCalendarCard } from "@/components/projects/WorkCalendarCard";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/stores/projectStore";

/**
 * Page « Rythme de travail », ouverte depuis le bouton de la barre du haut
 * (visible sur le tableau de bord). « Retour » (ou Échap) ramène au
 * tableau de bord.
 */
export default function Activity() {
  const { t } = useTranslation("workCalendar");
  const navigate = useNavigate();
  const projects = useProjectStore((state) => state.projects);
  const fetchProjects = useProjectStore((state) => state.fetchProjects);

  // Liste des projets (noms dans le choix du projet), si la page est ouverte directement.
  useEffect(() => {
    if (projects.length === 0) void fetchProjects();
  }, [projects.length, fetchProjects]);

  const back = () => navigate("/dashboard");

  // Échap : retour, sauf si une fenêtre ou un champ a déjà pris la touche.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector('[role="dialog"]')) return;
      back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-6 py-8">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
              <p className="text-sm text-muted-foreground">{t("pageSubtitle")}</p>
            </div>
            <Button variant="outline" onClick={back} title={t("backHint")}>
              <ArrowLeft />
              {t("back")}
            </Button>
          </header>

          <WorkCalendarCard projects={projects} expanded />
        </div>
      </main>

      <StatusBar />
    </div>
  );
}
