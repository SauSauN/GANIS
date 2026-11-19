import { useRef, useState, type DragEvent } from "react";
import { useConfirmImageRemoval } from "@/components/common/useConfirmImageRemoval";
import { useTranslation } from "react-i18next";
import { ImagePlus, Loader2, Maximize2, Trash2 } from "lucide-react";
import { ImageDialog } from "@/components/common/ImageDialog";
import { useImageFrame } from "@/stores/imageFrameStore";
import { AvatarFace, type AvatarSize } from "@/components/characters/CharacterAvatar";
import { PORTRAIT_ACCEPT } from "@/lib/portraitImage";
import { cn } from "@/lib/utils";

interface PortraitPickerProps {
  colorKey: string;
  name: string;
  url: string | null;
  busy?: boolean;
  error?: string | null;
  disabled?: boolean;
  size?: AvatarSize;
  /** Couleurs de la palette du personnage : un anneau entoure la photo. */
  ringColors?: string[];
  /**
   * Cadre carré sur toute la largeur de la carte, de la même taille que
   * l'image des lieux, des objets et de la faune et flore.
   */
  frame?: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  /** Projet et clé du cadrage (personnage enregistré) : un clic sur la photo l'ouvre en grand. */
  projectId?: string;
  frameKey?: string;
}

/**
 * Photo du personnage : bouton « Choisir une photo », ou glisser-déposer
 * une image sur l'avatar. Sans photo, l'avatar montre les initiales.
 */
export function PortraitPicker({
  colorKey,
  name,
  url,
  busy = false,
  error,
  disabled = false,
  size = "xl",
  ringColors = [],
  frame = false,
  onPick,
  onRemove,
  projectId,
  frameKey,
}: PortraitPickerProps) {
  const { t } = useTranslation(["characters", "common"]);
  const [viewing, setViewing] = useState(false);
  const canView = Boolean(url && projectId && frameKey);
  const frameValue = useImageFrame(projectId, frameKey);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const locked = disabled || busy;
  const ring = paletteRing(ringColors);
  const removal = useConfirmImageRemoval(() => onRemove());
  const round = frame ? "rounded-lg" : "rounded-full";

  function pickFirst(files: FileList | null) {
    const file = files?.[0];

    if (file) {
      onPick(file);
    }
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
  // Personnage enregistré : un clic ouvre la photo en grand (cadrer,
  // remplacer, retirer). À la création, un clic la retire.
  const actionLabel = url ? (canView ? t("common:image.open") : t("portrait.remove")) : t("portrait.add");
  const ActionIcon = url ? (canView ? Maximize2 : Trash2) : ImagePlus;

  return (
    <div className={cn("flex shrink-0 flex-col items-center gap-2", frame && "w-full")}>
      <button
        type="button"
        disabled={locked}
        onClick={() => (url ? (canView ? setViewing(true) : removal.ask()) : inputRef.current?.click())}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        aria-label={actionLabel}
        title={dragOver ? t("portrait.drop") : actionLabel}
        className={cn(
          "group relative transition-shadow focus-visible:outline-none",
          round,
          frame && "aspect-square w-full",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          ring && "p-1",
          dragOver && "ring-4 ring-primary ring-offset-2 ring-offset-background",
          !locked && "cursor-pointer",
        )}
        style={ring ? { background: ring } : undefined}
      >
        {/* Avec une palette, son anneau sert de cadre : la photo vient
            directement dedans (sans liseré ni cadre blanc). */}
        <span className={cn("relative block", round, frame && "size-full")}>
          <AvatarFace
            colorKey={colorKey}
            name={name}
            url={url}
            frame={frameValue}
            size={frame ? "fill" : size}
            square={frame}
            // Photo de la fiche : cadre réglable (Paramètres › Apparence),
            // sauf si la fiche a sa propre palette.
            className={cn(ring && "ring-0", frame && !ring && "profile-frame ring-0")}
          />

          {/* Action au survol (ou au focus clavier), sur la photo elle-même. */}
          {!locked && (
            <span
              className={cn(
                "absolute inset-0 flex flex-col items-center justify-center gap-1 overflow-hidden text-xs font-medium text-white opacity-0 transition-opacity",
                round,
                "group-hover:opacity-100 group-focus-visible:opacity-100",
                dragOver && "opacity-100",
                "bg-black/60 backdrop-blur-[2px]",
              )}
              aria-hidden="true"
            >
              <ActionIcon className="size-5" />
              <span className="px-2 text-center leading-tight">
                {dragOver ? t("portrait.drop") : actionLabel}
              </span>
            </span>
          )}
        </span>

        {busy && (
          <span className={cn("absolute inset-0 flex items-center justify-center bg-background/70", round)}>
            <Loader2 className="size-6 animate-spin text-primary" aria-label={t("portrait.saving")} />
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={PORTRAIT_ACCEPT}
        // `hidden` (et non `sr-only`, positionné en absolu) : le champ ne
        // doit jamais dépasser de la zone qui défile.
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          pickFirst(event.target.files);
          // Le même fichier peut être choisi à nouveau.
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

/**
 * Fond de l'anneau : la couleur seule, ou un dégradé circulaire qui passe
 * par toutes les couleurs de la palette (et se referme sur la première).
 */
export function paletteRing(colors: string[]): string | null {
  if (colors.length === 0) return null;
  if (colors.length === 1) return colors[0];
  return `conic-gradient(from 0deg, ${[...colors, colors[0]].join(", ")})`;
}
