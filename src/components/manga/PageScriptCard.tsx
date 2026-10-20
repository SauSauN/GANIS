import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  LayoutPanelTop,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import { fullName } from "@/lib/characters";
import {
  duplicatePanel,
  emptyPanel,
  moveItem,
  newText,
  pageStats,
  pageVolume,
  panelVolume,
  textStats,
  type DraftPanel,
  type DraftText,
  type PageDraft,
} from "@/lib/manga";
import { cn } from "@/lib/utils";
import { FRAMINGS, PANEL_TEXT_KINDS, RHYTHMS, type Character, type Location, type MangaSettings, type PanelTextKind } from "@/types";
import { errorText } from "@/lib/errors";

const field = "w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
const select = cn(field, "h-8 pr-7");
const area = cn(field, "resize-y py-1.5 leading-6");

interface PageScriptCardProps {
  draft: PageDraft | null;
  failed: boolean;
  onChange: (update: (draft: PageDraft) => PageDraft) => void;
  characters: Character[];
  locations: Location[];
  settings: MangaSettings | null;
  /** Autres pages, pour y déplacer une case. */
  otherPages: Array<{ id: string; label: string }>;
  /** Déplace la case `index` vers une autre page (la page est d'abord enregistrée). */
  onMovePanel: (index: number, pageId: string) => Promise<void>;
}

/**
 * Scénario d'une page de manga / BD, case par case. Tout est enregistré
 * avec la fiche (Ctrl+S, enregistrement automatique, question avant de
 * fermer) ; une case retirée va à la corbeille à l'enregistrement.
 */
