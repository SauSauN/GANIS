import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileQuestion,
  History,
  Loader2,
  Maximize,
  MoveHorizontal,
  Save,
  X,
  ZoomIn,
} from "lucide-react";
import { DocumentIcon } from "@/components/documents/DocumentIcon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import {
  canOpenExternally,
  documentKind,
  errorText,
  extensionOf,
  formatSize,
  loadDocumentBlob,
  openExternally,
  useDocumentStore,
} from "@/lib/documents";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toastStore";
import type { StructureDocument } from "@/types";

interface DocumentViewerProps {
  projectId: string;
  /** Documents de l'élément (← et → passent de l'un à l'autre). */
  documents: StructureDocument[];
  documentId: string | null;
  onClose: () => void;
  onShowVersions: (document: StructureDocument) => void;
  onSaveAs: (document: StructureDocument) => void;
}

/** Contenu d'un document, sous forme de `Blob` et d'adresse locale (`blob:`). */
function useContent(projectId: string, document: StructureDocument | null) {
  const [state, setState] = useState<{ key: string; blob: Blob; url: string } | { key: string; error: string } | null>(null);
  const key = document ? `${document.id}:${document.updatedAt}:${document.size}` : "";

  useEffect(() => {
    if (!document) return;
    let cancelled = false;
    let url: string | null = null;
    setState(null);
    loadDocumentBlob(projectId, document)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setState({ key, blob, url });
      })
      .catch((error) => !cancelled && setState({ key, error: errorText(error) }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, key]);

  return state && state.key === key ? state : null;
}

/** Le focus est-il dans un champ (les flèches lui appartiennent alors) ? */
function typing(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return !!element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "IFRAME"].includes(element.tagName));
}

/**
 * Lecture d'un document dans GANIS : PDF (lecteur intégré), images,
 * fichiers Word (aperçu), textes (modifiables ici), sons et vidéos. Les
 * autres types s'ouvrent dans l'application associée.
 */
