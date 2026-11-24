import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  BadgeCheck,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  ImagePlus,
  Images,
  MoreHorizontal,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { LoadingDots } from "@/components/common/LoadingDots";
import { ImageDialog } from "@/components/common/ImageDialog";
import { ImageDownloadButton } from "@/components/common/ImageDownloadButton";
import { SEGMENTED_GROUP, SEGMENTED_ITEM, SEGMENTED_ON } from "@/components/common/segmented";
import { useConfirmImageRemoval } from "@/components/common/useConfirmImageRemoval";
import { ActionMenu } from "@/components/documents/ActionMenu";
import { ConfirmDialog } from "@/components/notes/ConfirmDialog";
import { useFolderOptions } from "@/components/notes/FolderSelect";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { errorText } from "@/lib/errors";
import { folderAndDescendants } from "@/lib/notes";
import { notifyError, notifySaved } from "@/lib/notify";
import { GALLERY_MAX_SIDE, PORTRAIT_ACCEPT, PortraitError, preparePortrait } from "@/lib/portraitImage";
import { cn } from "@/lib/utils";
import { useProjectLogo, useProjectLogoStore } from "@/stores/projectLogoStore";
import type { GalleryFolder, ProjectImage } from "@/types";
import { sessionMap } from "@/lib/sessionCache";

/** Nombre maximal d'images par dossier, « Sans dossier » compris (le même que côté Rust, `MAX_GALLERY_IMAGES`). */
export const MAX_PER_FOLDER = 30;

/** Longueurs maximales (les mêmes que côté Rust). */
const MAX = { caption: 200, description: 2000, folder: 100 } as const;

/** Onglet affiché : toutes les photos, ou les dossiers (comme l'app Photos de l'iPhone). */
type Tab = "photos" | "folders";
const TAB_KEY = "ganis.gallery.tab";

function loadTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === "folders" ? "folders" : "photos";
  } catch {
    return "photos";
  }
}

/** Dossier ouvert dans l'onglet « Dossiers » : aucun (la liste), « Sans dossier », ou un dossier. */
const NO_FOLDER = "__none__";
/**
 * Dossier système « Logo » : le logo du projet (une seule image), affiché sur
 * l'accueil du projet à côté de son nom. Comme « Sans dossier », il ne se
 * renomme pas et ne se supprime pas.
 */
const LOGO = "__logo__";

/** Ce qu'on glisse : une image ou un dossier (identifiant). */
type Dragged = { kind: "image"; id: string } | { kind: "folder"; id: string };

/** Images déjà chargées (par identifiant), gardées le temps de la session. */
const urlCache = sessionMap<string, string>();
const inflight = new Set<string>();

/** Déplace `id` juste avant `beforeId` (ou à la fin si `beforeId` est nul). */
export function moveBefore(ids: string[], id: string, beforeId: string | null): string[] {
  const rest = ids.filter((other) => other !== id);
  const index = beforeId === null ? rest.length : rest.indexOf(beforeId);
  if (index < 0) return ids;
  return [...rest.slice(0, index), id, ...rest.slice(index)];
}

/** Chemin d'un dossier (« Cartes › Le Nord »), de la racine jusqu'à lui. */
export function folderPath(folders: Pick<GalleryFolder, "id" | "parentId" | "name">[], id: string | null): string[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: string[] = [];
  const seen = new Set<string>();
  let current = id ? byId.get(id) : undefined;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

const byName = (a: GalleryFolder, b: GalleryFolder) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });

/**
 * Galerie du projet (Détails › Galerie), comme l'app Photos de l'iPhone :
 *
 * - « Photos » (par défaut) : toutes les images, en grille, sans rien
 *   d'autre que les images ;
 * - « Dossiers » : un dossier par carte (sa première photo en couverture,
 *   son nom, son nombre d'images). Un clic l'ouvre : ses sous-dossiers,
 *   puis ses photos ; « Retour » remonte d'un niveau.
 *
 * Un clic sur une photo l'ouvre en grand, avec son nom, sa description et
 * son dossier. On range en glissant une photo sur un dossier, ou sur une
 * autre photo pour la placer avant elle. Tout est enregistré tout de suite.
 */