export function PageScriptCard({ draft, failed, onChange, characters, locations, settings, otherPages, onMovePanel }: PageScriptCardProps) {
  const { t } = useTranslation("manga");
  const [open, setOpen] = useCollapsible("ganis.nodeSheet.mangaPanels.collapsed");
  const [moving, setMoving] = useState<number | null>(null);

  const stats = draft ? pageStats(draft.panels) : null;
  const volume = stats ? pageVolume(stats, settings) : "ok";

  const updatePanel = (index: number, update: (panel: DraftPanel) => DraftPanel) =>
    onChange((d) => ({ ...d, panels: d.panels.map((p, i) => (i === index ? update(p) : p)) }));
  const insertPanel = (index: number, panel = emptyPanel()) =>
    onChange((d) => ({ ...d, panels: [...d.panels.slice(0, index), panel, ...d.panels.slice(index)] }));

  return (
    <CollapsibleCard
      open={open}
      onOpenChange={setOpen}
      icon={LayoutPanelTop}
      title={t("page.title")}
      description={t("page.description")}
      actions={
        stats && (
          <span className={cn("text-xs tabular-nums text-muted-foreground", volume === "high" && "text-warning")}>
            {t("page.panels", { count: draft?.panels.length ?? 0 })}
          </span>
        )
      }
    >
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          {t("page.failed")}
        </p>
      ) : !draft || !stats ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t("page.loading")}
        </p>
      ) : (
        <div className="space-y-4">
          {/* Page : fonction narrative, tourné de page, volume */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-muted/30 px-3 py-2">
            <label className="flex items-center gap-2 text-sm">
              <span className="shrink-0 font-medium">{t("page.rhythm")}</span>
              <select
                value={draft.rhythm ?? ""}
                onChange={(e) => onChange((d) => ({ ...d, rhythm: (e.target.value || null) as PageDraft["rhythm"] }))}
                className={cn(select, "w-56")}
              >
                <option value="">—</option>
                {RHYTHMS.map((r) => (
                  <option key={r} value={r}>
                    {t(`rhythm.${r}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm" title={t("page.pageTurnHint")}>
              <input
                type="checkbox"
                checked={draft.pageTurn}
                onChange={(e) => onChange((d) => ({ ...d, pageTurn: e.target.checked }))}
                className="size-4 accent-primary"
              />
              {t("page.pageTurn")}
            </label>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {t("page.summary", {
                panels: t("page.panels", { count: draft.panels.length }),
                words: t("words", { count: stats.words, value: stats.words.toLocaleString() }),
                chars: stats.characters.toLocaleString(),
              })}
            </span>
          </div>
          {volume === "high" && settings?.pageWordsMax && (
            <p className="flex items-center gap-2 text-sm text-warning">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              {t("page.high", { words: stats.words, max: settings.pageWordsMax })}
            </p>
          )}

          {draft.panels.length === 0 && <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{t("page.empty")}</p>}

          <ol className="space-y-3">
            {draft.panels.map((panel, index) => (
              <li key={panel.key}>
                <PanelEditor
                  panel={panel}
                  number={index + 1}
                  first={index === 0}
                  last={index === draft.panels.length - 1}
                  characters={characters}
                  locations={locations}
                  settings={settings}
                  canMove={otherPages.length > 0}
                  onChange={(update) => updatePanel(index, update)}
                  onMove={(to) => onChange((d) => ({ ...d, panels: moveItem(d.panels, index, to) }))}
                  onDuplicate={() => insertPanel(index + 1, duplicatePanel(panel))}
                  onInsertAfter={() => insertPanel(index + 1)}
                  onDelete={() => onChange((d) => ({ ...d, panels: d.panels.filter((_, i) => i !== index) }))}
                  onMoveToPage={() => setMoving(index)}
                />
              </li>
            ))}
          </ol>

          <Button variant="outline" onClick={() => insertPanel(draft.panels.length)}>
            <Plus />
            {t("page.add")}
          </Button>
        </div>
      )}

      <MovePanelDialog
        number={moving === null ? 0 : moving + 1}
        open={moving !== null}
        pages={otherPages}
        onClose={() => setMoving(null)}
        onConfirm={async (pageId) => {
          if (moving === null) return;
          await onMovePanel(moving, pageId);
          setMoving(null);
        }}
      />
    </CollapsibleCard>
  );
}

// ----------------------------------------------------------------------------
// Une case
// ----------------------------------------------------------------------------

interface PanelEditorProps {
  panel: DraftPanel;
  number: number;
  first: boolean;
  last: boolean;
  characters: Character[];
  locations: Location[];
  settings: MangaSettings | null;
  canMove: boolean;
  onChange: (update: (panel: DraftPanel) => DraftPanel) => void;
  onMove: (to: number) => void;
  onDuplicate: () => void;
  onInsertAfter: () => void;
  onDelete: () => void;
  onMoveToPage: () => void;
}

function PanelEditor(props: PanelEditorProps) {
  const { panel, number, characters, locations, settings, onChange } = props;
  const { t } = useTranslation("manga");
  const hasDetails = Boolean(panel.setting || panel.locationId || panel.moment || panel.artistNotes || panel.continuity);
  const [showDetails, setShowDetails] = useState(hasDetails);
  const stats = textStats(panel.texts);
  const volume = panelVolume(stats, settings);
  const nameOf = (id: string | null) => {
    const c = id ? characters.find((x) => x.id === id) : undefined;
    return c ? fullName(c) || "—" : "—";
  };
  const set = <K extends keyof DraftPanel>(key: K, value: DraftPanel[K]) => onChange((p) => ({ ...p, [key]: value }));
  const setText = (key: string, update: (text: DraftText) => DraftText) =>
    onChange((p) => ({ ...p, texts: p.texts.map((x) => (x.key === key ? update(x) : x)) }));
  const present = new Set(panel.characters.map((c) => c.characterId));
  // Locuteur proposé : le premier personnage de la case.
  const defaultSpeaker = panel.characters[0]?.characterId ?? null;

  return (
    <article className={cn("rounded-xl border bg-card shadow-sm", volume === "high" && "border-warning/60")}>
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary tabular-nums">{t("panel.title", { number })}</span>
        <select aria-label={t("framing.none")} value={panel.framing} onChange={(e) => set("framing", e.target.value as DraftPanel["framing"])} className={cn(select, "w-44")}>
          <option value="">{t("framing.none")}</option>
          {FRAMINGS.map((f) => (
            <option key={f} value={f}>
              {t(`framing.${f}`)}
            </option>
          ))}
        </select>
        <select aria-label={t("rhythm.none")} value={panel.rhythm ?? ""} onChange={(e) => set("rhythm", (e.target.value || null) as DraftPanel["rhythm"])} className={cn(select, "w-36")}>
          <option value="">{t("rhythm.none")}</option>
          {RHYTHMS.map((r) => (
            <option key={r} value={r}>
              {t(`rhythmShort.${r}`)}
            </option>
          ))}
        </select>
        <span
          className={cn(
            "flex items-center gap-1 text-xs tabular-nums text-muted-foreground",
            volume === "high" && "font-medium text-warning",
          )}
          title={volume === "high" && settings?.panelWordsMax ? t("panel.high", { words: stats.words, max: settings.panelWordsMax }) : undefined}
        >
          {volume === "high" && <AlertTriangle className="size-3.5" aria-hidden="true" />}
          {volume === "empty" ? t("panel.silent") : t("words", { count: stats.words, value: stats.words.toLocaleString() })}
        </span>
        <div className="ml-auto flex items-center">
          <IconButton label={t("panel.moveUp")} disabled={props.first} onClick={() => props.onMove(number - 2)}>
            <ChevronUp />
          </IconButton>
          <IconButton label={t("panel.moveDown")} disabled={props.last} onClick={() => props.onMove(number)}>
            <ChevronDown />
          </IconButton>
          <IconButton label={t("panel.insertAfter")} onClick={props.onInsertAfter}>
            <Plus />
          </IconButton>
          <IconButton label={t("panel.duplicate")} onClick={props.onDuplicate}>
            <Copy />
          </IconButton>
          {props.canMove && (
            <IconButton label={t("panel.moveTo")} onClick={props.onMoveToPage}>
              <ArrowRightLeft />
            </IconButton>
          )}
          <IconButton label={t("panel.delete")} onClick={props.onDelete} danger>
            <Trash2 />
          </IconButton>
        </div>
      </header>

      <div className="space-y-3 px-3 py-3">
        <textarea
          aria-label={t("panel.action")}
          rows={2}
          value={panel.action}
          placeholder={t("panel.actionPlaceholder")}
          onChange={(e) => set("action", e.target.value)}
          className={area}
        />

        {/* Personnages présents, avec leur état */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{t("panel.characters")}</span>
          {panel.characters.map((c) => (
            <span key={c.characterId} className="flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-1 pl-2.5 text-sm">
              <span className="font-medium">{nameOf(c.characterId)}</span>
              <input
                aria-label={t("panel.statePlaceholder")}
                value={c.state}
                maxLength={300}
                placeholder={t("panel.statePlaceholder")}
                title={t("panel.statePlaceholder")}
                onChange={(e) =>
                  onChange((p) => ({ ...p, characters: p.characters.map((x) => (x.characterId === c.characterId ? { ...x, state: e.target.value } : x)) }))
                }
                className="h-6 w-40 rounded-full border-0 bg-transparent px-1.5 text-xs outline-none placeholder:text-muted-foreground/70 focus:bg-background focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                aria-label={`${t("panel.characters")} : ${nameOf(c.characterId)} ✕`}
                onClick={() => onChange((p) => ({ ...p, characters: p.characters.filter((x) => x.characterId !== c.characterId) }))}
                className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <select
            aria-label={t("panel.addCharacter")}
            value=""
            onChange={(e) => e.target.value && onChange((p) => ({ ...p, characters: [...p.characters, { characterId: e.target.value, state: "" }] }))}
            className={cn(select, "w-36 text-muted-foreground")}
          >
            <option value="">{t("panel.addCharacter")}</option>
            {characters
              .filter((c) => !present.has(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {fullName(c) || "—"}
                </option>
              ))}
          </select>
        </div>

        {/* Textes de la case */}
        {panel.texts.length > 0 && (
          <ul className="space-y-1.5">
            {panel.texts.map((text, i) => (
              <li key={text.key} className="flex items-start gap-1.5">
                <select
                  aria-label={t("panel.texts")}
                  value={text.kind}
                  onChange={(e) => {
                    const kind = e.target.value as PanelTextKind;
                    setText(text.key, (x) => ({ ...x, kind, characterId: kind === "dialogue" || kind === "thought" ? (x.characterId ?? defaultSpeaker) : null }));
                  }}
                  className={cn(select, "w-32 shrink-0", kindTint(text.kind))}
                >
                  {PANEL_TEXT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`kind.${k}`)}
                    </option>
                  ))}
                </select>
                {(text.kind === "dialogue" || text.kind === "thought") && (
                  <select
                    aria-label={t("panel.speaker")}
                    value={text.characterId ?? ""}
                    onChange={(e) => setText(text.key, (x) => ({ ...x, characterId: e.target.value || null }))}
                    className={cn(select, "w-32 shrink-0")}
                  >
                    <option value="">{t("panel.speaker")}</option>
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {fullName(c) || "—"}
                      </option>
                    ))}
                  </select>
                )}
                <textarea
                  aria-label={t(`kind.${text.kind}`)}
                  rows={1}
                  value={text.content}
                  placeholder={t(`kindPlaceholder.${text.kind}`)}
                  onChange={(e) => setText(text.key, (x) => ({ ...x, content: e.target.value }))}
                  className={cn(area, "min-h-8 flex-1", text.kind === "thought" && "italic", text.kind === "sfx" && "font-semibold tracking-wide uppercase")}
                />
                <div className="flex shrink-0">
                  <IconButton label={t("panel.textUp")} disabled={i === 0} onClick={() => onChange((p) => ({ ...p, texts: moveItem(p.texts, i, i - 1) }))}>
                    <ChevronUp />
                  </IconButton>
                  <IconButton
                    label={t("panel.textDown")}
                    disabled={i === panel.texts.length - 1}
                    onClick={() => onChange((p) => ({ ...p, texts: moveItem(p.texts, i, i + 1) }))}
                  >
                    <ChevronDown />
                  </IconButton>
                  <IconButton label={t("panel.textDelete")} onClick={() => onChange((p) => ({ ...p, texts: p.texts.filter((x) => x.key !== text.key) }))} danger>
                    <X />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-1">
          {PANEL_TEXT_KINDS.map((k) => (
            <Button
              key={k}
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onChange((p) => ({ ...p, texts: [...p.texts, newText(k, defaultSpeaker)] }))}
            >
              <Plus className="size-3" />
              {t(`kind.${k}`)}
            </Button>
          ))}
        </div>

        {/* Détails : lieu, moment, décor, indications, continuité */}
        <div className="border-t pt-2">
          <button
            type="button"
            aria-expanded={showDetails}
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showDetails ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {t("panel.more")}
            {!showDetails && hasDetails && <span className="ml-1 size-1.5 rounded-full bg-primary" aria-hidden="true" />}
          </button>
          {showDetails && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Labeled label={t("panel.location")}>
                <select value={panel.locationId ?? ""} onChange={(e) => set("locationId", e.target.value || null)} className={select}>
                  <option value="">{t("panel.noLocation")}</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Labeled>
              <Labeled label={t("panel.moment")}>
                <input value={panel.moment} maxLength={300} placeholder={t("panel.momentPlaceholder")} onChange={(e) => set("moment", e.target.value)} className={cn(field, "h-8")} />
              </Labeled>
              <Labeled label={t("panel.setting")}>
                <textarea rows={2} value={panel.setting} placeholder={t("panel.settingPlaceholder")} onChange={(e) => set("setting", e.target.value)} className={area} />
              </Labeled>
              <Labeled label={t("panel.notes")}>
                <textarea rows={2} value={panel.artistNotes} placeholder={t("panel.notesPlaceholder")} onChange={(e) => set("artistNotes", e.target.value)} className={area} />
              </Labeled>
              <div className="sm:col-span-2">
                <Labeled label={t("panel.continuity")}>
                  <textarea rows={2} value={panel.continuity} placeholder={t("panel.continuityPlaceholder")} onChange={(e) => set("continuity", e.target.value)} className={area} />
                </Labeled>
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/** Couleur discrète de chaque type de texte. */
function kindTint(kind: PanelTextKind): string {
  switch (kind) {
    case "dialogue":
      return "border-sky-500/40";
    case "thought":
      return "border-violet-500/40";
    case "narration":
      return "border-amber-500/40";
    case "sfx":
      return "border-rose-500/40";
    default:
      return "border-emerald-500/40";
  }
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function IconButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-4",
        danger && "hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}

// ----------------------------------------------------------------------------
// Déplacer une case vers une autre page
// ----------------------------------------------------------------------------

function MovePanelDialog({
  number,
  open,
  pages,
  onClose,
  onConfirm,
}: {
  number: number;
  open: boolean;
  pages: Array<{ id: string; label: string }>;
  onClose: () => void;
  onConfirm: (pageId: string) => Promise<void>;
}) {
  const { t } = useTranslation(["manga", "common"]);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("panel.moveToTitle", { number })}</DialogTitle>
        </DialogHeader>
        {pages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("panel.noOtherPage")}</p>
        ) : (
          <select aria-label={t("panel.moveTo")} value={target} onChange={(e) => setTarget(e.target.value)} className={cn(select, "h-9")}>
            <option value="">—</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            {t("common:actions.cancel")}
          </Button>
          <Button
            disabled={!target || busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm(target);
                setTarget("");
              } catch (e) {
                setError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
            {t("panel.moveToConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}