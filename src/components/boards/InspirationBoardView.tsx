import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ArrowUpToLine, Heading, ImageOff, ImagePlus, Lightbulb, Palette, Plus, Quote, Search, StickyNote, Trash2, X } from "lucide-react";
import { LoadingDots } from "@/components/common/LoadingDots";
import { NumberStepper } from "@/components/common/NumberStepper";
import { BoardLinks } from "@/components/boards/BoardLinks";
import { BOARD_LINK_ICONS, type LinkTarget, useLinkTargets } from "@/components/boards/useLinkTargets";
import { FilterResults } from "@/components/common/FilterResults";
import { formatNoteDate } from "@/components/notes/FolderSelect";
import { Input } from "@/components/ui/input";
import { ColorMenu } from "@/components/common/ColorMenu";
import { COLOR_CHOICES } from "@/lib/structure";
import { ConfirmDialog } from "@/components/notes/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { WorkspaceFeature } from "@/components/workspace/modules";
import { fieldClass, PageShell } from "@/components/workspace/views/PageShell";
import { api } from "@/lib/api";
import { BOARD_HEIGHT, BOARD_WIDTH, boardTabId, MAX_COLORS, MAX_ITEM_WIDTH, MIN_ITEM_WIDTH, newItem, topZ, type BoardData, type BoardItem, type BoardItemKind } from "@/lib/boards";
import { errorText } from "@/lib/errors";
import { notifyError } from "@/lib/notify";
import { sessionMap } from "@/lib/sessionCache";
import { cn } from "@/lib/utils";
import { useBoardStore, useProjectBoards, type BoardEntry } from "@/stores/boardStore";
import type { ProjectImage } from "@/types";

/** Images de la galerie déjà chargées (copies en clair : vidées en fin de session). */
const urlCache = sessionMap<string, string>();

