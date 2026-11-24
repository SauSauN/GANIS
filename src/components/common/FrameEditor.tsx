import { StepperGroup } from "@/components/common/NumberStepper";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { clampFrame, frameStyle, MAX_ZOOM, NEUTRAL_FRAME, normalizeFrame, panFrame, stepZoom, wheelZoomFactor, type ImageFrame } from "@/lib/imageFrame";
import { cn } from "@/lib/utils";

/**
 * Hauteur de la zone de l'image, la même pour la vue en grand et pour le
 * cadrage : la fenêtre ne change pas de taille quand on passe de l'une à
 * l'autre.
 */
export const IMAGE_STAGE_CLASS = "h-[min(55vh,26rem)]";

/** Largeur de la fenêtre de l'image (vue en grand et cadrage). */
export const IMAGE_DIALOG_WIDTH_CLASS = "w-[min(96vw,44rem)] max-w-[min(96vw,44rem)]";

/** Ligne de commandes sous l'image : même hauteur dans les deux modes. */
export const IMAGE_ACTIONS_CLASS = "flex min-h-[3.25rem] flex-wrap items-center gap-3 border-t pt-4";

interface FrameEditorProps {
  url: string;
  frame: ImageFrame | null;
  busy?: boolean;
  onCancel: () => void;
  onSave: (frame: ImageFrame) => void;
}

/**
 * Cadrage d'une image : on fait glisser l'image dans le cadre (souris,
 * doigt ou flèches du clavier) et on règle le zoom (curseur ou molette).
 * Les aperçus montrent le résultat dans un cadre rond et en bandeau, car le
 * même cadrage vaut partout où l'image s'affiche.
 */
