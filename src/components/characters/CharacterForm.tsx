import { useEffect, useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Eye, Fingerprint, Sparkles, type LucideIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PortraitPicker } from "@/components/characters/PortraitPicker";
import { PlaceField } from "@/components/locations/PlaceField";
import {
  ChoiceField,
  ColorsField,
  ReferenceField,
  TagsField,
  useListLabel,
} from "@/components/characters/fields/SpecialFields";
import {
  cardClass,
  cardContentClass,
  cardHeaderClass,
  fieldClass,
} from "@/components/workspace/views/PageShell";
import {
  MAX_NAME_LENGTH,
  fieldsOfLevel,
  fullName,
  levelProgress,
  levelsUpTo,
  parseList,
  type CharacterDraft,
  type CharacterField,
} from "@/lib/characters";
import { cn } from "@/lib/utils";
import type { CharacterDetailLevel } from "@/types";

export interface PortraitControls {
  /** Clé de couleur des initiales (identifiant du personnage, ou provisoire). */
  colorKey: string;
  url: string | null;
  busy?: boolean;
  error?: string | null;
  onPick: (file: File) => void;
  onRemove: () => void;
}

interface CharacterSheetProps {
  projectId: string;
  draft: CharacterDraft;
  onChange: (draft: CharacterDraft) => void;
  /** Niveau de détail des fiches du projet. */
  level: CharacterDetailLevel;
  /** Message d'erreur du prénom / nom (déjà traduit). */
  nameError?: string | null;
  portrait: PortraitControls;
  /** Galerie de références (niveau 2), fournie par la vue. */
  gallery: ReactNode;
  /** Nombre d'images de la galerie (progression). */
  galleryCount: number;
  /** Boutons sous les sections. */
  footer: ReactNode;
  disabled?: boolean;
}

const LEVEL_ICONS: Record<CharacterDetailLevel, LucideIcon> = {
  basic: Fingerprint,
  intermediate: Eye,
  advanced: Sparkles,
};

/** Niveaux repliés, mémorisés sur l'appareil (pour toutes les fiches). */
const COLLAPSED_KEY = "ganis.characterSheet.collapsed";

function loadCollapsed(): Set<CharacterDetailLevel> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]");
    return new Set(Array.isArray(raw) ? (raw as CharacterDetailLevel[]) : []);
  } catch {
    return new Set();
  }
}

function saveCollapsed(collapsed: Set<CharacterDetailLevel>) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch {
    // Stockage indisponible : le choix vaut pour cette fiche seulement.
  }
}

/** Champs qui prennent toute la largeur de la section. */
const WIDE_KINDS = new Set(["longText", "tags", "colors"]);
const WIDE_KEYS = new Set([
  "firstAppearance",
  "mainGoal",
  "distinctiveTrait",
  "accessories",
  "beliefs",
  "adversityResponse",
]);

/** Libellé + champ, avec un identifiant commun. */
function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: (id: string) => ReactNode;
}) {
  const id = useId();

  return (
    <div className={cn("space-y-2", wide && "sm:col-span-2")}>
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
    </div>
  );
}

/** Barre de progression d'un niveau. */
function ProgressBar({ filled, total }: { filled: number; total: number }) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
      <span
        className="block h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${Math.round((filled / total) * 100)}%` }}
      />
    </span>
  );
}

/**
 * Fiche d'un personnage : carte de profil à gauche (image, nom, rôle,
 * palette, progression), et une section par niveau à droite (identité,
 * apparence, personnalité), jusqu'au niveau du projet. Sert à la
 * création et à la modification.
 */
