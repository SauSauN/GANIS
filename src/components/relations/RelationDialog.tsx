import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeftRight, ArrowRight, ChevronDown, Loader2, Repeat, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AvatarFace } from "@/components/characters/CharacterAvatar";
import { fieldClass } from "@/components/workspace/views/PageShell";
import { RelationTypeSelect } from "@/components/relations/RelationTypeSelect";
import { useRelationColors } from "@/components/relations/useRelationColors";
import { useStory } from "@/components/relations/useStory";
import { fullName } from "@/lib/characters";
import { SENTIMENTS, emptyRelation } from "@/lib/relations";
import { cn } from "@/lib/utils";
import { usePortraitUrl, useProjectCharacters } from "@/stores/characterStore";
import { useRelationStore } from "@/stores/relationStore";
import type { RelationInput } from "@/types";

interface RelationDialogProps {
  projectId: string;
  open: boolean;
  /** Relation modifiée (`null` : création). */
  relationId: string | null;
  /** Valeurs de départ (création : personnages déjà choisis, par exemple). */
  initial: RelationInput | null;
  onClose: () => void;
  /**
   * Vue en plein écran : le panneau couvre toute la fenêtre. Sinon, il
   * s'ouvre dans la zone des onglets, à la hauteur de la barre de gauche.
   */
  fullscreen?: boolean;
}

/** Zone de l'espace de travail où s'ouvrent les panneaux (voir Workspace.tsx). */
const DRAWER_HOST_ID = "workspace-drawer-host";

/** Vrai si des options secondaires ont une valeur autre que celle par défaut. */
function hasDetails(input: RelationInput): boolean {
  const base = emptyRelation();
  return (
    input.intensity !== base.intensity ||
    input.sentiment !== base.sentiment ||
    input.sinceNode !== null ||
    input.untilNode !== null ||
    input.description.trim() !== ""
  );
}