export function FrameEditor({ url, frame, busy = false, onCancel, onSave }: FrameEditorProps) {
  const { t } = useTranslation("common");
  const [draft, setDraft] = useState<ImageFrame>(frame ?? NEUTRAL_FRAME);
  const boxRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  /**
   * Glisser en cours : le pointeur et le cadrage au moment du clic. Chaque
   * mouvement repart de là avec la distance totale parcourue, pour que
   * l'image suive exactement le pointeur, même avec un fort zoom.
   */
  const drag = useRef<{ id: number; x: number; y: number; frame: ImageFrame } | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => setDraft(frame ?? NEUTRAL_FRAME), [frame]);

  /**
   * Déplace `from` de (dx, dy) pixels (clavier : depuis le cadrage actuel).
   * La taille de l'image est lue sur l'image elle-même au moment du geste :
   * une image déjà en mémoire peut être chargée avant que l'éditeur ne
   * guette son chargement, et le glisser ne doit pas en dépendre.
   */
  const pan = (dx: number, dy: number, from?: ImageFrame) => {
    const box = boxRef.current?.getBoundingClientRect();
    const image = imageRef.current;
    if (!box || !image || !image.naturalWidth || !image.naturalHeight) return;
    const natural = { width: image.naturalWidth, height: image.naturalHeight };
    setDraft((current) => panFrame(from ?? current, dx, dy, box, natural));
  };

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    // Clic gauche (ou doigt) seulement ; pas de sélection de texte pendant le glisser.
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, frame: draftRef.current };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.id !== event.pointerId) return;
    pan(event.clientX - start.x, event.clientY - start.y, start.frame);
  }

  /*
   * Molette, défilement et pincement au pavé tactile. Écouteur posé
   * directement sur le cadre et « non passif » : il peut empêcher la page
   * de zoomer ou de défiler à la place de l'image (React, lui, écoute la
   * molette en mode passif et ne le peut pas).
   */
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      // Zoom pendant un glisser : le glisser repart du nouveau cadrage.
      if (drag.current) drag.current = { ...drag.current, x: event.clientX, y: event.clientY, frame: draftRef.current };
      const factor = wheelZoomFactor(event.deltaY, event.deltaMode, event.ctrlKey);
      setDraft((current) => clampFrame({ ...current, zoom: current.zoom * factor }));
    };
    box.addEventListener("wheel", onWheel, { passive: false });
    return () => box.removeEventListener("wheel", onWheel);
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 40 : 10;
    // La flèche déplace l'image dans son sens (← : l'image part à gauche).
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      pan(move[0], move[1]);
    } else if (event.key === "+" || event.key === "-") {
      event.preventDefault();
      setDraft((current) => clampFrame({ ...current, zoom: current.zoom + (event.key === "+" ? 0.1 : -0.1) }));
    }
  }

  const style = frameStyle(draft);
  const image = (className: string) => <img src={url} alt="" draggable={false} className={cn("size-full object-cover select-none", className)} style={style} />;

  return (
    <div className="space-y-4">
      {/* Le cadre carré occupe toute la hauteur de la zone de l'image ; les aperçus à côté. */}
      <div className={cn("flex items-start justify-center gap-5", IMAGE_STAGE_CLASS)}>
        <div
          ref={boxRef}
          role="application"
          tabIndex={0}
          aria-label={t("image.frameTitle")}
          data-testid="frame-editor"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onKeyDown={onKeyDown}
          className="relative aspect-square h-full max-w-full shrink cursor-grab touch-none overflow-hidden select-none rounded-lg bg-muted ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        >
          <img
            ref={imageRef}
            src={url}
            alt=""
            draggable={false}
            className="pointer-events-none size-full object-cover select-none"
            style={style}
          />
          {/* Repères des tiers, pour placer un visage ou un sujet. */}
          <span className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} className="border-white/25 [&:nth-child(-n+6)]:border-b [&:not(:nth-child(3n))]:border-r" />
            ))}
          </span>
        </div>

        <div className="hidden shrink-0 space-y-2 sm:block">
          <p className="text-xs font-medium text-muted-foreground">{t("image.preview")}</p>
          <span className="block size-20 overflow-hidden rounded-full ring-1 ring-border">{image("")}</span>
          <span className="block h-14 w-40 overflow-hidden rounded-md ring-1 ring-border">{image("")}</span>
          <span className="block size-10 overflow-hidden rounded-md ring-1 ring-border">{image("")}</span>
        </div>
      </div>

      {/* Une seule ligne de commandes, comme dans la vue en grand : la fenêtre
          garde la même taille dans les deux modes. */}
      <div className={IMAGE_ACTIONS_CLASS}>
        {/* Zoom : − / pourcentage / +. Un clic sur le pourcentage revient à 100 %. */}
        <StepperGroup
          label={t("image.zoom")}
          minusLabel={t("image.zoomOut")}
          plusLabel={t("image.zoomIn")}
          minusDisabled={draft.zoom <= 1 + 1e-6}
          plusDisabled={draft.zoom >= MAX_ZOOM - 1e-6}
          onMinus={() => setDraft((current) => clampFrame({ ...current, zoom: stepZoom(current.zoom, -1) }))}
          onPlus={() => setDraft((current) => clampFrame({ ...current, zoom: stepZoom(current.zoom, 1) }))}
        >
          <button
            type="button"
            aria-label={t("image.zoomReset", { value: Math.round(draft.zoom * 100) })}
            title={t("image.zoomResetHint")}
            onClick={() => setDraft((current) => clampFrame({ ...current, zoom: 1 }))}
            className="h-full w-full px-2 tabular-nums hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            data-testid="zoom-value"
          >
            {t("image.percent", { value: Math.round(draft.zoom * 100) })}
          </button>
        </StepperGroup>
        <span className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(NEUTRAL_FRAME)}>
          <RotateCcw />
          {t("image.reset")}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          {t("actions.cancel")}
        </Button>
        <Button type="button" disabled={busy} onClick={() => onSave(normalizeFrame(draft))}>
          {t("actions.save")}
        </Button>
      </div>
    </div>
  );
}
