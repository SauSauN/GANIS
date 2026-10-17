import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { errorText, loadDocumentBlob } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { StructureDocument } from "@/types";

type Width = "page" | "narrow" | "wide";

const WIDTH_KEY = "ganis.documents.readingWidth";
const GAP_KEY = "ganis.documents.readingGap";

function stored<T extends string>(key: string, fallback: T, allowed: T[]): T {
  try {
    const value = localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Préférence gardée pour cette séance seulement.
  }
}

interface ReadingViewProps {
  projectId: string;
  title: string;
  pages: StructureDocument[];
  onClose: () => void;
}

/**
 * Lecture continue des pages d'un chapitre (manga, BD, storyboard) : les
 * images de l'élément, dans leur ordre, les unes sous les autres. Les pages
 * se chargent à l'approche ; ↓/→/Espace : page suivante, ↑/← : précédente.
 */
export function ReadingView({ projectId, title, pages, onClose }: ReadingViewProps) {
  const { t } = useTranslation("documents");
  const [width, setWidth] = useState<Width>(() => stored(WIDTH_KEY, "narrow", ["page", "narrow", "wide"]));
  const [gap, setGap] = useState<"on" | "off">(() => stored(GAP_KEY, "on", ["on", "off"]));
  const [current, setCurrent] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Page affichée : celle qui occupe le milieu de l'écran.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setCurrent(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { root, rootMargin: "-50% 0px -50% 0px" },
    );
    pageRefs.current.forEach((element) => element && observer.observe(element));
    return () => observer.disconnect();
  }, [pages]);

  function goTo(index: number) {
    const target = pageRefs.current[Math.max(0, Math.min(pages.length - 1, index))];
    target?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        goTo(current + 1);
      } else if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        goTo(current - 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        goTo(0);
      } else if (event.key === "End") {
        event.preventDefault();
        goTo(pages.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const widths: Array<{ id: Width; label: string }> = [
    { id: "page", label: t("reading.width.page") },
    { id: "narrow", label: t("reading.width.narrow") },
    { id: "wide", label: t("reading.width.wide") },
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} className="flex h-[calc(100vh-2rem)] max-w-[min(98vw,1600px)] flex-col overflow-hidden bg-neutral-950 p-0 text-neutral-100">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 px-4 py-2">
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-base leading-6">{title}</DialogTitle>
          <DialogDescription className="text-xs text-neutral-400">
            {t("reading.page", { index: current + 1, count: pages.length })}
          </DialogDescription>
        </div>
        <div className="flex rounded-lg bg-white/5 p-0.5" role="group" aria-label={t("reading.width.label")}>
          {widths.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={width === item.id}
              onClick={() => {
                setWidth(item.id);
                remember(WIDTH_KEY, item.id);
              }}
              className={cn("min-h-8 rounded-md px-2.5 text-xs text-neutral-300 hover:bg-white/10", width === item.id && "bg-white/15 text-white")}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="flex min-h-8 items-center gap-2 text-xs text-neutral-300">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={gap === "off"}
            onChange={(event) => {
              const value = event.target.checked ? "off" : "on";
              setGap(value);
              remember(GAP_KEY, value);
            }}
          />
          {t("reading.joined")}
        </label>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("viewer.close")} title={`${t("viewer.close")} (${t("keys.escape")})`} className="text-neutral-200 hover:bg-white/10 hover:text-white">
          <X />
        </Button>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto" tabIndex={-1}>
        <div className={cn("mx-auto flex flex-col items-center py-6", gap === "on" ? "gap-4" : "gap-0", width === "narrow" && "max-w-3xl", width === "wide" && "max-w-none px-4")}>
          {pages.map((page, index) => (
            <div
              key={page.id}
              ref={(element) => {
                pageRefs.current[index] = element;
              }}
              data-index={index}
              className={cn("w-full", width === "page" && "flex h-[calc(100vh-7rem)] justify-center")}
            >
              <LazyPage projectId={projectId} page={page} fitHeight={width === "page"} label={t("reading.pageLabel", { index: index + 1, name: page.name })} />
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

/** Page chargée quand elle approche de l'écran. */
function LazyPage({ projectId, page, fitHeight, label }: { projectId: string; page: StructureDocument; fitHeight: boolean; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), {
      rootMargin: "1500px 0px",
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let created: string | null = null;
    loadDocumentBlob(projectId, page)
      .then((blob) => {
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch((cause) => !cancelled && setError(errorText(cause)));
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [visible, projectId, page]);

  return (
    <div ref={ref} className={cn("flex w-full justify-center", fitHeight && "h-full")}>
      {url ? (
        <img src={url} alt={label} className={cn(fitHeight ? "h-full w-auto object-contain" : "h-auto w-full")} />
      ) : (
        <div className="flex aspect-[2/3] w-full max-w-xl items-center justify-center bg-white/5 text-sm text-neutral-400">
          {error ?? <Loader2 className="size-5 animate-spin" aria-label={label} />}
        </div>
      )}
    </div>
  );
}
