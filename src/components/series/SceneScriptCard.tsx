import { useEffect, useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Clapperboard, Loader2, Plus, Trash2 } from "lucide-react";
import { InfoTip } from "@/components/common/InfoTip";
import { Button } from "@/components/ui/button";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import { fullName } from "@/lib/characters";
import { moveItem } from "@/lib/manga";
import {
  formatMinutes,
  linesToMinutes,
  newBlock,
  nextBlockAfter,
  sceneHeadingText,
  sceneLines,
  withKind,
  type DraftBlock,
  type SceneDraft,
} from "@/lib/series";
import { cn } from "@/lib/utils";
import { SCENE_PLACES, SCENE_TIMES, SCREENPLAY_KINDS, type Character, type Location, type ScreenplayKind } from "@/types";

const field = "rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
const select = cn(field, "h-8 pr-7");
/** Zone de texte qui grandit avec son contenu (police du scénario). */
const area = "block w-full resize-none bg-transparent font-mono text-sm leading-6 outline-none [field-sizing:content] min-h-6 placeholder:text-muted-foreground/60";

interface SceneScriptCardProps {
  draft: SceneDraft | null;
  failed: boolean;
  onChange: (update: (draft: SceneDraft) => SceneDraft) => void;
  characters: Character[];
  locations: Location[];
}

/**
 * Scénario d'une scène de série, au format du scénario : en-tête
 * (INT. LIEU — MOMENT), puis actions, répliques, transitions, plans et
 * notes. Tout est enregistré avec la fiche (Ctrl+S, enregistrement
 * automatique, question avant de fermer).
 *
 * Clavier : Ctrl+Entrée ajoute l'élément suivant (après une réplique,
 * l'autre personnage répond) ; Tab sur un élément vide change son type ;
 * Retour arrière sur un élément vide le retire ; Alt+↑ / Alt+↓ le déplacent.
 */
