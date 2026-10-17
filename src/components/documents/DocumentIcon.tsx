import {
  File,
  FileAudio,
  FileImage,
  FileText,
  FileType,
  FileVideo,
  type LucideIcon,
} from "lucide-react";
import { documentKind, extensionOf, type DocumentKind } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { StructureDocument } from "@/types";

const ICONS: Record<DocumentKind, LucideIcon> = {
  pdf: FileType,
  image: FileImage,
  word: FileText,
  text: FileText,
  audio: FileAudio,
  video: FileVideo,
  other: File,
};

/** Couleur de chaque type (reconnaissable d'un coup d'œil). */
const TINTS: Record<DocumentKind, string> = {
  pdf: "bg-red-500/10 text-red-600 dark:text-red-400",
  image: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  word: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  text: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  audio: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  video: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  other: "bg-muted text-muted-foreground",
};

/** Pastille du type de document, avec son extension. */
export function DocumentIcon({ document, className }: { document: Pick<StructureDocument, "mime" | "name">; className?: string }) {
  const kind = documentKind(document);
  const Icon = ICONS[kind];
  const ext = extensionOf(document.name);
  return (
    <span
      className={cn("relative flex size-9 shrink-0 items-center justify-center rounded-lg", TINTS[kind], className)}
      aria-hidden="true"
    >
      <Icon className="size-4.5" />
      {ext && ext.length <= 4 && (
        <span className="absolute -bottom-1 rounded bg-card px-0.5 font-mono text-[0.55rem] leading-3 font-semibold shadow-sm ring-1 ring-border">
          {ext}
        </span>
      )}
    </span>
  );
}
