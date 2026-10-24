import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { GripHorizontal, Plus, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import {
  MAX_STICKY_TEXT,
  STICKY_COLORS,
  STICKY_MAX_SIZE,
  STICKY_MIN_HEIGHT,
  STICKY_MIN_WIDTH,
  STICKY_STYLES,
} from "@/lib/notes";
import { cn } from "@/lib/utils";
import { useNoteStore, useProjectStickies } from "@/stores/noteStore";
import type { StickyColor, StickyNote } from "@/types";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";

interface StickyWallViewProps {
  projectId: string;
  feature: WorkspaceFeature;
}

/** Délai avant l'enregistrement du texte d'un post-it (ms). */
const TEXT_DELAY = 600;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type Gesture =
  | { kind: "move"; startX: number; startY: number; originX: number; originY: number }
  | { kind: "resize"; startX: number; startY: number; originW: number; originH: number };

/** Un post-it du mur : se déplace par son bandeau, s'agrandit par son coin. */
function StickyCard({
  sticky,
  onChange,
  onRaise,
  onDelete,
  onError,
}: {
  sticky: StickyNote;
  onChange: (input: Partial<StickyNote>) => Promise<void>;
  onRaise: () => void;
  onDelete: () => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation("notes");
  const [text, setText] = useState(sticky.text);
  /** Position et taille pendant un geste (sinon celles enregistrées). */
  const [live, setLive] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const timer = useRef<number | null>(null);
  const pending = useRef<string | null>(null);

  // Texte modifié ailleurs (annulation après refus) : relu s'il n'y a rien en attente.
  useEffect(() => {
    if (pending.current === null) setText(sticky.text);
  }, [sticky.text]);

  function flush() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const value = pending.current;
    if (value === null) return;
    pending.current = null;
    onChange({ text: value }).catch((error) => onError(errorText(error)));
  }

  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function onText(value: string) {
    setText(value);
    pending.current = value;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, TEXT_DELAY);
  }

  function start(event: ReactPointerEvent<HTMLElement>, kind: Gesture["kind"]) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onRaise();
    gesture.current =
      kind === "move"
        ? { kind, startX: event.clientX, startY: event.clientY, originX: sticky.x, originY: sticky.y }
        : { kind, startX: event.clientX, startY: event.clientY, originW: sticky.width, originH: sticky.height };
    setLive({ x: sticky.x, y: sticky.y, width: sticky.width, height: sticky.height });
  }

  function move(event: ReactPointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g) return;
    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    setLive((current) => {
      if (!current) return current;
      return g.kind === "move"
        ? { ...current, x: Math.max(0, Math.round(g.originX + dx)), y: Math.max(0, Math.round(g.originY + dy)) }
        : {
            ...current,
            width: clamp(Math.round(g.originW + dx), STICKY_MIN_WIDTH, STICKY_MAX_SIZE),
            height: clamp(Math.round(g.originH + dy), STICKY_MIN_HEIGHT, STICKY_MAX_SIZE),
          };
    });
  }

  function end(event: ReactPointerEvent<HTMLElement>) {
    const g = gesture.current;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const result = live;
    setLive(null);
    if (!g || !result) return;

    const changed =
      g.kind === "move"
        ? result.x !== sticky.x || result.y !== sticky.y
        : result.width !== sticky.width || result.height !== sticky.height;
    if (!changed) return;

    const input = g.kind === "move" ? { x: result.x, y: result.y } : { width: result.width, height: result.height };
    onChange(input).catch((error) => onError(errorText(error)));
  }

  const box = live ?? sticky;
  const style = STICKY_STYLES[sticky.color];

  return (
    <div
      className="group/sticky absolute flex flex-col rounded-sm shadow-md transition-shadow hover:shadow-lg"
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        zIndex: sticky.z,
        background: style.paper,
        color: "#1f2937",
        boxShadow: live ? "0 12px 28px rgb(0 0 0 / 0.25)" : undefined,
      }}
      onPointerDown={onRaise}
    >
      {/* Bandeau : poignée de déplacement, couleurs, suppression. */}
      <div
        className="flex h-7 shrink-0 cursor-grab touch-none items-center gap-1 rounded-t-sm px-1.5 active:cursor-grabbing"
        style={{ background: style.border }}
        onPointerDown={(event) => start(event, "move")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <GripHorizontal className="size-3.5 opacity-50" />
        <div className="ml-1 flex items-center opacity-0 transition-opacity group-hover/sticky:opacity-100 group-focus-within/sticky:opacity-100">
          {STICKY_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={t(`colors.${color}`)}
              aria-label={t(`colors.${color}`)}
              aria-pressed={color === sticky.color}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() =>
                onChange({ color }).catch((error) =>
                  onError(errorText(error)),
                )
              }
              className="flex size-6 items-center justify-center rounded-full hover:bg-black/10"
            >
              <span
                className={cn(
                  "size-3 rounded-full border border-black/20",
                  color === sticky.color && "ring-2 ring-black/40 ring-offset-1",
                )}
                style={{ background: STICKY_STYLES[color].swatch }}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          title={t("wall.delete")}
          aria-label={t("wall.delete")}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onDelete}
          className="ml-auto flex size-6 items-center justify-center rounded opacity-0 group-hover/sticky:opacity-70 group-focus-within/sticky:opacity-70 hover:!opacity-100 hover:bg-black/10 focus-visible:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <textarea
        value={text}
        maxLength={MAX_STICKY_TEXT}
        placeholder={t("wall.placeholder")}
        aria-label={t("wall.placeholder")}
        onChange={(event) => onText(event.target.value)}
        onBlur={flush}
        className="min-h-0 flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-black/35"
        style={{ fontFamily: "Comic Sans MS, Comic Neue, Segoe Print, cursive" }}
      />

      {/* Coin : redimensionnement. */}
      <div
        role="separator"
        aria-label={t("wall.resize")}
        title={t("wall.resize")}
        className="absolute right-0 bottom-0 size-4 cursor-nwse-resize touch-none"
        style={{
          background: `linear-gradient(135deg, transparent 50%, ${style.border} 50%)`,
        }}
        onPointerDown={(event) => start(event, "resize")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
    </div>
  );
}

