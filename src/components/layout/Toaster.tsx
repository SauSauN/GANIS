import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToastStore, type Toast } from "@/stores/toastStore";

/** Un message : disparaît seul, sauf pendant que la souris ou le clavier est dessus. */
function ToastItem({ toast }: { toast: Toast }) {
  const { t } = useTranslation("common");
  const dismiss = useToastStore((state) => state.dismiss);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const remaining = useRef(toast.duration);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const timer = window.setTimeout(() => dismiss(toast.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(1500, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, dismiss, toast.id]);

  const Icon = toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? CircleAlert : Info;

  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        "pointer-events-auto flex min-h-12 w-full max-w-md items-center gap-3 rounded-lg border bg-popover px-4 py-2 text-sm text-popover-foreground shadow-lg",
        "animate-in fade-in slide-in-from-bottom-2",
        toast.tone === "error" && "border-destructive/40",
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          "size-4 shrink-0",
          toast.tone === "success" && "text-success",
          toast.tone === "error" && "text-destructive",
          toast.tone === "info" && "text-muted-foreground",
        )}
      />
      <p className="min-w-0 flex-1 break-words">{toast.message}</p>

      {toast.action && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await toast.action?.run();
            } finally {
              setBusy(false);
            }
          }}
          className="h-8 shrink-0 rounded-md px-3 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          {toast.action.label}
        </button>
      )}

      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label={t("actions.close")}
        title={t("actions.close")}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/**
 * Messages temporaires, en bas de la fenêtre, au-dessus de la barre d'état.
 * Lus par les lecteurs d'écran (`role="status"`).
 */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-9 z-[60] flex flex-col items-center gap-2 px-4"
    >
      {toasts.map((item) => (
        <ToastItem key={item.id} toast={item} />
      ))}
    </div>
  );
}
