import { useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
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
  onPick: (file: File) => void;
  onRemove: () => void;
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
  onPick,
  onRemove,
}: PortraitPickerProps) {
  const { t } = useTranslation("characters");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const locked = disabled || busy;
  const ring = paletteRing(ringColors);

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
  const actionLabel = url ? t("portrait.remove") : t("portrait.add");
  const ActionIcon = url ? Trash2 : ImagePlus;

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <button
        type="button"
        disabled={locked}
        onClick={() => (url ? onRemove() : inputRef.current?.click())}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        aria-label={actionLabel}
        title={dragOver ? t("portrait.drop") : actionLabel}
        className={cn(
          "group relative rounded-full transition-shadow focus-visible:outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          ring && "p-1",
          dragOver && "ring-4 ring-primary ring-offset-2 ring-offset-background",
          !locked && "cursor-pointer",
        )}
        style={ring ? { background: ring } : undefined}
      >
        {/* Fin liseré de la couleur de la carte entre l'anneau et la photo. */}
        <span className={cn("relative block rounded-full", ring && "bg-card p-1")}>
          <AvatarFace
            colorKey={colorKey}
            name={name}
            url={url}
            size={size}
            className={ring ? "ring-0" : undefined}
          />

          {/* Action au survol (ou au focus clavier), sur la photo elle-même. */}
          {!locked && (
            <span
              className={cn(
                "absolute inset-0 flex flex-col items-center justify-center gap-1 overflow-hidden rounded-full text-xs font-medium text-white opacity-0 transition-opacity",
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
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
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
    </div>
  );
}

/**
 * Fond de l'anneau : la couleur seule, ou un dégradé circulaire qui passe
 * par toutes les couleurs de la palette (et se referme sur la première).
 */
function paletteRing(colors: string[]): string | null {
  if (colors.length === 0) return null;
  if (colors.length === 1) return colors[0];
  return `conic-gradient(from 0deg, ${[...colors, colors[0]].join(", ")})`;
}