export function SceneScriptCard({ draft, failed, onChange, characters, locations }: SceneScriptCardProps) {
  const { t } = useTranslation("series");
  const [open, setOpen] = useCollapsible("ganis.nodeSheet.seriesScene.collapsed");
  // Élément à focaliser après un ajout ou une suppression.
  const focusKey = useRef<string | null>(null);
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  useEffect(() => {
    if (!focusKey.current) return;
    const element = refs.current.get(focusKey.current);
    focusKey.current = null;
    if (element) {
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    }
  });

  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? null;
  const heading = draft
    ? sceneHeadingText({ scenePlace: draft.place, sceneLocationId: draft.locationId, sceneTime: draft.time }, locationName, {
        place: (v) => t(`place.${v}`),
        time: (v) => t(`time.${v}`),
      })
    : "";
  const minutes = draft ? linesToMinutes(sceneLines(draft.blocks)) : 0;
  const duration = formatMinutes(minutes, {
    lessThanOne: t("duration.lessThanOne"),
    minutes: (n) => t("duration.minutes", { count: n }),
    hours: (h, m) => t("duration.hours", { hours: h, minutes: m }),
  });

  const update = (index: number, change: (block: DraftBlock) => DraftBlock) =>
    onChange((d) => ({ ...d, blocks: d.blocks.map((b, i) => (i === index ? change(b) : b)) }));
  const insert = (index: number, block: DraftBlock) => {
    focusKey.current = block.key;
    onChange((d) => ({ ...d, blocks: [...d.blocks.slice(0, index), block, ...d.blocks.slice(index)] }));
  };
  const remove = (index: number) =>
    onChange((d) => {
      const previous = d.blocks[index - 1] ?? d.blocks[index + 1];
      focusKey.current = previous?.key ?? null;
      return { ...d, blocks: d.blocks.filter((_, i) => i !== index) };
    });
  const move = (index: number, to: number) => {
    if (!draft) return;
    focusKey.current = draft.blocks[index]?.key ?? null;
    onChange((d) => ({ ...d, blocks: moveItem(d.blocks, index, to) }));
  };

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, index: number) {
    if (!draft) return;
    const block = draft.blocks[index];
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      insert(index + 1, nextBlockAfter(block, draft.blocks));
    } else if (event.key === "Tab" && !event.shiftKey && !block.content) {
      event.preventDefault();
      const next = SCREENPLAY_KINDS[(SCREENPLAY_KINDS.indexOf(block.kind) + 1) % SCREENPLAY_KINDS.length];
      update(index, (b) => withKind(b, next));
    } else if (event.key === "Backspace" && !block.content && !block.parenthetical && draft.blocks.length > 0) {
      event.preventDefault();
      remove(index);
    } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      move(index, index + (event.key === "ArrowUp" ? -1 : 1));
    }
  }

  // Dernier personnage qui a parlé : proposé pour une nouvelle réplique.
  const lastSpeaker = draft ? ([...draft.blocks].reverse().find((b) => b.kind === "dialogue" && b.characterId)?.characterId ?? null) : null;

  return (
    <CollapsibleCard
      open={open}
      onOpenChange={setOpen}
      icon={Clapperboard}
      title={t("scene.title")}
      description={t("scene.description")}
      actions={draft && <span className="text-xs tabular-nums text-muted-foreground">{t("scene.estimate", { duration })}</span>}
    >
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          {t("scene.failed")}
        </p>
      ) : !draft ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t("scene.loading")}
        </p>
      ) : (
        <div className="space-y-4">
          {/* En-tête de la scène */}
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">{t("scene.place")}</span>
              <select
                aria-label={t("scene.place")}
                value={draft.place ?? ""}
                onChange={(e) => onChange((d) => ({ ...d, place: (e.target.value || null) as SceneDraft["place"] }))}
                className={cn(select, "w-32")}
              >
                <option value="">—</option>
                {SCENE_PLACES.map((p) => (
                  <option key={p} value={p}>
                    {t(`place.${p}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-40 flex-1 space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">{t("scene.location")}</span>
              <select
                aria-label={t("scene.location")}
                value={draft.locationId && locationName(draft.locationId) !== null ? draft.locationId : ""}
                onChange={(e) => onChange((d) => ({ ...d, locationId: e.target.value || null }))}
                className={cn(select, "w-full")}
              >
                <option value="">{locations.length ? "—" : t("scene.noLocations")}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium text-muted-foreground">{t("scene.time")}</span>
              <select
                aria-label={t("scene.time")}
                value={draft.time ?? ""}
                onChange={(e) => onChange((d) => ({ ...d, time: (e.target.value || null) as SceneDraft["time"] }))}
                className={cn(select, "w-36")}
              >
                <option value="">—</option>
                {SCENE_TIMES.map((v) => (
                  <option key={v} value={v}>
                    {t(`time.${v}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* La page du scénario */}
          <div className="rounded-lg border bg-muted/20 px-4 py-4 sm:px-8">
            <p className="mb-4 font-mono text-sm font-bold tracking-wide" data-testid="scene-heading">
              {heading || <span className="font-normal text-muted-foreground">{t("scene.headingPlaceholder")}</span>}
            </p>

            {draft.blocks.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("scene.empty")}</p>
            )}

            <ol className="space-y-3">
              {draft.blocks.map((block, index) => (
                <li key={block.key} className="group relative" data-kind={block.kind}>
                  <BlockTools
                    kind={block.kind}
                    first={index === 0}
                    last={index === draft.blocks.length - 1}
                    onKind={(kind) => update(index, (b) => withKind(kind === "dialogue" && !b.characterId ? { ...b, characterId: lastSpeaker } : b, kind))}
                    onMove={(to) => move(index, index + to)}
                    onDelete={() => remove(index)}
                  />
                  {block.kind === "dialogue" ? (
                    <div className="mx-auto max-w-sm space-y-0.5 sm:max-w-md">
                      <div className="flex justify-center">
                        <select
                          aria-label={t("scene.character")}
                          value={block.characterId && characters.some((c) => c.id === block.characterId) ? block.characterId : ""}
                          onChange={(e) => update(index, (b) => ({ ...b, characterId: e.target.value || null }))}
                          className="h-7 max-w-full rounded border-transparent bg-transparent px-1 text-center font-mono text-sm font-bold uppercase outline-none hover:border-input focus:ring-2 focus:ring-ring"
                        >
                          <option value="">{t("scene.chooseCharacter")}</option>
                          {characters.map((c) => (
                            <option key={c.id} value={c.id}>
                              {fullName(c)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        aria-label={t("scene.parenthetical")}
                        value={block.parenthetical}
                        placeholder={t("scene.parentheticalPlaceholder")}
                        onChange={(e) => update(index, (b) => ({ ...b, parenthetical: e.target.value }))}
                        className="block w-full bg-transparent px-8 text-center font-mono text-sm italic outline-none placeholder:text-muted-foreground/50"
                      />
                      <textarea
                        ref={(el) => void (el ? refs.current.set(block.key, el) : refs.current.delete(block.key))}
                        aria-label={t("kind.dialogue")}
                        rows={1}
                        value={block.content}
                        placeholder={t("placeholder.dialogue")}
                        onChange={(e) => update(index, (b) => ({ ...b, content: e.target.value }))}
                        onKeyDown={(e) => onKeyDown(e, index)}
                        className={area}
                      />
                    </div>
                  ) : (
                    <textarea
                      ref={(el) => void (el ? refs.current.set(block.key, el) : refs.current.delete(block.key))}
                      aria-label={t(`kind.${block.kind}`)}
                      rows={1}
                      value={block.content}
                      placeholder={t(`placeholder.${block.kind}`)}
                      onChange={(e) => update(index, (b) => ({ ...b, content: e.target.value }))}
                      onKeyDown={(e) => onKeyDown(e, index)}
                      className={cn(
                        area,
                        block.kind === "transition" && "text-right font-bold uppercase",
                        block.kind === "shot" && "font-bold uppercase",
                        block.kind === "note" && "rounded bg-amber-100/60 px-2 py-1 font-sans italic text-amber-900 dark:bg-amber-400/10 dark:text-amber-200",
                      )}
                    />
                  )}
                </li>
              ))}
            </ol>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {SCREENPLAY_KINDS.map((kind) => (
              <Button
                key={kind}
                variant="outline"
                size="sm"
                onClick={() => insert(draft.blocks.length, newBlock(kind, kind === "dialogue" ? lastSpeaker : null))}
              >
                <Plus />
                {t(`kind.${kind}`)}
              </Button>
            ))}
            <InfoTip>{t("scene.keyboard")}</InfoTip>
          </div>
        </div>
      )}
    </CollapsibleCard>
  );
}

interface BlockToolsProps {
  kind: ScreenplayKind;
  first: boolean;
  last: boolean;
  onKind: (kind: ScreenplayKind) => void;
  onMove: (offset: -1 | 1) => void;
  onDelete: () => void;
}

/** Outils d'un élément (type, déplacer, retirer), visibles au survol. */
function BlockTools({ kind, first, last, onKind, onMove, onDelete }: BlockToolsProps) {
  const { t } = useTranslation("series");
  return (
    <div className="absolute -top-3 right-0 z-10 flex items-center gap-0.5 rounded-md border bg-background px-1 opacity-0 shadow-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100">
      <select
        aria-label={t("scene.kind")}
        value={kind}
        onChange={(e) => onKind(e.target.value as ScreenplayKind)}
        className="h-6 bg-transparent pr-1 text-xs outline-none"
      >
        {SCREENPLAY_KINDS.map((k) => (
          <option key={k} value={k}>
            {t(`kind.${k}`)}
          </option>
        ))}
      </select>
      <button type="button" className="rounded p-0.5 hover:bg-muted disabled:opacity-30" disabled={first} aria-label={t("scene.moveUp")} onClick={() => onMove(-1)}>
        <ArrowUp className="size-3.5" />
      </button>
      <button type="button" className="rounded p-0.5 hover:bg-muted disabled:opacity-30" disabled={last} aria-label={t("scene.moveDown")} onClick={() => onMove(1)}>
        <ArrowDown className="size-3.5" />
      </button>
      <button type="button" className="rounded p-0.5 text-destructive hover:bg-muted" aria-label={t("scene.remove")} onClick={onDelete}>
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
