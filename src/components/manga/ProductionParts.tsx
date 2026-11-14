import { useEffect, useId, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { InfoTip } from "@/components/common/InfoTip";
import { thumbnailUrl } from "@/components/manga/Thumbnail";
import { api } from "@/lib/api";
import { ExportMenu } from "@/components/novel/ExportMenu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fieldClass } from "@/components/workspace/views/PageShell";
import { errorText } from "@/lib/errors";
import {
  EXTRA_PAGE_KINDS,
  isCoverKind,
  PRODUCTION_STAGE_COLORS,
  PRODUCTION_STAGES,
  type ScriptExportLabels,
  type VolumeExtras,
} from "@/lib/manga";
import type { ExportDocument } from "@/lib/novelExport";
import { cn } from "@/lib/utils";
import { useMangaStore } from "@/stores/mangaStore";
import type { ExtraPageKind, ExtraPagePlacement, MangaExtraPage, ProductionStage } from "@/types";

/*
 * Briques de la fabrication d'un manga, partagées par le chemin de fer et le
 * suivi de fabrication : étapes, pages hors récit, export du scénario.
 */

// ----------------------------------------------------------------------------
// Étapes
// ----------------------------------------------------------------------------

/** Pastille de couleur d'une étape. */
export function StageDot({ stage, className }: { stage: ProductionStage | null; className?: string }) {
  return <span className={cn("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ backgroundColor: PRODUCTION_STAGE_COLORS[stage ?? "none"] }} aria-hidden="true" />;
}

/** Liste déroulante des étapes ; « Pas commencée » vaut `null`. */
export function StageSelect({
  value,
  onChange,
  label,
  disabled,
  className,
}: {
  value: ProductionStage | null;
  onChange: (stage: ProductionStage | null) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation("manga");
  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <StageDot stage={value} className="pointer-events-none absolute left-2.5" />
      <select
        aria-label={label}
        title={t("production.stageHint")}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange((e.target.value || null) as ProductionStage | null)}
        className={cn(fieldClass, "h-8 w-full pl-7")}
      >
        <option value="">{t("production.stages.none")}</option>
        {PRODUCTION_STAGES.map((stage) => (
          <option key={stage} value={stage}>
            {t(`production.stages.${stage}`)}
          </option>
        ))}
      </select>
    </span>
  );
}

/** Légende des couleurs des étapes. */
export function StageLegend({ counts }: { counts?: Record<ProductionStage | "none", number> }) {
  const { t } = useTranslation("manga");
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {(["none", ...PRODUCTION_STAGES] as const).map((stage) => (
        <li key={stage} className="flex items-center gap-1.5">
          <StageDot stage={stage === "none" ? null : stage} />
          {t(`production.stages.${stage}`)}
          {counts && <span className="tabular-nums">({counts[stage]})</span>}
        </li>
      ))}
    </ul>
  );
}

// ----------------------------------------------------------------------------
// Pages hors récit
// ----------------------------------------------------------------------------

/**
 * Vignettes des dessins de pages hors récit, gardées en mémoire pendant la
 * séance (copies en clair d'images chiffrées dans le projet : jamais sur le
 * disque). Une nouvelle version du dessin a une nouvelle clé.
 */
const artCache = new Map<string, Promise<string | null>>();

/** Vignette du dessin d'une page hors récit ; `null` s'il n'y en a pas. */
export function useExtraArtUrl(projectId: string, extra: Pick<MangaExtraPage, "id" | "hasArt" | "artUpdatedAt"> | null): string | null {
  const key = extra?.hasArt ? `${projectId}:${extra.id}:${extra.artUpdatedAt ?? ""}` : null;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!key || !extra) {
      setUrl(null);
      return;
    }
    let stale = false;
    let promise = artCache.get(key);
    if (!promise) {
      promise = api
        .getMangaExtraArt(projectId, extra.id)
        .then((data) => thumbnailUrl(new Blob([data])))
        .catch(() => null);
      artCache.set(key, promise);
    }
    void promise.then((value) => !stale && setUrl(value));
    return () => {
      stale = true;
    };
    // La clé suit le dessin : identifiant et date de changement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

/** Nom d'une page hors récit : son titre, sinon sa sorte. */
export function useExtraName() {
  const { t } = useTranslation("manga");
  return (extra: Pick<MangaExtraPage, "kind" | "title">) => extra.title.trim() || t(`extras.kinds.${extra.kind}`);
}

interface ExtraPageDialogProps {
  projectId: string;
  volumeId: string | null;
  /** `null` : nouvelle page. */
  extra: MangaExtraPage | null;
  /** Pages hors récit du tome (couvertures déjà prises, ordre de destination). */
  volumeExtras: VolumeExtras;
  onClose: () => void;
}

/** Ajout ou modification d'une page hors récit. */
export function ExtraPageDialog({ projectId, volumeId, extra, volumeExtras, onClose }: ExtraPageDialogProps) {
  const { t } = useTranslation(["manga", "common"]);
  const createExtra = useMangaStore((s) => s.createExtra);
  const updateExtra = useMangaStore((s) => s.updateExtra);
  const reorderExtras = useMangaStore((s) => s.reorderExtras);

  const [kind, setKind] = useState<ExtraPageKind>(extra?.kind ?? "title");
  const [placement, setPlacement] = useState<ExtraPagePlacement>(extra?.placement ?? "front");
  const [title, setTitle] = useState(extra?.title ?? "");
  const [notes, setNotes] = useState(extra?.notes ?? "");
  /** Dessin : `undefined` inchangé, `null` à retirer, un fichier à ranger. */
  const [art, setArt] = useState<File | null | undefined>(undefined);
  const setExtraArt = useMangaStore((s) => s.setExtraArt);
  const currentArt = useExtraArtUrl(projectId, extra);
  const artInputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Une couverture va avant le récit, la quatrième après.
  const where: ExtraPagePlacement = kind === "cover" ? "front" : kind === "backCover" ? "back" : placement;
  const taken = (value: ExtraPageKind) =>
    (value === "cover" && volumeExtras.cover && volumeExtras.cover.id !== extra?.id) ||
    (value === "backCover" && volumeExtras.backCover && volumeExtras.backCover.id !== extra?.id);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!extra) {
        const created = await createExtra(projectId, { volumeId, placement: where, kind, title, notes });
        if (art) await setExtraArt(projectId, created.id, art);
      } else {
        if (art !== undefined) await setExtraArt(projectId, extra.id, art);
        await updateExtra(projectId, extra.id, { kind, title, notes });
        // Changement de place : la page va à la fin de son nouveau groupe.
        if (where !== extra.placement && !isCoverKind(kind)) {
          const group = where === "front" ? volumeExtras.front : volumeExtras.back;
          await reorderExtras(projectId, volumeId, where, [...group.map((item) => item.id), extra.id]);
        }
      }
      onClose();
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      className="max-w-lg"
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <form onSubmit={(event) => void submit(event)} noValidate>
        <DialogHeader>
          <DialogTitle>{extra ? t("extras.editTitle") : t("extras.addTitle")}</DialogTitle>
          <DialogDescription>{t("extras.formDescription")}</DialogDescription>
        </DialogHeader>

        <div className="mt-5 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extra-kind">{t("extras.kind")}</Label>
              <select id="extra-kind" value={kind} onChange={(e) => setKind(e.target.value as ExtraPageKind)} className={cn(fieldClass, "h-9")}>
                {EXTRA_PAGE_KINDS.map((value) => (
                  <option key={value} value={value} disabled={Boolean(taken(value))}>
                    {t(`extras.kinds.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="extra-placement">{t("extras.where")}</Label>
              <select
                id="extra-placement"
                value={where}
                disabled={isCoverKind(kind)}
                onChange={(e) => setPlacement(e.target.value as ExtraPagePlacement)}
                className={cn(fieldClass, "h-9")}
              >
                <option value="front">{t("extras.placement.front")}</option>
                <option value="back">{t("extras.placement.back")}</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="extra-title">{t("extras.pageTitle")}</Label>
            <Input id="extra-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={t("extras.pageTitlePlaceholder")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="extra-notes">{t("extras.notes")}</Label>
            <textarea
              id="extra-notes"
              value={notes}
              maxLength={10_000}
              rows={4}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("extras.notesPlaceholder")}
              className={cn(fieldClass, "min-h-24 resize-y py-2 leading-6")}
            />
          </div>

          {/* Dessin de la page : une image, affichée dans le chemin de fer. */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor={artInputId}>{t("extras.art")}</Label>
              <InfoTip>{t("extras.artHint")}</InfoTip>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {(art || (art === undefined && currentArt)) && (
                <span className="relative block aspect-[5/7] w-16 overflow-hidden rounded-sm border bg-white">
                  {art ? (
                    <span className="absolute inset-0 flex items-center justify-center p-1 text-center text-[0.6rem] break-all text-muted-foreground">{art.name}</span>
                  ) : (
                    <img src={currentArt ?? ""} alt="" className="size-full object-contain" />
                  )}
                </span>
              )}
              <label htmlFor={artInputId} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-sm hover:bg-muted">
                <ImagePlus className="size-4" aria-hidden="true" />
                {extra?.hasArt || art ? t("extras.artReplace") : t("extras.artAdd")}
              </label>
              <input
                id={artInputId}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setArt(file);
                  e.target.value = "";
                }}
              />
              {(art || (art === undefined && extra?.hasArt)) && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setArt(extra?.hasArt ? null : undefined)}>
                  <X />
                  {t("extras.artRemove")}
                </Button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="mt-6 gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button type="submit" disabled={busy || Boolean(taken(kind))}>
            {busy && <Loader2 className="animate-spin" />}
            {busy ? t("common:actions.saving") : t("common:actions.save")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/**
 * Pages hors récit d'un tome, groupées avant et après le récit : ajouter,
 * modifier, monter, descendre, supprimer.
 */
export function ExtrasManager({ projectId, volumeId, extras }: { projectId: string; volumeId: string | null; extras: VolumeExtras }) {
  const { t } = useTranslation("manga");
  const nameOf = useExtraName();
  const reorderExtras = useMangaStore((s) => s.reorderExtras);
  const deleteExtra = useMangaStore((s) => s.deleteExtra);
  const [editing, setEditing] = useState<MangaExtraPage | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const move = (group: MangaExtraPage[], index: number, step: -1 | 1) => {
    const ids = group.map((item) => item.id);
    const target = index + step;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void run(() => reorderExtras(projectId, volumeId, group[0].placement, ids));
  };

  const groups: Array<{ key: string; title: string; items: MangaExtraPage[]; movable: boolean }> = [
    { key: "covers", title: t("flatplan.covers"), items: [extras.cover, extras.backCover].filter((item): item is MangaExtraPage => item !== null), movable: false },
    { key: "front", title: t("extras.placement.front"), items: extras.front, movable: true },
    { key: "back", title: t("extras.placement.back"), items: extras.back, movable: true },
  ];
  const empty = groups.every((group) => group.items.length === 0);

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {empty ? (
        <p className="text-sm text-muted-foreground">{t("extras.none")}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {groups.map((group) => (
            <div key={group.key} className="min-w-0">
              <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.title}</h3>
              {group.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <ol className="divide-y rounded-lg border bg-card">
                  {group.items.map((extra, index) => {
                    const name = nameOf(extra);
                    return (
                      <li key={extra.id} className="group flex items-center gap-1 py-1 pr-1 pl-3 text-sm">
                        <StageDot stage={extra.productionStage} />
                        <span className="min-w-0 flex-1 truncate" title={extra.title ? `${t(`extras.kinds.${extra.kind}`)} — ${extra.title}` : name}>
                          {name}
                        </span>
                        {group.movable && (
                          <>
                            <Button type="button" size="icon-xs" variant="ghost" disabled={index === 0} onClick={() => move(group.items, index, -1)} aria-label={t("extras.moveUp", { name })} title={t("extras.moveUp", { name })}>
                              <ArrowUp />
                            </Button>
                            <Button type="button" size="icon-xs" variant="ghost" disabled={index === group.items.length - 1} onClick={() => move(group.items, index, 1)} aria-label={t("extras.moveDown", { name })} title={t("extras.moveDown", { name })}>
                              <ArrowDown />
                            </Button>
                          </>
                        )}
                        <Button type="button" size="icon-xs" variant="ghost" onClick={() => setEditing(extra)} aria-label={t("extras.edit", { name })} title={t("extras.edit", { name })}>
                          <Pencil />
                        </Button>
                        <Button type="button" size="icon-xs" variant="ghost" onClick={() => void run(() => deleteExtra(projectId, extra.id, extra.title.trim() || `@${extra.kind}`))} aria-label={t("extras.delete", { name })} title={t("extras.delete", { name })}>
                          <Trash2 />
                        </Button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
      <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)}>
        <Plus />
        {t("extras.add")}
      </Button>

      {editing !== undefined && <ExtraPageDialog projectId={projectId} volumeId={volumeId} extra={editing} volumeExtras={extras} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Export du scénario
// ----------------------------------------------------------------------------

/** Textes de l'export du scénario pour le dessinateur, dans la langue de l'interface. */
export function useScriptExportLabels(): ScriptExportLabels {
  const { t } = useTranslation("manga");
  return {
    subtitle: t("export.subtitle"),
    cast: t("export.cast"),
    places: t("export.places"),
    pageHeading: (label, count) => t("export.page", { label, count }),
    panelHeading: (number, framing) => [t("export.panel", { number }), framing].filter(Boolean).join(" — "),
    goal: t("export.goal"),
    rhythm: (value) => t("export.rhythm", { value }),
    pageTurn: t("export.pageTurn"),
    setting: t("export.setting"),
    place: t("export.place"),
    characters: t("export.characters"),
    notes: t("export.notes"),
    continuity: t("export.continuity"),
    textLabel: (kind, speaker) => {
      if (kind === "dialogue") return speaker ? t("export.text.dialogue", { speaker: speaker.toUpperCase() }) : t("export.text.dialogueAnon");
      if (kind === "thought") return speaker ? t("export.text.thought", { speaker: speaker.toUpperCase() }) : t("export.text.thoughtAnon");
      return t(`export.text.${kind}`);
    },
    framing: (value) => t(`framing.${value as "wide"}`),
    rhythmName: (value) => t(`rhythmShort.${value}`),
    noPanels: t("export.noPanels"),
    folio: (folio, label) => t("export.folio", { folio, label }),
    extraHeading: (extra, folio) => {
      const kind = [t(`extras.kinds.${extra.kind}`), extra.title.trim()].filter(Boolean).join(" : ");
      return folio === null ? t("export.extra", { kind }) : t("export.extraFolio", { folio, kind });
    },
    frontMatter: t("export.frontMatter"),
    backMatter: t("export.backMatter"),
  };
}

/** Bouton « Exporter le scénario » (Word, PDF, texte). */
export function ScriptExportMenu({ fileBase, build, disabled, compact }: { fileBase: string; build: () => ExportDocument; disabled?: boolean; compact?: boolean }) {
  const { t } = useTranslation("manga");
  return (
    <ExportMenu
      label={compact ? t("export.short") : t("export.button")}
      dialogTitle={t("export.dialogTitle")}
      fileBase={`${fileBase} — ${t("export.fileSuffix")}`}
      build={build}
      disabled={disabled}
    />
  );
}