export function ProjectGalleryBoard({ projectId }: { projectId: string }) {
  const { t } = useTranslation("workspaceHome");
  const { t: tc } = useTranslation("characters");

  const [images, setImages] = useState<ProjectImage[]>([]);
  const [folders, setFolders] = useState<GalleryFolder[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>(loadTab);
  /** Onglet « Dossiers » : `null` = la liste des dossiers ; `NO_FOLDER` ; ou un dossier. */
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragged, setDragged] = useState<Dragged | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [fileOver, setFileOver] = useState(false);
  /** Fenêtre du nom d'un dossier : création (dans `parentId`) ou renommage. */
  const [naming, setNaming] = useState<{ kind: "new" } | { kind: "rename"; folder: GalleryFolder } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<GalleryFolder | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const logo = useProjectLogo(projectId) ?? null;
  const fetchLogo = useProjectLogoStore((state) => state.fetchLogo);
  const storeLogo = useProjectLogoStore((state) => state.setLogo);
  const [viewingLogo, setViewingLogo] = useState(false);

  const showError = (e: unknown) =>
    notifyError(e instanceof PortraitError ? tc(`portrait.errors.${e.code}`) : errorText(e), `gallery:${projectId}`);

  function chooseTab(next: Tab) {
    setTab(next);
    setOpenFolder(null);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // Pas de stockage : le choix vaut pour cette séance.
    }
  }

  // --- Chargement --------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    setImages([]);
    setFolders([]);
    setLoaded(false);
    Promise.all([api.listProjectGallery(projectId), api.listGalleryFolders(projectId)])
      .then(([list, folderList]) => {
        if (cancelled) return;
        setImages(list);
        setFolders(folderList);
        setLoaded(true);
      })
      .catch((e) => !cancelled && showError(e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Contenu des images, une par une.
  useEffect(() => {
    for (const image of images) {
      if (urls[image.id] || inflight.has(image.id)) continue;

      const cached = urlCache.get(image.id);
      if (cached) {
        setUrls((current) => ({ ...current, [image.id]: cached }));
        continue;
      }

      inflight.add(image.id);
      api
        .getProjectGalleryImage(projectId, image.id)
        .then((data) => {
          const url = `data:${data.mime};base64,${data.data}`;
          urlCache.set(image.id, url);
          setUrls((current) => ({ ...current, [image.id]: url }));
        })
        .catch(() => {})
        .finally(() => inflight.delete(image.id));
    }
  }, [images, projectId, urls]);

  // Logo du projet (dossier « Logo »).
  useEffect(() => {
    fetchLogo(projectId).catch((e) => showError(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, fetchLogo]);

  // Dossier ouvert qui n'existe plus (supprimé) : retour à la liste des dossiers.
  useEffect(() => {
    if (openFolder && openFolder !== NO_FOLDER && openFolder !== LOGO && !folders.some((folder) => folder.id === openFolder)) setOpenFolder(null);
  }, [folders, openFolder]);

  // --- Contenu affiché ---------------------------------------------------------

  const current = openFolder && openFolder !== NO_FOLDER && openFolder !== LOGO ? (folders.find((folder) => folder.id === openFolder) ?? null) : null;
  const inLogo = tab === "folders" && openFolder === LOGO;
  /** Dossiers affichés en cartes (un seul niveau : pas de sous-dossiers), dans la liste des dossiers. */
  const folderCards = tab === "folders" && openFolder === null ? [...folders].sort(byName) : [];
  /** Photos affichées. */
  const visible =
    tab === "photos"
      ? images
      : openFolder === null || openFolder === LOGO
        ? []
        : openFolder === NO_FOLDER
          ? images.filter((image) => !image.folderId)
          : images.filter((image) => image.folderId === openFolder);
  const withoutFolder = images.filter((image) => !image.folderId);
  /** Nombre d'images d'un dossier (`null` : « Sans dossier »). */
  const countIn = (folderId: string | null) => images.filter((image) => (image.folderId ?? null) === folderId).length;
  /** Dossier où vont les photos ajoutées : celui qui est ouvert. */
  const addTarget = current?.id ?? null;
  /** Le dossier où vont les ajouts est plein (30 images par dossier). */
  const full = countIn(addTarget) >= MAX_PER_FOLDER;

  const title =
    tab === "photos"
      ? t("gallery.tabs.photos")
      : openFolder === null
        ? t("gallery.tabs.folders")
        : openFolder === NO_FOLDER
          ? t("gallery.root")
          : openFolder === LOGO
            ? t("gallery.logo")
            : (current?.name ?? "");

  /** « Retour » : au dossier parent, ou à la liste des dossiers. */
  function back() {
    setOpenFolder(null);
  }
  const backLabel = t("gallery.tabs.folders");

  // --- Actions : images --------------------------------------------------------

  async function add(files: File[]) {
    const room = MAX_PER_FOLDER - countIn(addTarget);
    if (room <= 0) {
      notifyError(t("gallery.full", { max: MAX_PER_FOLDER }), `gallery:${projectId}`);
      return;
    }
    setBusy(true);
    try {
      for (const file of files.filter((f) => f.type.startsWith("image/")).slice(0, room)) {
        const { data, mime } = await preparePortrait(file, GALLERY_MAX_SIDE);
        // Le nom du fichier, sans son extension, sert de nom tant qu'on ne le change pas.
        const name = file.name.replace(/\.[^.]+$/, "").slice(0, MAX.caption) || null;
        const image = await api.addProjectGalleryImage(projectId, data, name, addTarget);
        const url = `data:${mime};base64,${data}`;
        urlCache.set(image.id, url);
        setUrls((current) => ({ ...current, [image.id]: url }));
        setImages((current) => [...current, image]);
      }
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }

  async function reorder(nextIds: string[]) {
    const previous = images;
    const byId = new Map(images.map((image) => [image.id, image]));
    setImages(nextIds.map((id) => byId.get(id)!).filter(Boolean));
    try {
      await api.reorderProjectGallery(projectId, nextIds);
    } catch (e) {
      setImages(previous);
      showError(e);
    }
  }

  /** Range une image dans un dossier (`null` : sans dossier). */
  async function moveImage(id: string, folderId: string | null) {
    const image = images.find((item) => item.id === id);
    if (!image || image.folderId === folderId) return;
    setImages((current) => current.map((item) => (item.id === id ? { ...item, folderId } : item)));
    try {
      await api.moveProjectGalleryImages(projectId, [id], folderId);
    } catch (e) {
      setImages((current) => current.map((item) => (item.id === id ? image : item)));
      showError(e);
    }
  }

  async function update(id: string, details: { caption: string | null; description: string | null; folderId: string | null }) {
    const saved = await api.updateProjectGalleryImage(projectId, id, { caption: details.caption, description: details.description });
    setImages((current) => current.map((image) => (image.id === id ? { ...saved, folderId: image.folderId } : image)));
    if (details.folderId !== (images.find((image) => image.id === id)?.folderId ?? null)) await moveImage(id, details.folderId);
    notifySaved(t("gallery.saved"), `gallery:${projectId}`);
  }

  async function remove(id: string) {
    try {
      await api.deleteProjectGalleryImage(projectId, id);
      urlCache.delete(id);
      setImages((current) => current.filter((image) => image.id !== id));
    } catch (e) {
      showError(e);
    }
  }

  // --- Actions : logo (une seule image) -----------------------------------------

  async function setLogoFile(file: File) {
    setBusy(true);
    try {
      const { data } = await preparePortrait(file, GALLERY_MAX_SIDE);
      const saved = await api.setProjectLogo(projectId, data);
      storeLogo(projectId, `data:${saved.mime};base64,${saved.data}`);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }

  async function removeLogo() {
    try {
      await api.removeProjectLogo(projectId);
      storeLogo(projectId, null);
    } catch (e) {
      showError(e);
    }
  }

  // --- Actions : dossiers ------------------------------------------------------

  async function saveFolderName(name: string) {
    if (!naming) return;
    try {
      if (naming.kind === "new") {
        const folder = await api.createGalleryFolder(projectId, null, name);
        setFolders((current) => [...current, folder]);
      } else {
        const folder = await api.renameGalleryFolder(projectId, naming.folder.id, name);
        setFolders((current) => current.map((item) => (item.id === folder.id ? folder : item)));
      }
      setNaming(null);
    } catch (e) {
      showError(e);
    }
  }

  async function deleteFolder(id: string) {
    const removed = folderAndDescendants(folders as never, id);
    try {
      await api.deleteGalleryFolder(projectId, id);
      setFolders((current) => current.filter((folder) => !removed.has(folder.id)));
      setImages((current) => current.map((image) => (image.folderId && removed.has(image.folderId) ? { ...image, folderId: null } : image)));
    } catch (e) {
      showError(e);
    }
  }

  // --- Glisser-déposer ---------------------------------------------------------

  const isFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

  function onZoneDragOver(event: DragEvent) {
    if (!isFiles(event) || busy || (full && !inLogo)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setFileOver(true);
  }

  function onZoneDrop(event: DragEvent) {
    setFileOver(false);
    if (!isFiles(event)) return;
    event.preventDefault();
    const files = [...event.dataTransfer.files];
    if (inLogo) {
      const file = files.find((f) => f.type.startsWith("image/"));
      if (file) void setLogoFile(file);
      return;
    }
    void add(files);
  }

  // --- Affichage ---------------------------------------------------------------

  const openIndex = openId ? visible.findIndex((image) => image.id === openId) : -1;
  const opened = openIndex >= 0 ? visible[openIndex] : null;

  // Photo ouverte qui quitte la vue (rangée dans un autre dossier, supprimée) :
  // sa fenêtre est fermée pour de bon (elle ne se rouvrira pas plus tard).
  useEffect(() => {
    if (openId && openIndex < 0) setOpenId(null);
  }, [openId, openIndex]);
  const insideFolder = tab === "folders" && openFolder !== null;

  return (
    <div
      className="space-y-4"
      data-testid="project-gallery"
      onDragOver={onZoneDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setFileOver(false);
      }}
      onDrop={onZoneDrop}
    >
      {/* Une seule ligne : Photos / Dossiers, puis le titre (et le retour dans un dossier) avec le nombre d'images, puis les actions. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className={SEGMENTED_GROUP} role="tablist" aria-label={t("gallery.view")}>
          {(
            [
              ["photos", Images],
              ["folders", Folder],
            ] as const
          ).map(([value, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => chooseTab(value)}
              className={cn(SEGMENTED_ITEM, tab === value && SEGMENTED_ON)}
            >
              <Icon />
              {t(`gallery.tabs.${value}`)}
            </button>
          ))}
        </div>

        {/* Sur la même ligne : « ‹ Dossiers » (dans un dossier), le titre et le nombre d'images.
            Largeur minimale : s'il n'y a pas la place, ce groupe passe à la ligne au lieu d'être écrasé. */}
        <div className="flex min-w-[14rem] flex-1 items-center gap-2">
          {insideFolder && (
            <Button variant="ghost" size="sm" onClick={back} className="-ml-1 shrink-0 text-primary hover:text-primary" aria-label={t("gallery.backTo", { name: backLabel })}>
              <ChevronLeft />
              {backLabel}
            </Button>
          )}
          <h3 className="min-w-0 truncate text-base font-semibold" data-testid="gallery-place">
            {title}
          </h3>
          {/* Photos : le total ; dossier ouvert : son compte « 12 / 30 » (il n'est pas sur la carte). */}
          {tab === "photos" && <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{t("gallery.total", { count: images.length })}</span>}
          {insideFolder && (
            <span className="shrink-0 text-sm text-muted-foreground tabular-nums" data-testid="gallery-folder-count">
              {inLogo
                ? t("gallery.logoCount", { count: logo ? 1 : 0 })
                : t("gallery.folderCount", { count: visible.length, max: MAX_PER_FOLDER })}
            </span>
          )}
        </div>

        {tab === "folders" && openFolder === null && (
          <Button variant="outline" onClick={() => setNaming({ kind: "new" })}>
            <FolderPlus />
            {t("gallery.newFolder")}
          </Button>
        )}
        {/* « Photos » ou un dossier ouvert : ajouter des images (dans ce dossier) ; liste des dossiers : seulement créer des dossiers. */}
        {/* Dossier « Logo » : une seule image, qu'on ajoute ou qu'on remplace. */}
        {inLogo && (
          <Button onClick={() => logoInputRef.current?.click()} disabled={busy}>
            {busy ? <LoadingDots /> : <ImagePlus />}
            {logo ? t("gallery.replaceLogo") : t("gallery.addLogo")}
          </Button>
        )}
        {(tab === "photos" || (insideFolder && !inLogo)) && (
          <Button onClick={() => inputRef.current?.click()} disabled={busy || full} title={full ? t("gallery.full", { max: MAX_PER_FOLDER }) : undefined}>
            {busy ? <LoadingDots /> : <ImagePlus />}
            {t("gallery.add")}
          </Button>
        )}
      </div>

      {!loaded ? (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground" role="status">
          <LoadingDots className="size-4" />
          {t("gallery.loading")}
        </p>
      ) : images.length === 0 && folders.length === 0 && tab === "photos" ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-16 text-center transition-colors hover:border-primary hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            fileOver && "border-primary bg-primary/5",
          )}
        >
          <ImagePlus className="size-8 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium">{t("gallery.emptyTitle")}</span>
          <span className="max-w-md text-sm text-muted-foreground">{t("gallery.emptyHint")}</span>
        </button>
      ) : (
        <div className={cn("space-y-6 rounded-xl transition-shadow", fileOver && "ring-2 ring-primary ring-offset-4 ring-offset-background")}>
          {/* Dossiers en cartes (onglet « Dossiers ») */}
          {tab === "folders" && openFolder === null && (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-4 gap-y-5" aria-label={t("gallery.folders")}>
              {/* « Logo » : dossier système, toujours là, en premier. */}
              <li>
                <FolderCard name={t("gallery.logo")} icon={BadgeCheck} onOpen={() => setOpenFolder(LOGO)} />
              </li>
              {/* « Sans dossier » : les photos pas encore rangées (liste des dossiers seulement), en premier. */}
              {withoutFolder.length > 0 && (
                <li>
                  <FolderCard
                    name={t("gallery.root")}
                    muted
                    onOpen={() => setOpenFolder(NO_FOLDER)}
                  />
                </li>
              )}
              {folderCards.map((folder) => {
                return (
                  <li key={folder.id}>
                    <FolderCard
                      name={folder.name}
                      onOpen={() => setOpenFolder(folder.id)}
                      menu={
                        <ActionMenu
                          label={t("gallery.folderActions", { name: folder.name })}
                          trigger={<MoreHorizontal className="size-4" />}
                          items={[
                            { id: "rename", label: t("gallery.rename"), icon: Pencil, run: () => setNaming({ kind: "rename", folder }) },
                            { id: "delete", label: t("gallery.deleteFolder"), icon: Trash2, danger: true, separated: true, run: () => setConfirmDelete(folder) },
                          ]}
                        />
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}

          {tab === "folders" && openFolder === null && folders.length === 0 && (
            <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">{t("gallery.emptyFolders")}</p>
          )}

          {/* Dossier « Logo » : le logo seul (entier, jamais rogné), ou une invitation à l'ajouter. */}
          {inLogo &&
            (logo ? (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-4 gap-y-5" aria-label={t("gallery.logo")}>
                <li>
                  <button
                    type="button"
                    onClick={() => setViewingLogo(true)}
                    aria-label={t("gallery.viewLogo")}
                    className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl bg-muted/40 p-3 shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <img src={logo} alt="" draggable={false} className="max-h-full max-w-full object-contain" data-testid="gallery-logo" />
                  </button>
                </li>
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">{t("gallery.emptyLogo")}</p>
            ))}

          {/* Photos seules, dans la même grille que les dossiers (même taille). */}
          {(tab === "photos" || (openFolder !== null && openFolder !== LOGO)) &&
            (visible.length > 0 ? (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-4 gap-y-5" aria-label={t("gallery.label")}>
                {visible.map((image) => {
                  const marked = overId === image.id && dragged?.kind === "image" && dragged.id !== image.id;
                  return (
                    <li
                      key={image.id}
                      draggable
                      onDragStart={(event) => {
                        setDragged({ kind: "image", id: image.id });
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", image.id);
                      }}
                      onDragEnd={() => {
                        setDragged(null);
                        setOverId(null);
                      }}
                      onDragOver={(event) => {
                        if (dragged?.kind !== "image" || isFiles(event)) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        if (overId !== image.id) setOverId(image.id);
                      }}
                      onDrop={(event) => {
                        if (dragged?.kind !== "image" || isFiles(event)) return;
                        event.preventDefault();
                        event.stopPropagation();
                        if (dragged.id !== image.id) void reorder(moveBefore(images.map((item) => item.id), dragged.id, image.id));
                        setDragged(null);
                        setOverId(null);
                      }}
                      className={cn(
                        "group relative transition-opacity",
                        dragged?.kind === "image" && dragged.id === image.id && "opacity-40",
                        // Repère : la photo glissée se placera avant celle-ci.
                        marked && "before:absolute before:inset-y-0 before:-left-2.5 before:z-10 before:w-1 before:rounded-full before:bg-primary",
                      )}
                    >
                      <PhotoTile image={image} url={urls[image.id] ?? null} position={images.indexOf(image) + 1} onOpen={() => setOpenId(image.id)} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
                {current ? t("gallery.emptyFolder") : t("gallery.emptyRoot")}
              </p>
            ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={PORTRAIT_ACCEPT}
        multiple
        data-testid="gallery-images-input"
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length) void add(files);
        }}
      />

      <input
        ref={logoInputRef}
        type="file"
        accept={PORTRAIT_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="gallery-logo-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void setLogoFile(file);
        }}
      />

      {viewingLogo && logo && (
        <ImageDialog
          open
          onClose={() => setViewingLogo(false)}
          projectId={projectId}
          url={logo}
          name={t("gallery.logo")}
          onReplace={(file) => void setLogoFile(file)}
          onRemove={() => removeLogo()}
        />
      )}

      {opened && (
        <GalleryImageDialog
          key={opened.id}
          image={opened}
          url={urls[opened.id] ?? null}
          folders={folders}
          isFull={(folderId) => countIn(folderId) >= MAX_PER_FOLDER}
          index={openIndex}
          total={visible.length}
          onClose={() => setOpenId(null)}
          onNavigate={(direction) => setOpenId(visible[openIndex + direction]?.id ?? opened.id)}
          onSave={(details) => update(opened.id, details)}
          onRemove={async () => {
            const next = visible[openIndex + 1] ?? visible[openIndex - 1] ?? null;
            await remove(opened.id);
            setOpenId(next?.id ?? null);
          }}
        />
      )}

      {naming && (
        <FolderNameDialog
          title={naming.kind === "new" ? t("gallery.newFolder") : t("gallery.renameFolder")}
          initial={naming.kind === "rename" ? naming.folder.name : ""}
          submitLabel={naming.kind === "new" ? t("gallery.create") : t("gallery.rename")}
          onCancel={() => setNaming(null)}
          onSubmit={(name) => saveFolderName(name)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t("gallery.deleteFolderTitle", { name: confirmDelete?.name ?? "" })}
        description={t("gallery.deleteFolderBody")}
        confirmLabel={t("gallery.deleteFolder")}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) await deleteFolder(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Cartes et tuiles
// ----------------------------------------------------------------------------

/** Nombre tiré d'un texte (toujours le même pour un même texte). */
function hashOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Une forme de l'image d'un dossier (dans un carré de 100 × 100). */
export interface FolderShape {
  kind: "circle" | "square" | "ring";
  x: number;
  y: number;
  size: number;
  rotate: number;
  hue: number;
  opacity: number;
}

/**
 * Image par défaut d'un dossier, générée à partir de son nom : un dégradé
 * et quelques formes (cercles, carrés, anneaux), avec des couleurs et des
 * positions tirées du nom. Deux dossiers aux noms différents ont des
 * images différentes ; un même nom donne toujours la même image.
 */
export function folderArt(name: string): { hue: number; shapes: FolderShape[] } {
  let seed = hashOf(name.trim().toLowerCase()) || 1;
  // Suite pseudo-aléatoire déterministe (xorshift).
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  // Teintes proches du thème (bleus, indigos, violets), jamais criardes.
  const hue = 215 + Math.floor(next() * 70);
  const kinds: FolderShape["kind"][] = ["circle", "square", "ring"];
  const shapes = Array.from({ length: 4 }, (_, index) => ({
    kind: kinds[Math.floor(next() * kinds.length)],
    x: 10 + next() * 80,
    y: 8 + next() * 70,
    size: 18 + next() * (index === 0 ? 42 : 26),
    rotate: Math.floor(next() * 90),
    hue: hue + Math.floor(next() * 40) - 20,
    opacity: 0.35 + next() * 0.4,
  }));
  return { hue, shapes };
}

/** Image générée d'un dossier (voir `folderArt`) ; grise pour « Sans dossier ». */
function FolderArt({ name, muted }: { name: string; muted?: boolean }) {
  const { hue, shapes } = folderArt(name);
  // Peu saturées : elles accompagnent le thème sans s'en éloigner.
  const color = (h: number, l: number) => (muted ? `hsl(220 8% ${l}%)` : `hsl(${h} 32% ${l}%)`);
  const gradientId = `folder-art-${hashOf(name)}${muted ? "-muted" : ""}`;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="size-full" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={color(hue, 62)} />
          <stop offset="1" stopColor={color(hue + 15, 46)} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${gradientId})`} />
      {shapes.map((shape, index) => {
        const fill = color(shape.hue, 78);
        const common = { opacity: shape.opacity, transform: `rotate(${shape.rotate} ${shape.x} ${shape.y})` };
        if (shape.kind === "circle") return <circle key={index} cx={shape.x} cy={shape.y} r={shape.size / 2} fill={fill} {...common} />;
        if (shape.kind === "ring")
          return <circle key={index} cx={shape.x} cy={shape.y} r={shape.size / 2} fill="none" stroke={fill} strokeWidth={shape.size / 7} {...common} />;
        return (
          <rect key={index} x={shape.x - shape.size / 2} y={shape.y - shape.size / 2} width={shape.size} height={shape.size} rx={shape.size / 6} fill={fill} {...common} />
        );
      })}
    </svg>
  );
}

/**
 * Carte d'un dossier (onglet « Dossiers ») : une image générée à partir de
 * son nom, et son nom écrit dedans, en bas. Un clic l'ouvre (le nombre
 * d'images s'affiche alors à côté de son titre) ; le menu … le renomme ou
 * le supprime.
 */
function FolderCard({
  name,
  icon: Icon = Folder,
  muted,
  menu,
  onOpen,
}: {
  name: string;
  /** Icône à côté du nom (dossier par défaut ; « Logo » a la sienne). */
  icon?: typeof Folder;
  muted?: boolean;
  menu?: ReactNode;
  onOpen: () => void;
}) {
  const { t } = useTranslation("workspaceHome");
  return (
    <div className="group/folder relative">
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("gallery.openFolder", { name })}
        className={cn(
          "relative block aspect-square w-full overflow-hidden rounded-xl text-left shadow-sm transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        )}
      >
        <FolderArt name={name} muted={muted} />
        {/* Le nom, dans la carte, sur un léger dégradé pour rester lisible. */}
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/60 to-transparent px-3 pt-8 pb-2.5 text-white">
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate text-sm font-semibold drop-shadow-sm">{name}</span>
        </span>
      </button>
      {menu && (
        <div className="absolute top-1.5 right-1.5 rounded-full bg-background/90 opacity-0 shadow-sm transition-opacity group-hover/folder:opacity-100 group-focus-within/folder:opacity-100">
          {menu}
        </div>
      )}
    </div>
  );
}

/** Une photo seule (carrée), avec une icône d'image et son nom en bas (coupé s'il est trop long). Un clic l'ouvre. */
function PhotoTile({ image, url, position, onOpen }: { image: ProjectImage; url: string | null; position: number; onOpen: () => void }) {
  const { t } = useTranslation("workspaceHome");
  const name = image.caption || t("gallery.untitled");

  return (
    <button
      type="button"
      onClick={onOpen}
      title={name}
      aria-label={t("gallery.openImage", { name, position })}
      className="relative block aspect-square w-full overflow-hidden rounded-xl bg-muted/50 shadow-sm transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      {url ? (
        <>
          <img src={url} alt="" draggable={false} className="size-full object-cover transition-opacity group-hover:opacity-90" />
          {/* Icône et nom en bas, comme sur les cartes des dossiers. Le nom
              tient sur une ligne, coupé par « … » : il ne sort jamais de l'image
              (le nom complet est dans l'info-bulle). */}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 flex min-w-0 items-center gap-1.5 bg-gradient-to-t from-black/60 to-transparent px-3 pt-8 pb-2.5 text-white" aria-hidden="true">
            <ImageIcon className="size-4 shrink-0 drop-shadow-sm" data-testid="gallery-photo-icon" />
            <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold drop-shadow-sm" data-testid="gallery-photo-name">
              {name}
            </span>
          </span>
        </>
      ) : (
        <span className="flex size-full items-center justify-center">
          <LoadingDots className="size-5 text-muted-foreground" />
        </span>
      )}
    </button>
  );
}

/** Nom d'un dossier (création ou renommage), dans une petite fenêtre. */
function FolderNameDialog({
  title,
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (name: string) => Promise<void>;
}) {
  const { t } = useTranslation("workspaceHome");
  const { t: tc } = useTranslation("common");
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit(name.trim());
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <Dialog open onOpenChange={(next) => !next && !saving && onCancel()} className="w-[min(92vw,26rem)]">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="gallery-folder-name">{t("gallery.folderName")}</Label>
          <Input id="gallery-folder-name" autoFocus value={name} maxLength={MAX.folder} placeholder={t("gallery.folderPlaceholder")} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            {tc("actions.cancel")}
          </Button>
          <Button type="submit" disabled={!name.trim() || saving}>
            {saving && <LoadingDots />}
            {submitLabel}
          </Button>
        </div>
      </form>
    </Dialog>,
    document.body,
  );
}

// ----------------------------------------------------------------------------
// Fenêtre d'une image
// ----------------------------------------------------------------------------

interface GalleryImageDialogProps {
  image: ProjectImage;
  url: string | null;
  folders: GalleryFolder[];
  /** Le dossier est plein (`null` : « Sans dossier ») : on ne peut pas y ranger l'image. */
  isFull: (folderId: string | null) => boolean;
  /** Place de l'image parmi celles affichées (0 = première). */
  index: number;
  total: number;
  onClose: () => void;
  onNavigate: (direction: -1 | 1) => void;
  onSave: (details: { caption: string | null; description: string | null; folderId: string | null }) => Promise<void>;
  onRemove: () => Promise<void>;
}

/**
 * Une image en grand avec ses informations : nom, dossier et description,
 * modifiables (« Modifier ») ; précédente / suivante (← →) ; supprimer. Passer à une autre image enregistre ce qui a été modifié.
 */
function GalleryImageDialog({ image, url, folders, isFull, index, total, onClose, onNavigate, onSave, onRemove }: GalleryImageDialogProps) {
  const { t } = useTranslation("workspaceHome");
  const { t: tc } = useTranslation("common");
  const [caption, setCaption] = useState(image.caption ?? "");
  const [folderId, setFolderId] = useState(image.folderId ?? "");
  const [description, setDescription] = useState(image.description ?? "");
  const [saving, setSaving] = useState(false);
  /** Formulaire (nom, dossier, description) : caché par défaut, la photo prend toute la place. */
  const [editing, setEditing] = useState(false);
  const removal = useConfirmImageRemoval(() => onRemove());
  const folderOptions = useFolderOptions(folders as never);
  const name = image.caption || t("gallery.untitled");

  const dirty = caption.trim() !== (image.caption ?? "") || folderId !== (image.folderId ?? "") || description.trim() !== (image.description ?? "");

  /** Enregistre ce qui a changé ; `false` si l'enregistrement a échoué. */
  async function save(): Promise<boolean> {
    if (!dirty) return true;
    setSaving(true);
    try {
      await onSave({ caption: caption.trim() || null, description: description.trim() || null, folderId: folderId || null });
      return true;
    } catch (e) {
      notifyError(errorText(e), "gallery:image");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function go(direction: -1 | 1) {
    if (await save()) onNavigate(direction);
  }

  // ← → : image précédente / suivante (hors saisie).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
      if (event.key === "ArrowLeft" && index > 0) void go(-1);
      if (event.key === "ArrowRight" && index < total - 1) void go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void save();
  }


  return createPortal(
    <>
      <Dialog open onOpenChange={(next) => !next && !saving && onClose()} className="relative w-[min(96vw,84rem)] max-w-[min(96vw,84rem)] overflow-hidden">
        <DialogHeader>
          <div className="flex min-h-6 items-center gap-3 pr-10">
            <DialogTitle className="truncate">{name}</DialogTitle>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t("gallery.position", { index: index + 1, total })}</span>
            {/* Télécharger l'image (fenêtre « Enregistrer sous », avec son nom). */}
            {url && <ImageDownloadButton url={url} name={name} className="ml-auto shrink-0" />}
            {/* Afficher le formulaire pour modifier (nom, dossier, description). */}
            <Button
              type="button"
              variant={editing ? "secondary" : "outline"}
              size="sm"
              aria-pressed={editing}
              onClick={() => setEditing((value) => !value)}
              className={cn("shrink-0", !url && "ml-auto")}
            >
              <Pencil />
              {editing ? t("gallery.hideDetails") : t("gallery.edit")}
            </Button>
          </div>
        </DialogHeader>
        <button type="button" onClick={onClose} aria-label={tc("actions.close")} title={tc("actions.close")} className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-full hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <X className="size-4" />
        </button>

        <div className={cn("mt-4 grid gap-6", editing && "md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]")}>
          {/* Image et navigation */}
          <div className="flex flex-col gap-3">
            <div className="relative flex h-[min(calc(100vh-9.5rem),56rem)] items-center justify-center rounded-lg bg-muted/40">
              {url ? (
                <img src={url} alt={name} className="block size-full rounded-md object-contain" data-testid="gallery-dialog-image" />
              ) : (
                <LoadingDots className="size-6 text-muted-foreground" />
              )}
              <button type="button" onClick={() => void go(-1)} disabled={index === 0 || saving} aria-label={t("gallery.previous")} title={`${t("gallery.previous")} (←)`} className="absolute top-1/2 left-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-sm hover:bg-background disabled:hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <ChevronLeft className="size-5" />
              </button>
              <button type="button" onClick={() => void go(1)} disabled={index === total - 1 || saving} aria-label={t("gallery.next")} title={`${t("gallery.next")} (→)`} className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 shadow-sm hover:bg-background disabled:hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                <ChevronRight className="size-5" />
              </button>
            </div>

          </div>

          {/* Informations (affichées par « Modifier ») */}
          {editing && (
          <form onSubmit={onSubmit} className="flex max-h-[min(calc(100vh-9.5rem),56rem)] min-w-0 flex-col gap-4 overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="gallery-image-name">{t("gallery.name")}</Label>
              <Input id="gallery-image-name" value={caption} maxLength={MAX.caption} placeholder={t("gallery.namePlaceholder")} onChange={(e) => setCaption(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gallery-image-folder">{t("gallery.folder")}</Label>
              <select
                id="gallery-image-folder"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                {/* Un dossier plein (sauf celui de l'image) ne peut pas être choisi. */}
                <option value="" disabled={image.folderId !== null && isFull(null)}>
                  {t("gallery.root")}
                  {image.folderId !== null && isFull(null) ? ` (${t("gallery.folderFull")})` : ""}
                </option>
                {folderOptions.map((option) => {
                  const blocked = option.id !== image.folderId && isFull(option.id);
                  return (
                    <option key={option.id} value={option.id} disabled={blocked}>
                      {option.label}
                      {blocked ? ` (${t("gallery.folderFull")})` : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex min-h-0 flex-1 flex-col space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="gallery-image-description">{t("gallery.description")}</Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {description.length} / {MAX.description}
                </span>
              </div>
              <textarea
                id="gallery-image-description"
                rows={7}
                maxLength={MAX.description}
                value={description}
                placeholder={t("gallery.descriptionPlaceholder")}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-32 w-full flex-1 resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-border/30"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" className="mr-auto text-destructive hover:text-destructive" onClick={() => removal.ask()}>
                <Trash2 />
                {t("gallery.delete")}
              </Button>
              <Button type="submit" disabled={!dirty || saving}>
                {saving && <LoadingDots />}
                {tc("actions.save")}
              </Button>
            </div>
          </form>
          )}
        </div>
      </Dialog>
      {removal.dialog}
    </>,
    document.body,
  );
}
