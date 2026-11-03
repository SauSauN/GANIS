import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SameWidth } from "@/components/common/SameWidth";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { featureAvailable, findFeature } from "@/components/workspace/modules";
import { templateForProjectType } from "@/lib/structure";
import { TUTORIALS, tutorialText as text, useTutorialStore } from "@/lib/tutorials";
import { cn } from "@/lib/utils";
import type { ProjectType } from "@/types";

interface TutorialDialogProps {
  projectType: ProjectType;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Tutoriel d'un type de projet ou d'un module (voir `lib/tutorials.ts`) :
 * les étapes une à une ; une étape peut ouvrir la fonctionnalité dont elle
 * parle, et le tutoriel se reprend ensuite à la même étape.
 */
export function TutorialDialog({ projectType, onOpenFeature }: TutorialDialogProps) {
  const { t } = useTranslation(["structure", "projects"]);
  const id = useTutorialStore((state) => state.open);
  const startStep = useTutorialStore((state) => state.step);
  const pause = useTutorialStore((state) => state.pause);
  const close = useTutorialStore((state) => state.close);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (id) setStep(startStep);
  }, [id, startStep]);

  const tutorial = id ? TUTORIALS[id] : null;
  const current = tutorial?.steps[step] ?? tutorial?.steps[0];
  if (!id || !tutorial || !current) return null;

  const last = step === tutorial.steps.length - 1;

  // Noms du découpage de ce type de projet : « Actes, séquences, scènes ».
  const template = templateForProjectType(projectType);
  const [first, ...others] = (["0", "1", "2"] as const).map((level) => t(`structure:templates.${template}.levels.${level}.other`));
  const options = {
    levels: [first, ...others.map((name) => name.toLowerCase())].join(", "),
    type: t(`projects:types.${projectType}`),
  };

  const title = text(`${id}.title`, options);

  return (
    <Dialog open onOpenChange={(value) => !value && close()} className="max-w-3xl" guardInput={false}>
      <DialogHeader>
        <p className="text-xs font-medium text-primary">{text("progress", { current: step + 1, total: tutorial.steps.length })}</p>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{text(`${id}.intro`, options)}</DialogDescription>
      </DialogHeader>

      {/* Toutes les étapes dans la même case, une seule visible : la fenêtre
          garde la hauteur de la plus longue, et les boutons ne bougent pas. */}
      <div className="mt-5 grid rounded-lg border bg-muted/30">
        {tutorial.steps.map(({ id: stepId, icon: Icon, open }, index) => {
          const stepKey = `${id}.steps.${stepId}`;
          const points = text<unknown>(`${stepKey}.points`, { ...options, returnObjects: true });
          const pointList = Array.isArray(points) ? (points as string[]) : [];
          const feature = open && featureAvailable(open, projectType) ? findFeature(open)?.feature : undefined;
          return (
            <div
              key={stepId}
              aria-hidden={index !== step}
              className={cn("col-start-1 row-start-1 flex gap-4 p-5", index !== step && "invisible")}
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 space-y-3">
                <h3 className="font-semibold">{text(`${stepKey}.title`, options)}</h3>
                <p className="text-sm leading-6 text-muted-foreground">{text(`${stepKey}.text`, options)}</p>

                {pointList.length > 0 && (
                  <ul className="space-y-1.5">
                    {pointList.map((point) => (
                      <li key={point} className="flex gap-2 text-sm leading-6">
                        <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {feature && open && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      pause(step);
                      onOpenFeature(open);
                    }}
                  >
                    {text("open", { feature: feature.label })}
                    <ArrowUpRight className="ml-1 size-3.5" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Points de progression : un clic va directement à l'étape. */}
      <div className="mt-4 flex justify-center gap-1" role="tablist" aria-label={title}>
        {tutorial.steps.map((item, index) => {
          const label = text(`${id}.steps.${item.id}.title`, options);
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={index === step}
              aria-label={label}
              title={label}
              onClick={() => setStep(index)}
              className="flex size-6 items-center justify-center"
            >
              <span className={cn("size-2 rounded-full bg-muted-foreground/30 transition-all", index === step && "w-5 bg-primary")} />
            </button>
          );
        })}
      </div>

      <DialogFooter className="mt-6 gap-2">
        <Button variant="ghost" onClick={close}>
          {text("close")}
        </Button>
        <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>
          <ChevronLeft className="mr-1 size-4" />
          {text("previous")}
        </Button>
        <Button onClick={() => (last ? close() : setStep(step + 1))}>
          <SameWidth
            active={last ? 1 : 0}
            labels={[
              <>
                {text("next")}
                <ChevronRight className="ml-1 size-4" />
              </>,
              text("finish"),
            ]}
          />
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
