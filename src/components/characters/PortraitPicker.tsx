import { useRef, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  return (
    <div className="flex shrink-0 flex-col items-center gap-2">
      <div
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        title={t("portrait.drop")}
        className={cn(
          "relative rounded-full transition-shadow",
          ring && "p-1",
          dragOver && "ring-4 ring-primary ring-offset-2 ring-offset-background",
        )}
        style={ring ? { background: ring } : undefined}
      >
        {/* Fin liseré de la couleur de la carte entre l'anneau et la photo. */}
        <span className={cn("block rounded-full", ring && "bg-card p-1")}>
          <AvatarFace
            colorKey={colorKey}
            name={name}
            url={url}
            size={size}
            className={ring ? "ring-0" : undefined}
          />
        </span>

        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
            <Loader2 className="size-6 animate-spin text-primary" aria-label={t("portrait.saving")} />
          </span>
        )}
      </div>

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

      <div className="flex flex-wrap justify-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={locked}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus />
          {url ? t("portrait.change") : t("portrait.add")}
        </Button>

        {url && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={locked}
            onClick={onRemove}
            aria-label={t("portrait.remove")}
            title={t("portrait.remove")}
          >
            <Trash2 />
          </Button>
        )}
      </div>

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