/** Un des deux personnages : grand avatar et liste de choix. */
function PersonPicker({
  projectId,
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  projectId: string;
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("relations");
  const { characters } = useProjectCharacters(projectId);
  const character = characters.find((c) => c.id === value);
  const url = usePortraitUrl(projectId, character);

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <AvatarFace
        colorKey={character?.id ?? "none"}
        name={character ? fullName(character) : ""}
        url={url}
        size="xl"
        className={cn("size-14 text-lg", !character && "opacity-40")}
      />
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(fieldClass, "h-8 px-2 text-center text-sm font-medium")}
      >
        <option value="">{t("form.choose")}</option>
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {fullName(c)}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Création ou modification d'une relation, dans un grand panneau à droite
 * (le graphe reste visible à gauche).
 *
 * L'essentiel d'abord : les deux personnages, le sens, le type et le nom.
 * L'intensité, la tonalité, la période et la description sont repliées
 * dans « Plus de détails ».
 */
export function RelationDialog({
  projectId,
  open,
  relationId,
  initial,
  onClose,
  fullscreen = false,
}: RelationDialogProps) {
  const { t } = useTranslation(["relations", "common"]);
  const story = useStory(projectId);
  const createRelation = useRelationStore((state) => state.createRelation);
  const updateRelation = useRelationStore((state) => state.updateRelation);
  const deleteRelation = useRelationStore((state) => state.deleteRelation);
  const panelRef = useRef<HTMLDivElement>(null);
  const relationColors = useRelationColors();

  const [draft, setDraft] = useState<RelationInput>(emptyRelation());
  const [showDetails, setShowDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Formulaire rempli à chaque ouverture.
  useEffect(() => {
    if (!open) return;

    const start = initial ?? emptyRelation();
    setDraft(start);
    setShowDetails(hasDetails(start));
    setError(null);
    setConfirmDelete(false);
    window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>("select, input")?.focus(), 50);
  }, [open, initial]);

  // Échap ferme le panneau.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const set = <K extends keyof RelationInput>(key: K, value: RelationInput[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!draft.sourceId || !draft.targetId) {
      setError(t("form.missingCharacters"));
      return;
    }
    if (draft.sourceId === draft.targetId) {
      setError(t("form.sameCharacter"));
      return;
    }

    setBusy(true);
    setError(null);

    try {
      if (relationId) await updateRelation(projectId, relationId, draft);
      else await createRelation(projectId, draft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!relationId) return;

    setBusy(true);
    try {
      await deleteRelation(projectId, relationId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const nodeSelect = (id: string, value: string | null, onChange: (value: string | null) => void, none: string) => (
    <select
      id={id}
      value={value ?? ""}
      disabled={busy || story.order.length === 0}
      onChange={(e) => onChange(e.target.value || null)}
      className={cn(fieldClass, "h-10")}
    >
      <option value="">{none}</option>
      {story.order.map((node) => (
        <option key={node.id} value={node.id}>
          {"  ".repeat(node.level)}
          {story.labelOf(node)}
        </option>
      ))}
    </select>
  );

  const color = relationColors[draft.type];

  // Hors plein écran, le panneau s'ouvre dans la zone des onglets : il
  // garde la hauteur de la barre de gauche (barre de titre et barre d'état
  // restent visibles). Sans cette zone (cas improbable), toute la fenêtre.
  const host = fullscreen ? null : document.getElementById(DRAWER_HOST_ID);

  const drawer = (
    <div className={cn("z-50 flex justify-end", host ? "absolute inset-0" : "fixed inset-0")}>
      {/* Voile léger : un clic à côté ferme le panneau. */}
      <button
        type="button"
        aria-label={t("form.cancel")}
        tabIndex={-1}
        onClick={() => !busy && onClose()}
        className="flex-1 cursor-default bg-background/30"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="relation-panel-title"
        className="flex h-full w-full max-w-[23rem] flex-col border-l bg-card shadow-2xl"
      >
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          {/* En-tête */}
          <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderTop: `3px solid ${color}` }}>
            <h2 id="relation-panel-title" className="flex-1 text-base font-semibold">
              {relationId ? t("form.editTitle") : t("form.createTitle")}
            </h2>
            <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} disabled={busy} aria-label={t("form.cancel")}>
              <X />
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {/* Les deux personnages et le sens */}
            <section className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-start gap-2">
                <PersonPicker
                  projectId={projectId}
                  id="relation-source"
                  label={t("form.source")}
                  value={draft.sourceId}
                  onChange={(value) => set("sourceId", value)}
                  disabled={busy}
                />

                <div className="flex shrink-0 flex-col items-center gap-1 pt-2.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => set("directed", !draft.directed)}
                    title={draft.directed ? t("form.oneWay") : t("form.mutual")}
                    className="flex size-9 items-center justify-center rounded-full border-2 bg-background transition-colors hover:bg-muted"
                    style={{ borderColor: color, color }}
                  >
                    {draft.directed ? <ArrowRight className="size-4" /> : <ArrowLeftRight className="size-4" />}
                  </button>
                  <span className="text-[0.7rem] font-medium text-muted-foreground">
                    {draft.directed ? t("form.oneWay") : t("form.mutual")}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={busy}
                    title={t("form.swap")}
                    aria-label={t("form.swap")}
                    onClick={() =>
                      setDraft((current) => ({ ...current, sourceId: current.targetId, targetId: current.sourceId }))
                    }
                  >
                    <Repeat />
                  </Button>
                </div>

                <PersonPicker
                  projectId={projectId}
                  id="relation-target"
                  label={t("form.target")}
                  value={draft.targetId}
                  onChange={(value) => set("targetId", value)}
                  disabled={busy}
                />
              </div>
            </section>

            {/* Type : liste déroulante, chaque type avec sa couleur */}
            <div className="space-y-1.5">
              <Label htmlFor="relation-type" className="text-sm font-semibold">
                {t("form.type")}
              </Label>
              <RelationTypeSelect
                id="relation-type"
                value={draft.type}
                onChange={(type) => set("type", type)}
                disabled={busy}
              />
            </div>

            {/* Nom */}
            <div className="space-y-1.5">
              <Label htmlFor="relation-label" className="text-sm font-semibold">
                {t("form.label")}
              </Label>
              <Input
                id="relation-label"
                value={draft.label}
                maxLength={100}
                disabled={busy}
                placeholder={t("form.labelPlaceholder")}
                onChange={(e) => set("label", e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {/* Détails (repliés) */}
            <section className="rounded-lg border">
              <button
                type="button"
                aria-expanded={showDetails}
                onClick={() => setShowDetails((value) => !value)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold hover:bg-muted/40"
              >
                {t("form.moreDetails")}
                <ChevronDown className={cn("size-4 transition-transform", !showDetails && "-rotate-90")} />
              </button>

              {showDetails && (
                <div className="space-y-4 border-t px-3 py-3">
                  <div className="space-y-2">
                    <Label htmlFor="relation-intensity">
                      {t("intensity.label")} · {t(`intensity.${draft.intensity}` as "intensity.1")}
                    </Label>
                    <input
                      id="relation-intensity"
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={draft.intensity}
                      disabled={busy}
                      onChange={(e) => set("intensity", Number(e.target.value))}
                      className="h-8 w-full"
                      style={{ accentColor: color }}
                    />
                  </div>

                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">{t("form.sentiment")}</legend>
                    <div className="grid grid-cols-3 gap-2">
                      {SENTIMENTS.map((sentiment) => (
                        <label
                          key={sentiment}
                          className={cn(
                            "flex h-8 cursor-pointer items-center justify-center rounded-md border text-xs",
                            "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                            draft.sentiment === sentiment ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted/50",
                          )}
                        >
                          <input
                            type="radio"
                            name="relation-sentiment"
                            className="sr-only"
                            checked={draft.sentiment === sentiment}
                            onChange={() => set("sentiment", sentiment)}
                          />
                          {t(`sentiments.${sentiment}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">{t("form.period")}</legend>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="relation-since" className="text-xs text-muted-foreground">
                          {t("form.since")}
                        </Label>
                        {nodeSelect("relation-since", draft.sinceNode, (value) => set("sinceNode", value), t("form.start"))}
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="relation-until" className="text-xs text-muted-foreground">
                          {t("form.until")}
                        </Label>
                        {nodeSelect("relation-until", draft.untilNode, (value) => set("untilNode", value), t("form.end"))}
                      </div>
                    </div>
                  </fieldset>

                  <div className="space-y-2">
                    <Label htmlFor="relation-description">{t("form.description")}</Label>
                    <textarea
                      id="relation-description"
                      rows={3}
                      value={draft.description}
                      maxLength={5000}
                      disabled={busy}
                      placeholder={t("form.descriptionPlaceholder")}
                      onChange={(e) => set("description", e.target.value)}
                      className={cn(fieldClass, "resize-y py-2 leading-6")}
                    />
                  </div>
                </div>
              )}
            </section>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          {/* Pied */}
          <div className="flex items-center gap-2 border-t px-4 py-2.5">
            {relationId &&
              (confirmDelete ? (
                <div className="mr-auto flex items-center gap-2 text-sm">
                  <span className="text-destructive">{t("form.deleteConfirm")}</span>
                  <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => void remove()}>
                    {t("form.delete")}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mr-auto text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 />
                  {t("form.delete")}
                </Button>
              ))}

            {!relationId && <span className="mr-auto" />}

            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClose}>
              {t("form.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {relationId ? t("form.save") : t("form.create")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return host ? createPortal(drawer, host) : drawer;
}
