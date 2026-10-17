import { useTranslation } from "react-i18next";
import {
  Check,
  Compass,
  FileUp,
  ListTree,
  Lock,
  Plus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectSpace } from "@/lib/projectSpace";
import {
  GUIDE_STEPS,
  closeGuide,
  markGuideStep,
  type GuideStepId,
} from "@/lib/startGuide";
import { cn } from "@/lib/utils";

interface StartGuideProps {
  /** Clé de l'état du guide (voir `guideKey`). */
  storageKey: string;
  space: ProjectSpace;
  /** Étapes déjà faites (enregistrées, ou déduites des projets). */
  done: GuideStepId[];
  /** Vrai s'il existe un projet où ajouter personnages et découpage. */
  hasProject: boolean;
  onCreateProject: () => void;
  /** Ouvre le projet le plus récent sur un onglet (`characters.create`…). */
  onOpenInProject: (tabId: string) => void;
  /** Espace privé : import d'un `.ganix`. */
  onImport: () => void;
  /** Espace public : connexion pour créer des projets privés. */
  onSignIn: () => void;
}

interface StepView {
  id: GuideStepId;
  icon: LucideIcon;
  /** Clé de texte : `guide.steps.<key>`. */
  key: "create" | "universe" | "story" | "import" | "signIn";
  run: () => void;
  needsProject?: boolean;
}

/**
 * Guide de démarrage intégré au tableau de bord.
 *
 * Quatre étapes courtes, chacune avec son action directe. Il ne bloque
 * rien : le tableau de bord reste utilisable dessous, et le guide se ferme
 * d'un clic (« Ignorer », puis « Terminer » une fois tout fait).
 */
export function StartGuide({
  storageKey,
  space,
  done,
  hasProject,
  onCreateProject,
  onOpenInProject,
  onImport,
  onSignIn,
}: StartGuideProps) {
  const { t } = useTranslation("dashboard");

  /** Lance l'action d'une étape et la marque comme faite. */
  const act = (step: GuideStepId, run: () => void) => () => {
    markGuideStep(storageKey, step);
    run();
  };

  const steps: StepView[] = [
    { id: "create", icon: Plus, key: "create", run: onCreateProject },
    {
      id: "universe",
      icon: Users,
      key: "universe",
      run: () => onOpenInProject("characters.create"),
      needsProject: true,
    },
    {
      id: "story",
      icon: ListTree,
      key: "story",
      run: () => onOpenInProject("structure.plan"),
      needsProject: true,
    },
    space === "private"
      ? { id: "extra", icon: FileUp, key: "import", run: onImport }
      : { id: "extra", icon: Lock, key: "signIn", run: onSignIn },
  ];

  const doneCount = GUIDE_STEPS.filter((step) => done.includes(step)).length;
  const finished = doneCount === GUIDE_STEPS.length;

  return (
    <section
      aria-labelledby="start-guide-title"
      className="relative mt-6 overflow-hidden rounded-xl border bg-card"
    >
      {/* Liseré d'accent, discret */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 bg-linear-to-r from-primary/70 via-primary/30 to-transparent"
      />

      <header className="flex items-center justify-between gap-3 px-5 pt-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Compass className="h-4 w-4" />
          </span>
          <h2 id="start-guide-title" className="font-semibold">
            {t("guide.title")}
          </h2>
          <span
            className="rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums text-muted-foreground"
            aria-label={t("guide.progress", { done: doneCount, total: GUIDE_STEPS.length })}
          >
            {doneCount}/{GUIDE_STEPS.length}
          </span>
        </div>

        {finished ? (
          <Button size="sm" onClick={() => closeGuide(storageKey)}>
            <Check className="mr-1.5 h-4 w-4" />
            {t("guide.finish")}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => closeGuide(storageKey)}
          >
            <X className="mr-1.5 h-4 w-4" />
            {t("guide.skip")}
          </Button>
        )}
      </header>

      <ol className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => {
          const isDone = done.includes(step.id);
          const blocked = step.needsProject && !hasProject;
          const Icon = step.icon;

          return (
            <li
              key={step.id}
              className={cn(
                "flex flex-col rounded-lg border bg-background/60 p-4 transition-colors",
                isDone && "border-success/40 bg-success/5",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-md",
                    isDone
                      ? "bg-success/15 text-success"
                      : "bg-secondary text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>

                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium tabular-nums",
                    isDone
                      ? "bg-success text-white"
                      : "border text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {isDone ? <Check className="h-3 w-3" /> : index + 1}
                </span>
              </div>

              <h3 className="mt-3 text-sm font-medium">
                {t(`guide.steps.${step.key}.title`)}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t(`guide.steps.${step.key}.hint`)}
              </p>

              <Button
                size="sm"
                variant={isDone ? "ghost" : "outline"}
                className="mt-4 self-start"
                disabled={blocked}
                title={blocked ? t("guide.needsProject") : undefined}
                onClick={act(step.id, step.run)}
              >
                {t(`guide.steps.${step.key}.action`)}
              </Button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
