import { useRef, useState, type DragEvent } from "react";
import { useConfirmImageRemoval } from "@/components/common/useConfirmImageRemoval";
import { PaletteFrame } from "@/components/common/PaletteFrame";
import { useTranslation } from "react-i18next";
import { ImagePlus, Maximize2, Trash2 } from "lucide-react";
import { LoadingDots } from "@/components/common/LoadingDots";
import { ImageDialog } from "@/components/common/ImageDialog";
import { frameStyle, portraitFrameKey } from "@/lib/imageFrame";
import { useImageFrame } from "@/stores/imageFrameStore";
import {
  categoryBackdrop,
  categoryTint,
  typeIcon,
} from "@/components/locations/locationStyle";
import type { LocationLabels } from "@/components/locations/useLocationLabels";
import { findType, type LocationCategory } from "@/lib/locations";
import { PORTRAIT_ACCEPT } from "@/lib/portraitImage";
import { profileTallImageClass } from "@/components/workspace/views/PageShell";
import { cn } from "@/lib/utils";
import { useLocationImageUrl } from "@/stores/locationStore";
import type { CustomLocationType, Location } from "@/types";

// ----------------------------------------------------------------------------
// Pastille de type
// ----------------------------------------------------------------------------

/** Pastille « icône + type », dans la teinte de la catégorie. */
export function TypeBadge({
  type,
  customTypes,
  labels,
  className,
}: {
  type: string;
  customTypes: CustomLocationType[];
  labels: LocationLabels;
  className?: string;
}) {
  const category = findType(type, customTypes)?.category;
  const Icon = typeIcon(type, category);

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        !category && "bg-muted text-muted-foreground",
        className,
      )}
      style={categoryTint(category)}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{labels.type(type)}</span>
    </span>
  );
}

// ----------------------------------------------------------------------------
// Vignette
// ----------------------------------------------------------------------------

const THUMB_SIZES = {
  xs: "size-5 rounded",
  /** Panneau du milieu : même taille que les personnages, réglée dans Paramètres › Apparence. */
  panel: "size-(--panel-thumb) rounded-md",
  sm: "size-8 rounded-md",
  md: "size-11 rounded-lg",
} as const;

const THUMB_ICONS = { xs: "size-3", panel: "size-[calc(var(--panel-thumb)*0.6)]", sm: "size-4", md: "size-5" } as const;

/** Vignette carrée : l'image du lieu, ou l'icône de son type sur sa teinte. */
export function LocationThumb({
  projectId,
  location,
  customTypes,
  size = "sm",
  className,
}: {
  projectId: string;
  location: Location;
  customTypes: CustomLocationType[];
  size?: keyof typeof THUMB_SIZES;
  className?: string;
}) {
  const url = useLocationImageUrl(projectId, location);
  const frame = useImageFrame(projectId, portraitFrameKey("location", location.id));
  const category = findType(location.type, customTypes)?.category;
  const Icon = typeIcon(location.type, category);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden text-white",
        THUMB_SIZES[size],
        className,
      )}
      style={url ? undefined : categoryBackdrop(category)}
      aria-hidden="true"
    >
      {url ? (
        <img src={url} alt="" className="size-full object-cover" style={frameStyle(frame)} />
      ) : (
        <Icon className={THUMB_ICONS[size]} />
      )}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Image principale (bannière)
// ----------------------------------------------------------------------------

interface BannerPickerProps {
  url: string | null;
  type: string;
  category: LocationCategory | undefined;
  busy?: boolean;
  error?: string | null;
  disabled?: boolean;
  /** Palette du lieu : un cadre de ces couleurs entoure l'image. */
  ringColors?: string[];
  onPick: (file: File) => void;
  onRemove: () => void;
  /** Grande image de la fiche : remplit la hauteur de la carte (écran large). */
  tall?: boolean;
  /** Projet et clé du cadrage (fiche enregistrée) : un clic sur l'image l'ouvre en grand. */
  projectId?: string;
  frameKey?: string;
  /** Nom de la fiche (titre de la fenêtre de l'image). */
  name?: string;
}