/** Images de la galerie du projet et leur contenu (`data:`), chargé à la demande. */
function useGallery(projectId: string) {
  const [images, setImages] = useState<ProjectImage[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    api
      .listProjectGallery(projectId)
      .then((list) => !cancelled && setImages(list))
      .catch(() => !cancelled && setImages([]));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const want = (id: string) => {
    if (urls[id]) return;
    // Déjà demandée (chargement en cours) : rien à refaire.
    if (urlCache.has(id) && !urlCache.get(id)) return;
    const cached = urlCache.get(id);
    if (cached) {
      setUrls((current) => (current[id] ? current : { ...current, [id]: cached }));
      return;
    }
    urlCache.set(id, "");
    api
      .getProjectGalleryImage(projectId, id)
      .then((data) => {
        const url = `data:${data.mime};base64,${data.data}`;
        urlCache.set(id, url);
        setUrls((current) => ({ ...current, [id]: url }));
      })
      .catch(() => urlCache.delete(id));
  };

  return { images, urls, want };
}

interface InspirationBoardViewProps {
  projectId: string;
  /** Planche affichée (onglet `board:<id>`) ; sans elle : vue d'ensemble des planches. */
  boardId?: string;
  feature: WorkspaceFeature;
  onOpenFeature: (featureId: string) => void;
  /** Ferme l'onglet (planche supprimée). */
  onClose?: () => void;
}

/**
 * Planches d'inspiration : des surfaces libres où l'on dispose les images
 * de la galerie, des palettes, des citations, des notes et des titres. Un
 * élément se déplace en le faisant glisser ; un clic l'ouvre dans le
 * panneau de droite pour le modifier.
 *
 * Chaque planche s'ouvre dans son propre onglet ; l'onglet « Planches
 * d'inspiration » les montre toutes.
 */
export function InspirationBoardView({ projectId, boardId, feature, onOpenFeature, onClose }: InspirationBoardViewProps) {
  const { t } = useTranslation("workspaceHome");
  const { boards, loaded, error } = useProjectBoards(projectId);
  const store = useBoardStore();
  const gallery = useGallery(projectId);

  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<BoardEntry | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const dragStart = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const board = boardId ? (boards.find((b) => b.id === boardId) ?? null) : null;
  const item = board?.data.items.find((i) => i.id === selectedItem) ?? null;

  // Autre planche : rien n'y est sélectionné.
  useEffect(() => setSelectedItem(null), [board?.id]);

  // Images de la planche : chargées dès qu'elle s'affiche.
  useEffect(() => {
    board?.data.items.forEach((i) => i.imageId && gallery.want(i.imageId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board?.id, board?.data.items.length]);

  const edit = (fn: (data: BoardData) => void) => board && store.update(projectId, board.id, fn);
  const editItem = (id: string, fn: (it: BoardItem) => void) =>
    edit((data) => {
      const target = data.items.find((i) => i.id === id);
      if (target) fn(target);
    });

  async function createBoard() {
    try {
      const created = await store.create(projectId, t("boards.defaultName", { number: boards.length + 1 }));
      onOpenFeature(boardTabId(created.id));
    } catch (e) {
      notifyError(errorText(e), "boards");
    }
  }

  function add(kind: BoardItemKind, fields: Partial<BoardItem> = {}) {
    if (!board) return;
    const scroller = scrollRef.current;
    const origin = { x: scroller?.scrollLeft ?? 0, y: scroller?.scrollTop ?? 0 };
    const created = newItem(board.data, kind, origin, fields);
    edit((data) => void data.items.push(created));
    setSelectedItem(created.id);
  }

  // Glisser un élément : déplacement affiché pendant le geste, enregistré à la fin.
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>, it: BoardItem) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { id: it.id, x: event.clientX, y: event.clientY, moved: false };
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = dragStart.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 4) return;
    start.moved = true;
    setDrag({ id: start.id, dx, dy });
  }
  function onPointerUp() {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    if (start.moved && drag) {
      const { dx, dy } = drag;
      editItem(start.id, (it) => {
        it.x = Math.round(Math.min(BOARD_WIDTH - MIN_ITEM_WIDTH, Math.max(0, it.x + dx)));
        it.y = Math.round(Math.min(BOARD_HEIGHT - 40, Math.max(0, it.y + dy)));
      });
    }
    setDrag(null);
    setSelectedItem(start.id);
  }

  if (!loaded) {
    return (
      <main className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : (
          <span className="inline-flex items-center gap-2" role="status">
            <LoadingDots className="size-4" />
            {t("boards.loading")}
          </span>
        )}
      </main>
    );
  }

  // Onglet « Planches d'inspiration » : toutes les planches, comme la liste des notes.
  if (!boardId) {
    return <BoardsOverview projectId={projectId} feature={feature} boards={boards} onOpen={(id) => onOpenFeature(boardTabId(id))} onCreate={() => void createBoard()} />;
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">{feature.label}</h1>

      <div className="flex min-h-0 flex-1 flex-col">

        {!board ? (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <Lightbulb className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="max-w-md text-sm text-muted-foreground">{t("boards.missing")}</p>
            {onClose && (
              <Button variant="outline" onClick={onClose}>
                {t("boards.closeTab")}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Barre d'outils de la planche */}
            <div className="flex flex-wrap items-center gap-2 border-b bg-card/60 px-3 py-2">
              <input
                key={board.id}
                defaultValue={board.name}
                maxLength={100}
                placeholder={t("boards.namePlaceholder")}
                aria-label={t("boards.name")}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (!name) e.target.value = board.name;
                  else if (name !== board.name) store.rename(projectId, board.id, name).catch((err) => notifyError(errorText(err), "boards"));
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className={cn(fieldClass, "h-8 w-56 font-semibold")}
              />
              <span className="flex-1" />

              <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
                <ImagePlus />
                {t("boards.addImage")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => add("palette", { text: "" })}>
                <Palette />
                {t("boards.addPalette")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => add("quote", { text: t("boards.defaults.quote") })}>
                <Quote />
                {t("boards.addQuote")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => add("note", { text: t("boards.defaults.note") })}>
                <StickyNote />
                {t("boards.addNote")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => add("label", { text: t("boards.defaults.label") })}>
                <Heading />
                {t("boards.addLabel")}
              </Button>              {/* Éléments du projet liés à la planche : à droite, après les ajouts. */}
              <BoardLinks
                inline
                projectId={projectId}
                links={board.data.links}
                onChange={(links) => edit((data) => void (data.links = links))}
              />

              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setConfirmDelete(board)}
                aria-label={t("boards.delete")}
                title={t("boards.delete")}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 />
              </Button>
            </div>


            <div className={cn("grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)]", item && "xl:grid-cols-[minmax(0,1fr)_17rem]")}>
              {/* Surface */}
              <div ref={scrollRef} className="relative min-h-[28rem] overflow-auto bg-muted/30" onPointerDown={(e) => e.target === e.currentTarget && setSelectedItem(null)}>
                <div
                  className="relative"
                  style={{
                    width: BOARD_WIDTH,
                    height: BOARD_HEIGHT,
                    backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
                    backgroundSize: "20px 20px",
                  }}
                  onPointerDown={(e) => e.target === e.currentTarget && setSelectedItem(null)}
                >
                  {board.data.items.length === 0 && <p className="absolute top-10 left-10 max-w-sm text-sm text-muted-foreground">{t("boards.emptyBoard")}</p>}
                  {board.data.items.map((it) => {
                    const moving = drag?.id === it.id;
                    return (
                      <div
                        key={it.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={it.id === selectedItem}
                        aria-label={t("boards.edit")}
                        onPointerDown={(e) => onPointerDown(e, it)}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={() => {
                          dragStart.current = null;
                          setDrag(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setSelectedItem(it.id);
                          if (e.key === "Delete" || e.key === "Backspace") {
                            edit((data) => void (data.items = data.items.filter((x) => x.id !== it.id)));
                            setSelectedItem(null);
                          }
                        }}
                        className={cn(
                          "absolute cursor-grab touch-none rounded-lg shadow-md select-none focus-visible:outline-none active:cursor-grabbing",
                          it.id === selectedItem && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                          moving && "opacity-90 shadow-xl",
                        )}
                        style={{
                          left: it.x + (moving ? drag.dx : 0),
                          top: it.y + (moving ? drag.dy : 0),
                          width: it.w,
                          zIndex: moving ? 100_000 : it.z,
                          transform: it.rot ? `rotate(${it.rot}deg)` : undefined,
                        }}
                      >
                        <ItemFace item={it} url={it.imageId ? gallery.urls[it.imageId] : undefined} known={!it.imageId || !gallery.images || gallery.images.some((g) => g.id === it.imageId)} />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Élément choisi : le panneau n'apparaît que pendant qu'on modifie un élément. */}
              {item && (
                <aside className="scrollbar-visible max-h-[50vh] min-h-0 min-w-0 space-y-3 border-t bg-card/40 p-4 xl:max-h-none xl:border-t-0 xl:border-l">
                  <ItemEditor
                    key={item.id}
                    item={item}
                    onChange={(fn) => editItem(item.id, fn)}
                    onFront={() => {
                      const z = topZ(board.data) + 1;
                      editItem(item.id, (it) => void (it.z = z));
                    }}
                    onDelete={() => {
                      edit((data) => void (data.items = data.items.filter((x) => x.id !== item.id)));
                      setSelectedItem(null);
                    }}
                    onClose={() => setSelectedItem(null)}
                  />
                </aside>
              )}
            </div>
          </div>
        )}
      </div>

      {picking &&
        createPortal(
          <Dialog open onOpenChange={(open) => !open && setPicking(false)} className="w-[min(94vw,44rem)]">
            <DialogHeader>
              <DialogTitle>{t("boards.pickImage")}</DialogTitle>
            </DialogHeader>
            <div className="mt-4 max-h-[60vh] overflow-y-auto">
              {gallery.images === null ? (
                <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
                  <LoadingDots className="size-4" />
                  {t("boards.loading")}
                </p>
              ) : gallery.images.length === 0 ? (
                <div className="space-y-3 py-6 text-center">
                  <p className="text-sm text-muted-foreground">{t("boards.noImages")}</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPicking(false);
                      onOpenFeature("gallery");
                    }}
                  >
                    {t("boards.openGallery")}
                  </Button>
                </div>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3">
                  {gallery.images.map((image) => (
                    <GalleryChoice
                      key={image.id}
                      image={image}
                      url={gallery.urls[image.id]}
                      onVisible={() => gallery.want(image.id)}
                      onPick={() => {
                        add("image", { imageId: image.id, text: image.caption ?? "" });
                        setPicking(false);
                      }}
                    />
                  ))}
                </ul>
              )}
            </div>
          </Dialog>,
          document.body,
        )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t("boards.deleteTitle", { name: confirmDelete?.name ?? "" })}
        description={t("boards.deleteBody")}
        confirmLabel={t("boards.delete")}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) await store.remove(projectId, confirmDelete.id);
          setConfirmDelete(null);
          setSelectedItem(null);
          onClose?.();
        }}
      />
    </main>
  );
}

