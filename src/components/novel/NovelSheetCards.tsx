import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BookOpenText, Loader2, Maximize2, Minimize2, PenLine, Target } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { NoteEditor } from "@/components/notes/editor/NoteEditor";
import { Button } from "@/components/ui/button";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import { api } from "@/lib/api";
import { fullName } from "@/lib/characters";
import { errorText } from "@/lib/errors";
import { goalPercent, STATUS_COLORS, statusOf } from "@/lib/novel";
import { cn } from "@/lib/utils";
import { useStructureStore } from "@/stores/structureStore";
import "@/components/novel/manuscript.css";
import {
  NARRATIVE_PERSONS,
  NARRATIVE_TENSES,
  WRITING_STATUSES,
  type Character,
  type NodeCharacterLink,
  type NovelFields,
  type StructureNode,
} from "@/types";

const fieldClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

// ----------------------------------------------------------------------------
// Texte de l'élément
// ----------------------------------------------------------------------------

interface NovelTextCardProps {
  projectId: string;
  /** Nom de l'élément (« Scène 2 »), en tête du mode agrandi. */
  label: string;
  /** Texte enregistré (HTML) ; `null` pendant le chargement. */
  initialHtml: string | null;
  failed: boolean;
  /** Mots du texte en cours d'écriture. */
  words: number;
  /** Vrai si l'élément a des documents qui servent de texte tant que celui-ci est vide. */
  hasDocuments: boolean;
  onChange: (editor: Editor) => void;
  onOpenFeature: (featureId: string) => void;
}

/**
 * Texte d'une scène (roman), écrit dans l'éditeur de GANIS. Il est
 * enregistré avec les informations de la fiche (Ctrl+S, enregistrement
 * automatique, question avant de fermer) et repris tel quel dans le
 * manuscrit continu.
 */
export function NovelTextCard({ projectId, label, initialHtml, failed, words, hasDocuments, onChange, onOpenFeature }: NovelTextCardProps) {
  const { t } = useTranslation("novel");
  const [open, setOpen] = useCollapsible("ganis.nodeSheet.novelText.collapsed");
  // Mode agrandi : le même éditeur (rien n'est rechargé ni perdu) occupe la
  // fenêtre, page centrée. Échap ou « Réduire » pour revenir.
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      // Échap ferme d'abord un menu ouvert (suggestions, orthographe, mention).
      if (event.key !== "Escape" || document.querySelector('[role="menu"], [role="listbox"], [role="dialog"][aria-modal="true"]:not([data-novel-text])')) return;
      setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const expand = () => {
    if (!open) setOpen(true);
    setExpanded(true);
  };

  return (
    <CollapsibleCard
      open={open}
      onOpenChange={setOpen}
      icon={PenLine}
      title={t("text.title")}
      description={t("text.description")}
      actions={
        <div className="flex items-center gap-1">
          <span className="text-xs tabular-nums text-muted-foreground">{t("words", { count: words })}</span>
          {!failed && initialHtml !== null && (
            <Button variant="ghost" size="icon-sm" title={t("text.expand")} aria-label={t("text.expand")} onClick={expand}>
              <Maximize2 />
            </Button>
          )}
        </div>
      }
    >
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          {t("text.failed")}
        </p>
      ) : initialHtml === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {t("text.loading")}
        </p>
      ) : (
        <div
          className={cn(expanded ? "fixed inset-0 z-40 flex flex-col bg-background" : "space-y-3")}
          role={expanded ? "dialog" : undefined}
          aria-modal={expanded || undefined}
          aria-label={expanded ? label : undefined}
          data-novel-text=""
        >
          {expanded && (
            <header className="flex shrink-0 items-center gap-3 border-b bg-card/60 px-4 py-2">
              <PenLine className="size-4 text-muted-foreground" aria-hidden="true" />
              <p className="min-w-0 truncate font-medium">{label}</p>
              <span className="text-xs tabular-nums text-muted-foreground">{t("words", { count: words })}</span>
              <Button className="ml-auto" variant="outline" size="sm" onClick={() => setExpanded(false)}>
                <Minimize2 />
                {t("text.collapse")}
              </Button>
            </header>
          )}
          {hasDocuments && words === 0 && (
            <p className={cn("rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground", expanded && "mx-auto mt-4 w-full max-w-[52rem]")}>{t("text.fromDocuments")}</p>
          )}
          {/* Mêmes éléments dans les deux modes : l'éditeur n'est pas recréé. */}
          <div className={cn(expanded && "min-h-0 flex-1 overflow-y-auto px-4 [scrollbar-gutter:stable]")}>
            <div
              className={cn(
                "novel-scene-text overflow-clip rounded-lg border bg-background",
                expanded ? "novel-scene-text-expanded mx-auto my-6 min-h-[calc(100%-3rem)] max-w-[52rem] border-0 bg-transparent" : "min-h-[18rem]",
              )}
            >
              <NoteEditor projectId={projectId} initialContent={initialHtml || null} onChange={onChange} onOpenFeature={onOpenFeature} />
            </div>
          </div>
          <div className={cn("flex justify-end", expanded && "hidden")}>
            <Button variant="ghost" size="sm" onClick={() => onOpenFeature("manuscript.read")}>
              <BookOpenText />
              {t("text.openManuscript")}
            </Button>
          </div>
        </div>
      )}
    </CollapsibleCard>
  );
}

