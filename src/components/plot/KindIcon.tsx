import { cn } from "@/lib/utils";
import type { PlotLinkKind } from "@/lib/plot";

/** Trait d'un lien selon son type. */
export function KindIcon({ kind, className }: { kind: PlotLinkKind; className?: string }) {
  return (
    <svg viewBox="0 0 34 12" aria-hidden="true" className={cn("h-3 w-[34px] shrink-0", className)}>
      <circle cx="4" cy="6" r="3" fill="currentColor" />
      {kind === "meeting" ? (
        <>
          <line x1="4" y1="6" x2="30" y2="6" stroke="currentColor" strokeWidth="2.6" />
          <circle cx="30" cy="6" r="3" fill="currentColor" />
        </>
      ) : (
        <>
          <line x1="4" y1="6" x2="26" y2="6" stroke="currentColor" strokeWidth={kind === "impact" ? 2.8 : 2.2} strokeDasharray={kind === "influence" ? "4 3.5" : undefined} />
          <path d="M23,1.2 L32.5,6 L23,10.8Z" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