export function DocumentViewer({ projectId, documents, documentId, onClose, onShowVersions, onSaveAs }: DocumentViewerProps) {
  const { t } = useTranslation(["documents", "common"]);
  const [currentId, setCurrentId] = useState<string | null>(documentId);
  const [dirty, setDirty] = useState(false);
  const [askDiscard, setAskDiscard] = useState<null | (() => void)>(null);
  const saveRef = useRef<(() => Promise<boolean>) | null>(null);

  useEffect(() => {
    setCurrentId(documentId);
    setDirty(false);
  }, [documentId]);

  const index = documents.findIndex((item) => item.id === currentId);
  const document = index >= 0 ? documents[index] : null;
  const content = useContent(projectId, document);
  const kind = document ? documentKind(document) : "other";

  /** Quitter le document affiché (fermer, passer à un autre) : texte non enregistré ? */
  const leave = useCallback(
    (then: () => void) => {
      if (dirty) setAskDiscard(() => then);
      else then();
    },
    [dirty],
  );

  const go = useCallback(
    (delta: number) => {
      const next = documents[index + delta];
      if (next) leave(() => {
        setDirty(false);
        setCurrentId(next.id);
      });
    },
    [documents, index, leave],
  );

  useEffect(() => {
    if (!document) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && saveRef.current) {
        event.preventDefault();
        event.stopPropagation();
        void saveRef.current();
        return;
      }
      if (typing(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [document, go]);

  const close = () => leave(() => {
    setDirty(false);
    onClose();
  });

  if (!document) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      className="flex h-[calc(100vh-2rem)] max-w-[min(96vw,1400px)] flex-col overflow-hidden p-0"
    >
      {/* En-tête : nom, type, actions */}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <DocumentIcon document={document} />
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-base leading-6">{document.name}</DialogTitle>
          <DialogDescription className="text-xs">
            {[extensionOf(document.name) || t("kinds.other"), formatSize(document.size), documents.length > 1 ? t("viewer.position", { index: index + 1, count: documents.length }) : null]
              .filter(Boolean)
              .join(" · ")}
          </DialogDescription>
        </div>

        <div className="flex items-center gap-1">
          {documents.length > 1 && (
            <>
              <Button variant="ghost" size="icon" disabled={index <= 0} onClick={() => go(-1)} aria-label={t("viewer.previous")} title={`${t("viewer.previous")} (←)`}>
                <ChevronLeft />
              </Button>
              <Button variant="ghost" size="icon" disabled={index >= documents.length - 1} onClick={() => go(1)} aria-label={t("viewer.next")} title={`${t("viewer.next")} (→)`}>
                <ChevronRight />
              </Button>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
            </>
          )}
          {canOpenExternally(document.name) && (
            <Button variant="outline" size="sm" onClick={() => void openExternally(projectId, document)} title={t("actions.openExternalHint")}>
              <ExternalLink />
              <span className="hidden md:inline">{t("actions.openExternal")}</span>
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => onSaveAs(document)} aria-label={t("actions.saveAs")} title={t("actions.saveAs")}>
            <Download />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onShowVersions(document)} aria-label={t("actions.versions")} title={t("actions.versions")}>
            <History />
          </Button>
          <Button variant="ghost" size="icon" onClick={close} aria-label={t("viewer.close")} title={`${t("viewer.close")} (${t("keys.escape")})`}>
            <X />
          </Button>
        </div>
      </header>

      {askDiscard && (
        <div role="alert" className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          <span className="flex-1">{t("viewer.unsaved")}</span>
          <Button
            size="sm"
            onClick={async () => {
              const then = askDiscard;
              if (saveRef.current && (await saveRef.current())) {
                setAskDiscard(null);
                then();
              }
            }}
          >
            {t("viewer.saveAndContinue")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const then = askDiscard;
              setAskDiscard(null);
              setDirty(false);
              then();
            }}
          >
            {t("viewer.discard")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAskDiscard(null)}>
            {t("viewer.keepEditing")}
          </Button>
        </div>
      )}

      {/* Contenu */}
      <div className="min-h-0 flex-1 bg-muted/40">
        {!content ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" />
            {t("viewer.loading")}
          </div>
        ) : "error" in content ? (
          <p role="alert" className="p-6 text-sm text-destructive">
            {content.error}
          </p>
        ) : kind === "pdf" ? (
          <iframe key={content.url} src={content.url} title={document.name} className="size-full border-0 bg-background" />
        ) : kind === "image" ? (
          <ImageView key={content.url} url={content.url} name={document.name} />
        ) : kind === "word" ? (
          <WordView blob={content.blob} document={document} projectId={projectId} />
        ) : kind === "text" ? (
          <TextEditor
            key={content.key}
            projectId={projectId}
            document={document}
            blob={content.blob}
            onDirtyChange={setDirty}
            saveRef={saveRef}
          />
        ) : kind === "audio" ? (
          <div className="flex h-full items-center justify-center p-6">
            <audio controls src={content.url} className="w-full max-w-xl">
              {document.name}
            </audio>
          </div>
        ) : kind === "video" ? (
          <video controls src={content.url} className="size-full bg-black object-contain">
            {document.name}
          </video>
        ) : (
          <OtherView document={document} projectId={projectId} onSaveAs={() => onSaveAs(document)} />
        )}
      </div>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// Images
// ----------------------------------------------------------------------------

type Zoom = "fit" | "width" | "actual";

function ImageView({ url, name }: { url: string; name: string }) {
  const { t } = useTranslation(["documents", "common"]);
  const [zoom, setZoom] = useState<Zoom>("fit");
  const zooms: Array<{ id: Zoom; icon: typeof Maximize; label: string }> = [
    { id: "fit", icon: Maximize, label: t("viewer.zoom.fit") },
    { id: "width", icon: MoveHorizontal, label: t("viewer.zoom.width") },
    { id: "actual", icon: ZoomIn, label: t("viewer.zoom.actual") },
  ];

  return (
    <div className="relative flex h-full flex-col">
      <div className="absolute top-3 right-3 z-10 flex gap-0.5 rounded-lg border bg-card/95 p-0.5 shadow-sm" role="group" aria-label={t("viewer.zoom.label")}>
        {zooms.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={zoom === item.id}
            title={item.label}
            aria-label={item.label}
            onClick={() => setZoom(item.id)}
            className={cn("flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent", zoom === item.id && "bg-accent text-foreground")}
          >
            <item.icon className="size-4" />
          </button>
        ))}
      </div>
      <div className={cn("min-h-0 flex-1 overflow-auto", zoom === "fit" && "flex items-center justify-center p-4")}>
        <img
          src={url}
          alt={name}
          className={cn(
            zoom === "fit" && "max-h-full max-w-full object-contain shadow-sm",
            zoom === "width" && "w-full",
            zoom === "actual" && "max-w-none",
          )}
        />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Word
// ----------------------------------------------------------------------------

function WordView({ blob, document, projectId }: { blob: Blob; document: StructureDocument; projectId: string }) {
  const { t } = useTranslation(["documents", "common"]);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);
    (async () => {
      try {
        const mammoth = await import("mammoth");
        const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
        if (!cancelled) setHtml(sanitizeHtml(result.value));
      } catch {
        if (!cancelled) setError(t("viewer.wordUnreadable"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob, t]);

  return (
    <div className="flex h-full flex-col">
      <p className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-card px-4 py-1.5 text-xs text-muted-foreground">
        <span className="flex-1">{t("viewer.wordPreview")}</span>
        {canOpenExternally(document.name) && (
          <Button size="xs" variant="outline" onClick={() => void openExternally(projectId, document)}>
            <ExternalLink />
            {t("viewer.editInWord")}
          </Button>
        )}
      </p>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-8">
        {error ? (
          <p role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        ) : html === null ? (
          <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" />
            {t("viewer.loading")}
          </p>
        ) : (
          <article
            className="docx-preview mx-auto max-w-[52rem] rounded-sm bg-white px-[clamp(1.5rem,6vw,4.5rem)] py-16 text-[0.95rem] leading-7 text-neutral-900 shadow-md"
            // HTML nettoyé par `sanitizeHtml` (aucun script, style ni lien externe).
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Texte (modifiable dans GANIS)
// ----------------------------------------------------------------------------

interface TextEditorProps {
  projectId: string;
  document: StructureDocument;
  blob: Blob;
  onDirtyChange: (dirty: boolean) => void;
  saveRef: React.MutableRefObject<(() => Promise<boolean>) | null>;
}

function TextEditor({ projectId, document, blob, onDirtyChange, saveRef }: TextEditorProps) {
  const { t } = useTranslation(["documents", "common"]);
  const [original, setOriginal] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const upsert = useDocumentStore((state) => state.upsert);

  useEffect(() => {
    let cancelled = false;
    void blob.text().then((value) => {
      if (cancelled) return;
      setOriginal(value);
      setText(value);
    });
    return () => {
      cancelled = true;
    };
  }, [blob]);

  const dirty = original !== null && text !== original;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const words = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);

  const save = useCallback(async () => {
    if (!dirty) return true;
    setSaving(true);
    try {
      const updated = await api.updateStructureDocumentContent(projectId, document.id, new TextEncoder().encode(text));
      setOriginal(text);
      upsert(projectId, updated);
      toast({ message: t("viewer.saved", { name: document.name }), tone: "success" });
      return true;
    } catch (error) {
      toast({ message: errorText(error), tone: "error" });
      return false;
    } finally {
      setSaving(false);
    }
  }, [dirty, projectId, document.id, document.name, text, upsert, t]);

  useEffect(() => {
    saveRef.current = save;
    return () => {
      saveRef.current = null;
    };
  }, [save, saveRef]);

  if (original === null) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b bg-card px-4 py-1.5 text-xs text-muted-foreground">
        <span className="flex-1">
          {t("viewer.words", { count: words })}
          {dirty ? ` · ${t("viewer.modified")}` : ""}
        </span>
        <Button size="xs" disabled={!dirty || saving} onClick={() => void save()} title={`${t("viewer.save")} (Ctrl+S)`}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          {t("viewer.save")}
        </Button>
      </div>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        spellCheck
        aria-label={document.name}
        placeholder={t("common:placeholders.documentText")}
        className="min-h-0 flex-1 resize-none bg-background px-[max(1.5rem,calc((100%-48rem)/2))] py-8 text-[0.95rem] leading-7 outline-none"
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Autres types
// ----------------------------------------------------------------------------

function OtherView({ document, projectId, onSaveAs }: { document: StructureDocument; projectId: string; onSaveAs: () => void }) {
  const { t } = useTranslation(["documents", "common"]);
  const external = canOpenExternally(document.name);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <FileQuestion className="size-12 text-muted-foreground" />
      <div className="max-w-md space-y-1">
        <p className="font-medium">{t("viewer.noPreview")}</p>
        <p className="text-sm text-muted-foreground">{external ? t("viewer.noPreviewHint") : t("viewer.unsafeHint")}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {external && (
          <Button onClick={() => void openExternally(projectId, document)}>
            <ExternalLink />
            {t("actions.openExternal")}
          </Button>
        )}
        <Button variant="outline" onClick={onSaveAs}>
          <Download />
          {t("actions.saveAs")}
        </Button>
      </div>
    </div>
  );
}