// ----------------------------------------------------------------------------
// Écriture : objectif, état de rédaction, narration
// ----------------------------------------------------------------------------

interface NovelWritingCardProps {
  projectId: string;
  node: StructureNode;
  /** Mots de l'élément, éléments contenus compris. */
  totalWords: number;
  /** Chapitre : l'état de rédaction se suit ici. */
  isChapter: boolean;
  /** Scène (ou élément qui reçoit du texte) : paramètres de narration. */
  isScene: boolean;
  characters: Character[];
  links: NodeCharacterLink[] | null;
}

/**
 * Réglages du romancier pour un élément. Chaque changement est enregistré
 * aussitôt (comme le statut d'un projet).
 */
export function NovelWritingCard({ projectId, node, totalWords, isChapter, isScene, characters, links }: NovelWritingCardProps) {
  const { t } = useTranslation("novel");
  const [open, setOpen] = useCollapsible("ganis.nodeSheet.novelWriting.collapsed");
  const applyNode = useStructureStore((s) => s.applyNode);
  const linkCharacter = useStructureStore((s) => s.linkCharacter);
  const [goal, setGoal] = useState(node.wordGoal ? String(node.wordGoal) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // L'objectif suit l'élément s'il change ailleurs (plan, suivi de rédaction).
  useEffect(() => setGoal(node.wordGoal ? String(node.wordGoal) : ""), [node.wordGoal]);

  const fields: NovelFields = {
    wordGoal: node.wordGoal,
    writingStatus: node.writingStatus,
    narrativePerson: node.narrativePerson,
    narrativeTense: node.narrativeTense,
  };

  async function save(changes: Partial<NovelFields>) {
    setBusy(true);
    setError(null);
    try {
      applyNode(projectId, await api.setStructureNodeNovel(projectId, node.id, { ...fields, ...changes }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function commitGoal() {
    const value = goal.trim() === "" ? null : Number.parseInt(goal, 10);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setGoal(node.wordGoal ? String(node.wordGoal) : "");
      return;
    }
    if ((value || null) !== node.wordGoal) void save({ wordGoal: value || null });
  }

  // Point de vue : le personnage lié avec le rôle « pov ».
  const nodeLinks = links?.filter((link) => link.nodeId === node.id) ?? [];
  const pov = nodeLinks.find((link) => link.role === "pov")?.characterId ?? "";

  async function setPov(characterId: string) {
    setError(null);
    try {
      // L'ancien point de vue reste présent dans la scène.
      if (pov && pov !== characterId) await linkCharacter(projectId, node.id, pov, "present");
      if (characterId) await linkCharacter(projectId, node.id, characterId, "pov");
    } catch (e) {
      setError(errorText(e));
    }
  }

  const percent = goalPercent(totalWords, node.wordGoal);

  return (
    <CollapsibleCard open={open} onOpenChange={setOpen} icon={Target} title={t("writing.title")} description={t("writing.description")}>
      <div className="space-y-5">
        {/* Mots et objectif */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("writing.words")} hint={t("writing.wordsHint")}>
            <p className="flex h-9 items-center text-lg font-semibold tabular-nums">
              {node.wordGoal ? t("wordsOfGoal", { words: totalWords.toLocaleString(), goal: node.wordGoal.toLocaleString() }) : t("words", { count: totalWords })}
            </p>
            {percent !== null && <ProgressBar percent={percent} />}
          </Field>
          <Field label={t("writing.goal")} hint={t("writing.goalHint")} htmlFor={`novel-goal-${node.id}`}>
            <input
              id={`novel-goal-${node.id}`}
              type="number"
              min={0}
              step={100}
              inputMode="numeric"
              value={goal}
              placeholder={t("writing.goalPlaceholder")}
              disabled={busy}
              onChange={(e) => setGoal(e.target.value)}
              onBlur={commitGoal}
              onKeyDown={(e) => e.key === "Enter" && commitGoal()}
              className={fieldClass}
            />
          </Field>
        </div>

        {/* État de rédaction (chapitres) */}
        {isChapter && (
          <Field label={t("writing.status")} hint={t("writing.statusHint")}>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("writing.status")}>
              {WRITING_STATUSES.map((status) => {
                const selected = statusOf(node) === status;
                return (
                  <button
                    key={status}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={busy}
                    onClick={() => !selected && void save({ writingStatus: status })}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors hover:bg-muted",
                      selected && "border-transparent font-medium text-white hover:opacity-90",
                    )}
                    style={selected ? { backgroundColor: STATUS_COLORS[status] } : undefined}
                  >
                    {!selected && <span className="size-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} aria-hidden="true" />}
                    {t(`status.${status}`)}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        {/* Narration (scènes) */}
        {isScene && (
          <div className="space-y-3 border-t pt-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("writing.pov")} hint={t("writing.povHint")} htmlFor={`novel-pov-${node.id}`}>
                <select id={`novel-pov-${node.id}`} value={pov} disabled={!links} onChange={(e) => void setPov(e.target.value)} className={fieldClass}>
                  <option value="">{characters.length ? t("none") : t("writing.noCharacters")}</option>
                  {characters.map((character) => (
                    <option key={character.id} value={character.id}>
                      {fullName(character) || "—"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("writing.person")} htmlFor={`novel-person-${node.id}`}>
                <select
                  id={`novel-person-${node.id}`}
                  value={node.narrativePerson ?? ""}
                  disabled={busy}
                  onChange={(e) => void save({ narrativePerson: (e.target.value || null) as NovelFields["narrativePerson"] })}
                  className={fieldClass}
                >
                  <option value="">{t("notSet")}</option>
                  {NARRATIVE_PERSONS.map((person) => (
                    <option key={person} value={person}>
                      {t(`person.${person}`)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("writing.tense")} htmlFor={`novel-tense-${node.id}`}>
                <select
                  id={`novel-tense-${node.id}`}
                  value={node.narrativeTense ?? ""}
                  disabled={busy}
                  onChange={(e) => void save({ narrativeTense: (e.target.value || null) as NovelFields["narrativeTense"] })}
                  className={fieldClass}
                >
                  <option value="">{t("notSet")}</option>
                  {NARRATIVE_TENSES.map((tense) => (
                    <option key={tense} value={tense}>
                      {t(`tense.${tense}`)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">{t("writing.narrationHint")}</p>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </CollapsibleCard>
  );
}

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="block text-sm font-medium">
          {label}
        </label>
      ) : (
        <p className="text-sm font-medium">{label}</p>
      )}
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Barre d'avancement vers un objectif (pleine au-delà de 100 %). */
export function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full", percent >= 100 ? "bg-success" : "bg-primary")} style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  );
}