/**
 * Mur de post-it du projet : des notes rapides que l'on place librement.
 * Chaque post-it garde sa position, sa taille, sa couleur et son ordre
 * d'empilement.
 */
export function StickyWallView({ projectId, feature }: StickyWallViewProps) {
  const { t } = useTranslation("notes");
  const { stickies, loaded, error, reload } = useProjectStickies(projectId);
  const createSticky = useNoteStore((state) => state.createSticky);
  const updateSticky = useNoteStore((state) => state.updateSticky);
  const raiseSticky = useNoteStore((state) => state.raiseSticky);
  const deleteSticky = useNoteStore((state) => state.deleteSticky);

  // Erreurs d'action en notification : le mur ne bouge pas.
  const setMessage = (text: string | null) => {
    if (text) notifyError(text, "stickies");
  };
  const wallRef = useRef<HTMLDivElement>(null);

  const report = (cause: unknown) => setMessage(errorText(cause));

  async function add(color: StickyColor) {
    setMessage(null);
    const wall = wallRef.current;
    // Dans la partie visible du mur, légèrement décalé à chaque ajout.
    const offset = (stickies.length % 8) * 24;
    const x = Math.round((wall?.scrollLeft ?? 0) + 32 + offset);
    const y = Math.round((wall?.scrollTop ?? 0) + 32 + offset);
    try {
      await createSticky(projectId, color, x, y);
    } catch (cause) {
      report(cause);
    }
  }

  const width = Math.max(0, ...stickies.map((s) => s.x + s.width)) + 240;
  const height = Math.max(0, ...stickies.map((s) => s.y + s.height)) + 240;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">{feature.label}</h1>

      <div className="flex flex-wrap items-center gap-3 border-b bg-card/60 px-4 py-2">
        <span className="text-sm font-medium">{t("wall.add")}</span>
        <div className="flex items-center gap-1.5">
          {STICKY_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={t("wall.addColor", { color: t(`colors.${color}`).toLowerCase() })}
              aria-label={t("wall.addColor", { color: t(`colors.${color}`).toLowerCase() })}
              onClick={() => void add(color)}
              className="flex size-7 items-center justify-center rounded-md border border-black/10 shadow-sm transition-transform hover:-translate-y-0.5"
              style={{ background: STICKY_STYLES[color].paper }}
            >
              <Plus className="size-3.5 text-black/50" />
            </button>
          ))}
        </div>
        <p className="hidden flex-1 text-xs text-muted-foreground md:block">{t("wall.hint")}</p>
        {loaded && (
          <span className="ml-auto text-xs text-muted-foreground">{t("wall.count", { count: stickies.length })}</span>
        )}
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-3 border-b bg-destructive/5 px-4 py-2 text-sm text-destructive">
          <span className="flex-1">{error}</span>
          {error && !loaded && (
            <Button variant="outline" size="sm" onClick={() => void reload()}>
              <RefreshCw className="mr-1.5 size-3.5" />
              {t("wall.retry")}
            </Button>
          )}
        </div>
      )}

      <div
        ref={wallRef}
        className="relative isolate min-h-0 flex-1 overflow-auto overscroll-contain"
        style={{
          backgroundColor: "var(--muted)",
          backgroundImage: "radial-gradient(color-mix(in oklab, var(--foreground) 14%, transparent) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        {!loaded && !error && (
          <p className="p-6 text-sm text-muted-foreground">{t("wall.loading")}</p>
        )}

        {loaded && stickies.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <p className="rounded-lg bg-background/80 px-4 py-3 text-sm text-muted-foreground shadow-sm">
              {t("wall.empty")}
            </p>
          </div>
        )}

        <div className="relative" style={{ width, height, minWidth: "100%", minHeight: "100%" }}>
          {stickies.map((sticky) => (
            <StickyCard
              key={sticky.id}
              sticky={sticky}
              onChange={(input) => updateSticky(projectId, sticky.id, input)}
              onRaise={() => void raiseSticky(projectId, sticky.id).catch(report)}
              onDelete={() => void deleteSticky(projectId, sticky.id).catch(report)}
              onError={setMessage}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