export function CharacterSheet({
  projectId,
  draft,
  onChange,
  level,
  nameError,
  portrait,
  gallery,
  galleryCount,
  footer,
  disabled,
}: CharacterSheetProps) {
  const { t } = useTranslation("characters");
  const listLabel = useListLabel();
  const sectionId = useId();
  const [collapsed, setCollapsed] = useState<Set<CharacterDetailLevel>>(loadCollapsed);

  function setOpen(level: CharacterDetailLevel, open: boolean) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (open) next.delete(level);
      else next.add(level);
      saveCollapsed(next);
      return next;
    });
  }

  // Nom manquant : l'identité est dépliée pour que l'erreur soit visible.
  useEffect(() => {
    if (nameError) setOpen("basic", true);
  }, [nameError]);

  /** Déplie un niveau (s'il est replié) et l'amène à l'écran. */
  function goTo(level: CharacterDetailLevel) {
    setOpen(level, true);
    requestAnimationFrame(() =>
      document
        .getElementById(`${sectionId}-${level}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  const levels = levelsUpTo(level);
  const name = fullName(draft);
  const nickname = draft.fields.nickname?.trim();
  const palette = parseList(draft.fields.colorPalette);
  const images = { portrait: portrait.url !== null, gallery: galleryCount };

  const set = <K extends keyof CharacterDraft>(key: K, value: CharacterDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const setField = (key: string, value: string) =>
    onChange({ ...draft, fields: { ...draft.fields, [key]: value } });

  const label = (key: string) => t(`fields.${key}` as "fields.age");

  /** Exemple affiché dans un champ vide (`placeholders.<clé>`), s'il existe. */
  const example = (key: string): string | undefined =>
    (t as unknown as (key: string, options: object) => string)(`placeholders.${key}`, {
      defaultValue: "",
    }) || undefined;

  function renderField(field: CharacterField) {
    const value = draft.fields[field.key] ?? "";
    const change = (next: string) => setField(field.key, next);
    const placeholder = example(field.key);

    return (
      <Field key={field.key} label={label(field.key)} wide={WIDE_KINDS.has(field.kind) || WIDE_KEYS.has(field.key)}>
        {(id) => {
          switch (field.kind) {
            case "choice":
              return (
                <ChoiceField
                  id={id}
                  projectId={projectId}
                  list={field.list!}
                  value={value}
                  onChange={change}
                  allowEmpty
                  disabled={disabled}
                />
              );
            case "reference":
              return (
                <ReferenceField
                  id={id}
                  projectId={projectId}
                  value={value}
                  onChange={change}
                  disabled={disabled}
                />
              );
            case "place":
              return (
                <PlaceField
                  id={id}
                  projectId={projectId}
                  value={value}
                  onChange={change}
                  placeholder={placeholder}
                  maxLength={field.maxLength}
                  disabled={disabled}
                />
              );
            case "tags":
              return (
                <TagsField
                  id={id}
                  value={value}
                  onChange={change}
                  placeholder={t("placeholders.tags")}
                  disabled={disabled}
                />
              );
            case "colors":
              return <ColorsField id={id} value={value} onChange={change} disabled={disabled} />;
            case "date":
              return (
                <Input
                  id={id}
                  type="date"
                  value={value}
                  disabled={disabled}
                  onChange={(e) => change(e.target.value)}
                />
              );
            case "longText":
              return (
                <textarea
                  id={id}
                  rows={3}
                  value={value}
                  maxLength={field.maxLength}
                  placeholder={placeholder}
                  disabled={disabled}
                  onChange={(e) => change(e.target.value)}
                  className={cn(fieldClass, "resize-y py-2 leading-6 placeholder:text-muted-foreground")}
                />
              );
            default:
              return (
                <Input
                  id={id}
                  value={value}
                  maxLength={field.maxLength}
                  placeholder={placeholder}
                  disabled={disabled}
                  onChange={(e) => change(e.target.value)}
                />
              );
          }
        }}
      </Field>
    );
  }

  /** Champs du niveau 1, dans l'ordre de la fiche. */
  function renderIdentity() {
    const fields = Object.fromEntries(fieldsOfLevel("basic").map((field) => [field.key, field]));
    const pick = (...keys: string[]) => keys.map((key) => renderField(fields[key]));

    return (
      <>
        <div className="space-y-2 sm:col-span-2">
          <p className="text-sm font-medium">{label("fullName")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              aria-label={label("firstName")}
              placeholder={example("firstName")}
              value={draft.firstName}
              maxLength={MAX_NAME_LENGTH}
              aria-invalid={nameError ? true : undefined}
              disabled={disabled}
              onChange={(e) => set("firstName", e.target.value)}
            />
            <Input
              aria-label={label("lastName")}
              placeholder={example("lastName")}
              value={draft.lastName}
              maxLength={MAX_NAME_LENGTH}
              aria-invalid={nameError ? true : undefined}
              disabled={disabled}
              onChange={(e) => set("lastName", e.target.value.toLocaleUpperCase())}
            />
          </div>
          {nameError && (
            <p role="alert" className="text-sm text-destructive">
              {nameError}
            </p>
          )}
        </div>

        {pick("nickname", "age", "birthDate", "gender")}

        <Field label={label("status")}>
          {(id) => (
            <ChoiceField
              id={id}
              projectId={projectId}
              list="status"
              value={draft.status}
              onChange={(value) => set("status", value)}
              disabled={disabled}
            />
          )}
        </Field>

        <Field label={label("role")}>
          {(id) => (
            <ChoiceField
              id={id}
              projectId={projectId}
              list="role"
              value={draft.role}
              onChange={(value) => set("role", value)}
              disabled={disabled}
            />
          )}
        </Field>

        {pick(
          "occupation",
          "origin",
          "firstAppearance",
          "mainGoal",
          "distinctiveTrait",
          "description",
          "notes",
        )}
      </>
    );
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
      {/* ================================================================
          CARTE DE PROFIL
          ================================================================ */}
      <Card className={cn(cardClass, "lg:sticky lg:top-0")}>
        <CardContent className="flex flex-col items-center gap-4 px-6 py-6 text-center">
          <PortraitPicker
            colorKey={portrait.colorKey}
            name={name}
            url={portrait.url}
            busy={portrait.busy}
            error={portrait.error}
            disabled={disabled}
            size="2xl"
            ringColors={palette}
            onPick={portrait.onPick}
            onRemove={portrait.onRemove}
          />

          <div className="w-full min-w-0 space-y-1">
            <p className={cn("break-words text-lg font-semibold", !name && "text-muted-foreground")}>
              {name || t("profile.newCharacter")}
            </p>
            {nickname && <p className="truncate text-sm text-muted-foreground italic">{nickname}</p>}
          </div>

          <div className="flex flex-wrap justify-center gap-1.5">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {listLabel("role", draft.role)}
            </span>
            <span className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">
              {listLabel("status", draft.status)}
            </span>
          </div>

          <div className="w-full space-y-3 border-t pt-4 text-left">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t("profile.progress")}
            </p>

            {levels.map((item) => {
              const progress = levelProgress(draft, item, images);

              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => goTo(item)}
                  className="block w-full space-y-1.5 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex items-baseline justify-between gap-2 text-sm">
                    <span>{t(`levels.${item}.theme`)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {progress.filled} / {progress.total}
                    </span>
                  </span>
                  <ProgressBar {...progress} />
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ================================================================
          SECTIONS PAR NIVEAU
          ================================================================ */}
      <div className="min-w-0 space-y-8">
        {levels.map((item, index) => {
          const Icon = LEVEL_ICONS[item];
          const progress = levelProgress(draft, item, images);
          const open = !collapsed.has(item);

          return (
            <Card key={item} id={`${sectionId}-${item}`} className={cn(cardClass, "scroll-mt-4")}>
              {/* En-tête cliquable : replie ou déplie le niveau. */}
              <CardHeader className={cn(cardHeaderClass, "p-0", !open && "border-b-0")}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={`${sectionId}-${item}-content`}
                  title={open ? t("levels.collapse") : t("levels.expand")}
                  onClick={() => setOpen(item, !open)}
                  className="flex w-full items-center gap-4 rounded-t-xl px-6 py-5 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <CardTitle>
                      <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                      {t(`levels.${item}.theme`)}
                    </CardTitle>
                    <CardDescription>{t(`levels.${item}.goal`)}</CardDescription>
                  </span>

                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground tabular-nums">
                    {progress.filled} / {progress.total}
                  </span>

                  <ChevronDown
                    className={cn(
                      "size-5 shrink-0 text-muted-foreground transition-transform duration-300",
                      !open && "-rotate-90",
                    )}
                    aria-hidden="true"
                  />
                </button>
              </CardHeader>

              {/* Repli animé : la hauteur passe de 0 à « auto » (grille 0fr → 1fr). */}
              <div
                id={`${sectionId}-${item}-content`}
                inert={!open}
                className={cn(
                  "grid transition-[grid-template-rows] duration-300 ease-out",
                  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  <CardContent className={cn(cardContentClass, "grid gap-x-4 gap-y-5 sm:grid-cols-2")}>
                    {item === "basic" && renderIdentity()}
                    {item === "intermediate" && (
                      <>
                        {fieldsOfLevel("intermediate").map(renderField)}
                        {gallery}
                      </>
                    )}
                    {item === "advanced" && fieldsOfLevel("advanced").map(renderField)}
                  </CardContent>
                </div>
              </div>
            </Card>
          );
        })}

        {footer}
      </div>
    </div>
  );
}