/**
 * Image principale d'un lieu, en bandeau. Sans image : l'icône du type sur
 * la teinte de sa catégorie. Le bandeau est lui-même le bouton : il ajoute
 * une image, ou retire celle qui est affichée.
 */
export function BannerPicker({
  url,
  type,
  category,
  busy = false,
  error,
  disabled = false,
  ringColors = [],
  tall = false,
  onPick,
  onRemove,
  projectId,
  frameKey,
  name = "",
}: BannerPickerProps) {
  const { t } = useTranslation(["locations", "common"]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const locked = disabled || busy;
  const Icon = typeIcon(type, category);

  function pickFirst(files: FileList | null) {
    const file = files?.[0];
    if (file) onPick(file);
  }

  function onDragOver(event: DragEvent) {
    if (locked || !event.dataTransfer.types.includes("Files")) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  function onDrop(event: DragEvent) {
    setDragOver(false);
    if (locked) return;

    event.preventDefault();
    pickFirst(event.dataTransfer.files);
  }

  // Un seul élément qui change d'état : sans image, un clic en ajoute une ;
  // avec une image, un clic la retire. Le survol montre l'action. On peut
  // aussi déposer une image (elle remplace l'actuelle).
  // Fiche enregistrée : un clic ouvre l'image en grand (cadrer, remplacer,
  // retirer). À la création, un clic la retire.
  const [viewing, setViewing] = useState(false);
  const canView = Boolean(url && projectId && frameKey);
  const frame = useImageFrame(projectId, frameKey);
  const actionLabel = url ? (canView ? t("common:image.open") : t("image.remove")) : t("image.choose");
  const ActionIcon = url ? (canView ? Maximize2 : Trash2) : ImagePlus;

  const removal = useConfirmImageRemoval(() => onRemove());

  return (
    <div className="w-full space-y-2">
      <PaletteFrame colors={ringColors}>
      <button
        type="button"
        disabled={locked}
        onClick={() => (url ? (canView ? setViewing(true) : removal.ask()) : inputRef.current?.click())}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        title={dragOver ? t("image.drop") : actionLabel}
        aria-label={actionLabel}
        className={cn(
          // Cadre réglable, sauf si la fiche a sa propre palette (son liseré le remplace).
          ringColors.length === 0 && "profile-frame",
          "group relative flex w-full items-center justify-center overflow-hidden rounded-lg text-white transition-shadow",
          tall ? profileTallImageClass : "aspect-square",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          dragOver && "ring-4 ring-primary ring-offset-2 ring-offset-background",
        )}
        style={url ? undefined : categoryBackdrop(category)}
      >
        {url ? (
          <img src={url} alt="" className="size-full object-cover" style={frameStyle(frame)} />
        ) : (
          <Icon
            className={cn(
              "size-14 opacity-90 drop-shadow transition-opacity",
              !locked && "group-hover:opacity-0 group-focus-visible:opacity-0",
            )}
            aria-hidden="true"
          />
        )}

        {/* Action au survol (ou au focus clavier), sur l'image elle-même. */}
        {!locked && (
          <span
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-sm font-medium opacity-0 transition-opacity",
              "group-hover:opacity-100 group-focus-visible:opacity-100",
              dragOver && "opacity-100",
              url ? "bg-black/55" : "bg-black/20",
            )}
            aria-hidden="true"
          >
            <ActionIcon className="size-6" />
            {dragOver ? t("image.drop") : actionLabel}
          </span>
        )}

        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/60">
            <LoadingDots className="size-6 text-primary" aria-hidden="true" />
          </span>
        )}
      </button>
      </PaletteFrame>

      <input
        ref={inputRef}
        type="file"
        accept={PORTRAIT_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          pickFirst(event.target.files);
          event.target.value = "";
        }}
      />

      {error && (
        <p role="alert" className="text-center text-xs text-destructive">
          {error}
        </p>
      )}
      {viewing && url && projectId && frameKey && (
        <ImageDialog
          open
          onClose={() => setViewing(false)}
          projectId={projectId}
          frameKey={frameKey}
          url={url}
          name={name}
          onReplace={onPick}
          onRemove={onRemove}
        />
      )}
      {removal.dialog}
    </div>
  );
}