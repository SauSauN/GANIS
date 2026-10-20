import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { FileDown, FileUp } from "lucide-react";
import { isTauri } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Étape envoyée par Rust (`commands/ganix.rs`) ; `null` : terminé. */
type Stage = "data" | "files" | "verify" | "build";

interface ProgressEvent {
  operation: "export" | "import";
  stage: Stage | null;
  done: number;
  total: number;
}

/** Part de chaque étape dans la barre, pour une progression régulière. */
const SPANS: Record<ProgressEvent["operation"], Partial<Record<Stage, [number, number]>>> = {
  export: { data: [0, 70], files: [70, 95], verify: [95, 100] },
  import: { files: [0, 30], build: [30, 100] },
};

/** Pourcentage global, ou `null` si l'étape ne se mesure pas. */
export function overallPercent(event: ProgressEvent): number | null {
  if (!event.stage) return 100;

  const span = SPANS[event.operation][event.stage];
  if (!span) return null;

  const [from, to] = span;
  if (event.total === 0) return from;

  return Math.round(from + ((to - from) * Math.min(event.done, event.total)) / event.total);
}

/**
 * Barre de progression de l'export et de l'import `.ganix`.
 *
 * Montée une fois (dans `App`), elle écoute l'avancement envoyé par Rust et
 * s'affiche en bas à gauche pendant l'opération, quel que soit l'écran qui
 * l'a lancée (tableau de bord, menu Fichier, paramètres du projet).
 */
export function GanixProgress() {
  const { t } = useTranslation("projects");
  const [event, setEvent] = useState<ProgressEvent | null>(null);

  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    listen<ProgressEvent>("ganix-progress", ({ payload }) => {
      setEvent(payload.stage ? payload : null);
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  if (!event?.stage) return null;

  const percent = overallPercent(event);
  const Icon = event.operation === "export" ? FileDown : FileUp;
  const detail =
    event.total > 0 && (event.stage === "files" || event.stage === "data" || event.stage === "build")
      ? t(`ganix.progress.count.${event.stage}`, { done: event.done, total: event.total })
      : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-9 left-3 z-[65] w-80 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
    >
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="flex-1 font-medium">{t(`ganix.progress.${event.operation}`)}</span>
        {percent !== null && <span className="tabular-nums text-muted-foreground">{percent} %</span>}
      </div>

      <div
        role="progressbar"
        aria-label={t(`ganix.progress.${event.operation}`)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={t(`ganix.progress.stage.${event.stage}`)}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full bg-primary transition-[width] duration-200", percent === null && "w-1/3 animate-pulse")}
          style={percent !== null ? { width: `${percent}%` } : undefined}
        />
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        {t(`ganix.progress.stage.${event.stage}`)}
        {detail && <> · {detail}</>}
      </p>
    </div>
  );
}