/** Texte d'une planche, pour la recherche et l'aperçu (titres, citations, notes, légendes). */
function boardText(board: BoardEntry): string {
  return board.data.items
    .map((item) => [item.text, item.by].filter(Boolean).join(" — "))
    .filter(Boolean)
    .join(" · ");
}

/** Sans accents ni majuscules, pour chercher « foret » et trouver « Forêt ». */
const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Toutes les planches, présentées comme la liste des notes : recherche,
 * cartes sur trois colonnes (quatre sur un très grand écran). Un clic ouvre
 * la planche dans son onglet.
 */
function BoardsOverview({ projectId, feature, boards, onOpen, onCreate }: { projectId: string; feature: WorkspaceFeature; boards: BoardEntry[]; onOpen: (id: string) => void; onCreate: () => void }) {
  const { t, i18n } = useTranslation("workspaceHome");
  const targets = useLinkTargets(projectId);
  const [query, setQuery] = useState("");
  const needle = fold(query.trim());
  // Éléments liés encore présents (un élément supprimé depuis est ignoré).
  const linkedOf = (board: BoardEntry) => board.data.links.map((link) => targets.find(link)).filter((target): target is LinkTarget => !!target);
  // La recherche trouve aussi une planche par ce qui lui est lié (« Sora », « Chapitre 3 »…).
  const visible = needle ? boards.filter((board) => fold(`${board.name} ${boardText(board)} ${linkedOf(board).map((l) => l.name).join(" ")}`).includes(needle)) : boards;

  return (
    <PageShell
      title={feature.label}
      description={t("boards.countBoards", { count: boards.length })}
      actions={
        <Button onClick={onCreate}>
          <Plus className="size-4" />
          {t("boards.newBoard")}
        </Button>
      }
    >
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("boards.search")} aria-label={t("boards.search")} className="pl-8" />
        </div>
      </div>

      {needle && <FilterResults count={visible.length} onClear={() => setQuery("")} />}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">
          <Lightbulb className="mx-auto mb-3 size-8 opacity-40" />
          {boards.length === 0 ? t("boards.empty") : t("boards.noMatch")}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 min-[112.5rem]:grid-cols-4">
          {visible.map((board) => {
            const colors = board.data.items.flatMap((i) => (i.kind === "palette" ? i.colors : [])).slice(0, 8);
            const text = boardText(board);
            return (
              <li key={board.id}>
                <button
                  type="button"
                  onClick={() => onOpen(board.id)}
                  className="flex h-full min-h-36 w-full flex-col gap-2 rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/40"
                >
                  <span className="flex items-start gap-2">
                    <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="flex-1 font-medium">{board.name}</span>
                  </span>
                  <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">{text || <span className="italic">{t("boards.noText")}</span>}</p>
                  {linkedOf(board).length > 0 && (
                    <span className="flex flex-wrap gap-1">
                      {linkedOf(board).slice(0, 3).map((target) => {
                        const Icon = BOARD_LINK_ICONS[target.kind];
                        return (
                          <span key={`${target.kind}:${target.id}`} className="inline-flex max-w-40 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px]">
                            <Icon className="size-3 shrink-0 text-primary" aria-hidden="true" />
                            <span className="truncate">{target.name}</span>
                          </span>
                        );
                      })}
                      {linkedOf(board).length > 3 && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">{t("boards.links.more", { count: linkedOf(board).length - 3 })}</span>}
                    </span>
                  )}
                  <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-2">
                      {colors.length > 0 && (
                        <span className="flex -space-x-1">
                          {colors.map((color, index) => (
                            <span key={index} className="size-3.5 rounded-full border-2 border-card" style={{ backgroundColor: color }} />
                          ))}
                        </span>
                      )}
                      <span className="truncate">{t("boards.count", { count: board.data.items.length })}</span>
                    </span>
                    <span className="shrink-0">{formatNoteDate(board.updatedAt, i18n.language)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
/** Contenu d'un élément de la planche. */
function ItemFace({ item, url, known }: { item: BoardItem; url: string | undefined; known: boolean }) {
  const { t } = useTranslation("workspaceHome");
  if (item.kind === "image") {
    return (
      <div className="rounded-lg bg-card p-1.5 pb-2">
        {!known ? (
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-md bg-muted text-center text-xs text-muted-foreground">
            <ImageOff className="size-5" aria-hidden="true" />
            {t("boards.imageMissing")}
          </div>
        ) : url ? (
          <img src={url} alt={item.text} draggable={false} className="block w-full rounded-md" />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center rounded-md bg-muted">
            <LoadingDots className="size-5 text-muted-foreground" />
          </div>
        )}
        {item.text && <p className="truncate px-0.5 pt-1.5 text-xs text-muted-foreground">{item.text}</p>}
      </div>
    );
  }
  if (item.kind === "palette") {
    return (
      <div className="space-y-1.5 rounded-lg bg-card p-2">
        <div className="flex gap-1">
          {item.colors.map((color, index) => (
            <div key={index} className="flex h-14 flex-1 items-end justify-center rounded-md pb-1 font-mono text-[9px] text-white/90 uppercase" style={{ background: color }}>
              {color.slice(1)}
            </div>
          ))}
        </div>
        {item.text && <p className="truncate px-0.5 text-xs text-muted-foreground">{item.text}</p>}
      </div>
    );
  }
  if (item.kind === "quote") {
    return (
      <blockquote className="rounded-lg border-l-4 border-primary bg-card px-4 py-3 text-[15px] leading-snug italic">
        « {item.text} »{item.by && <footer className="mt-2 text-xs not-italic text-muted-foreground">{item.by}</footer>}
      </blockquote>
    );
  }
  if (item.kind === "note") {
    return <p className="rounded-lg bg-[#fde68a] px-3.5 py-3 text-sm leading-snug whitespace-pre-wrap text-[#3d2e00]">{item.text}</p>;
  }
  return <p className="rounded-full bg-foreground px-4 py-1.5 text-center text-sm font-semibold text-background">{item.text}</p>;
}

/** Réglages de l'élément choisi. */
function ItemEditor({
  item,
  onChange,
  onFront,
  onDelete,
  onClose,
}: {
  item: BoardItem;
  onChange: (fn: (it: BoardItem) => void) => void;
  onFront: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation("workspaceHome");
  const { t: tc } = useTranslation("common");
  const { t: tch } = useTranslation("characters");
  const { t: tst } = useTranslation("structure");
  const textLabel = item.kind === "image" || item.kind === "palette" ? t("boards.caption") : t("boards.text");

  // Échap ferme le panneau (sauf pendant une saisie).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "Escape" && !["INPUT", "TEXTAREA"].includes(target.tagName)) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const KindIcon = KIND_ICONS[item.kind];
  const setWidth = (w: number) => onChange((it) => void (it.w = Math.min(MAX_ITEM_WIDTH, Math.max(MIN_ITEM_WIDTH, w))));
  const setTilt = (rot: number) => onChange((it) => void (it.rot = Math.round(Math.min(6, Math.max(-6, rot)) * 10) / 10));

  return (
    <div className="space-y-5">
      {/* En-tête : sorte d'élément, fermer */}
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <KindIcon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{t("boards.edit")}</p>
          <h2 className="truncate text-sm font-semibold">{t(`boards.kinds.${item.kind}`)}</h2>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={tc("actions.close")} title={`${tc("actions.close")} (Échap)`}>
          <X />
        </Button>
      </div>

      {/* Contenu */}
      <section className="space-y-3">
        <p className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{t("boards.content")}</p>
        <label className="block space-y-1.5 text-xs font-medium">
          {textLabel}
          {item.kind === "quote" || item.kind === "note" ? (
            <textarea
              rows={4}
              maxLength={2000}
              value={item.text}
              placeholder={t(`boards.defaults.${item.kind === "quote" ? "quote" : "note"}`)}
              onChange={(e) => onChange((it) => void (it.text = e.target.value))}
              className={cn(fieldClass, "resize-y py-2 font-normal")}
            />
          ) : (
            <input
              value={item.text}
              maxLength={2000}
              placeholder={item.kind === "label" ? t("boards.defaults.label") : t("boards.captionPlaceholder")}
              onChange={(e) => onChange((it) => void (it.text = e.target.value))}
              className={cn(fieldClass, "h-9 font-normal")}
            />
          )}
        </label>
        {item.kind === "quote" && (
          <label className="block space-y-1.5 text-xs font-medium">
            {t("boards.author")}
            <input
              value={item.by}
              maxLength={200}
              placeholder={t("boards.authorPlaceholder")}
              onChange={(e) => onChange((it) => void (it.by = e.target.value))}
              className={cn(fieldClass, "h-9 font-normal")}
            />
          </label>
        )}
        {item.kind === "palette" && (
          // Comme la palette d'une fiche personnage : pastilles, « × » au survol,
          // « + » propose des couleurs puis « Autre couleur… ».
          <div className="flex flex-wrap items-center gap-2">
            {item.colors.map((color, index) => (
              <span key={`${color}-${index}`} className="group relative">
                <span className="block size-9 rounded-full border shadow-sm" style={{ backgroundColor: color }} title={color} />
                {item.colors.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onChange((it) => void it.colors.splice(index, 1))}
                    aria-label={tch("colors.remove", { color })}
                    className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border bg-background opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <X className="size-2.5" />
                  </button>
                )}
              </span>
            ))}
            {item.colors.length < MAX_COLORS && (
              <ColorMenu
                id={`board-palette-${item.id}`}
                label={tch("colors.add")}
                options={COLOR_CHOICES.filter((color) => !item.colors.includes(color)).map((color) => ({ value: color, swatch: color, label: color }))}
                value={null}
                onSelect={(color) => color && !item.colors.includes(color) && onChange((it) => void it.colors.push(color))}
                custom={{ label: tst("colors.custom") }}
                trigger={
                  <span className="flex size-9 items-center justify-center rounded-full border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary">
                    <Plus className="size-4" />
                  </span>
                }
                triggerClassName="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            )}
          </div>
        )}
      </section>

      {/* Disposition */}
      <section className="space-y-3">
        <p className="text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">{t("boards.layout")}</p>
        <div className="flex items-center gap-2">
          <span className="flex-1 text-xs font-medium">{t("boards.width")}</span>
          <NumberStepper
            value={item.w}
            min={MIN_ITEM_WIDTH}
            max={MAX_ITEM_WIDTH}
            step={20}
            format={(w) => `${w} px`}
            aria-label={t("boards.width")}
            decreaseLabel={t("boards.narrower")}
            increaseLabel={t("boards.wider")}
            onChange={(w) => w !== null && setWidth(w)}
            size="sm"
            valueClassName="w-16"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="flex-1 text-xs font-medium">{t("boards.rotation")}</span>
          <NumberStepper
            value={item.rot}
            min={-6}
            max={6}
            step={1}
            format={(r) => `${r > 0 ? "+" : ""}${r}°`}
            aria-label={t("boards.rotation")}
            decreaseLabel={t("boards.tiltLeft")}
            increaseLabel={t("boards.tiltRight")}
            onChange={(r) => r !== null && setTilt(r)}
            size="sm"
            valueClassName="w-16"
          />
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={onFront}>
          <ArrowUpToLine />
          {t("boards.bringFront")}
        </Button>
      </section>

      <Button variant="ghost" size="sm" onClick={onDelete} className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive">
        <Trash2 />
        {t("boards.deleteItem")}
      </Button>
    </div>
  );
}

const KIND_ICONS: Record<BoardItemKind, typeof Quote> = { image: ImagePlus, palette: Palette, quote: Quote, note: StickyNote, label: Heading };

/** Une image de la galerie dans la fenêtre de choix (chargée quand elle approche). */
function GalleryChoice({ image, url, onVisible, onPick }: { image: ProjectImage; url: string | undefined; onVisible: () => void; onPick: () => void }) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onVisible(), { rootMargin: "200px" });
    observer.observe(element);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <li ref={ref}>
      <button
        type="button"
        onClick={onPick}
        title={image.caption ?? undefined}
        className="block aspect-square w-full overflow-hidden rounded-lg bg-muted shadow-sm hover:ring-2 hover:ring-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {url ? (
          <img src={url} alt={image.caption ?? ""} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center">
            <LoadingDots className="size-4 text-muted-foreground" />
          </span>
        )}
      </button>
    </li>
  );
}
