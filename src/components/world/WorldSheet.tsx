import { useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, ChevronRight, EyeOff, Fingerprint, Images, Repeat2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CollapsibleCard, useCollapsible } from "@/components/workspace/views/CollapsibleCard";
import { cardClass, cardContentClass } from "@/components/workspace/views/PageShell";
import { WorldFieldInput, WorldParentSelect, WorldStatusSelect } from "@/components/world/WorldFields";
import { WorldTypePicker } from "@/components/world/WorldTypePicker";
import { WorldBanner, WorldTypeBadge } from "@/components/world/WorldVisuals";
import type { WorldLabels } from "@/components/world/useWorldLabels";
import { categoryIcon, categoryTint, typeIcon } from "@/components/world/worldStyle";
import {
  MAX_WORLD_NAME_LENGTH,
  ancestorsOf,
  categoryFields,
  childrenOf,
  defaultStatus,
  fieldByKey,
  fieldFitsNature,
  findType,
  hasNature,
  hiddenFilledKeys,
  levelHiddenFilledKeys,
  levelParts,
  typeFields,
  type WorldDraft,
  type WorldField,
} from "@/lib/world";
import { parseList } from "@/lib/characters";
import { cn } from "@/lib/utils";
import type { SpeciesNature, WorldEntry, WorldModule, WorldSettings } from "@/types";

export interface WorldBannerControls {
  url: string | null;
  busy?: boolean;
  error?: string | null;
  onPick: (file: File) => void;
  onRemove: () => void;
}

interface WorldSheetProps {
  projectId: string;
  module: WorldModule;
  draft: WorldDraft;
  onChange: (draft: WorldDraft) => void;
  /** Fiche modifiée ; `null` à la création. */
  selfId: string | null;
  entries: WorldEntry[];
  settings: WorldSettings;
  labels: WorldLabels;
  nameError?: string | null;
  banner: WorldBannerControls;
  gallery: ReactNode;
  /** Cartes affichées après les sections (personnage, liens, contenu…). */
  extra?: ReactNode;
  footer: ReactNode;
  onOpenEntry?: (id: string) => void;
  onManage?: () => void;
  disabled?: boolean;
}

function Field({
  label,
  wide,
  hint,
  children,
}: {
  label: string;
  wide?: boolean;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-2", wide && "sm:col-span-2")}>
      <Label htmlFor={id}>{label}</Label>
      {children(id)}
      {hint && <p className="text-xs leading-5 text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Section({
  storageKey,
  icon,
  title,
  description,
  tint,
  forceOpen,
  children,
}: {
  storageKey: string;
  icon: LucideIcon;
  title: string;
  description: string;
  tint?: CSSProperties;
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useCollapsible(storageKey);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen, setOpen]);

  return (
    <CollapsibleCard
      open={open}
      onOpenChange={setOpen}
      icon={icon}
      title={title}
      description={description}
      tint={tint}
      contentClassName={cn(cardContentClass, "grid gap-x-4 gap-y-5 sm:grid-cols-2")}
    >
      {children}
    </CollapsibleCard>
  );
}

const WIDE_KINDS = new Set(["longText", "tags", "colors"]);
const NATURES: SpeciesNature[] = ["species", "individual"];

/**
 * Fiche d'un objet ou d'une espèce : carte de présentation à gauche (image,
 * nom, type, emplacement), sections à droite — identité, champs de la
 * catégorie, champs du type, histoire et notes, images. Sert à la création
 * et à la modification.
 */
export function WorldSheet({
  projectId,
  module,
  draft,
  onChange,
  selfId,
  entries,
  settings,
  labels,
  nameError,
  banner,
  gallery,
  extra,
  footer,
  onOpenEntry,
  onManage,
  disabled,
}: WorldSheetProps) {
  const { t } = useTranslation("world");
  const [changingType, setChangingType] = useState(false);
  const [galleryOpen, setGalleryOpen] = useCollapsible(`ganis.worldSheet.${module}.gallery.collapsed`);

  const customTypes = settings.customTypes;
  const nature = hasNature(module) ? (draft.nature ?? "species") : null;
  const category = findType(module, draft.type, customTypes)?.category;
  const CategoryIcon = categoryIcon(module, category);
  const TypeIcon = typeIcon(module, draft.type, category);

  const parts = levelParts(module, settings.detailLevel);
  const ownFields = parts.category ? categoryFields(module, category, nature) : [];
  const specificFields = parts.type ? typeFields(module, draft.type, category, nature) : [];
  const hidden = hiddenFilledKeys(module, draft.fields, draft.type, category, nature);
  const hiddenByLevel = levelHiddenFilledKeys(module, draft.fields, draft.type, category, nature, settings.detailLevel);

  const parent = draft.parentId ? entries.find((item) => item.id === draft.parentId) : undefined;
  const path = parent ? [...ancestorsOf(entries, parent.id), parent] : [];
  const contained = selfId ? childrenOf(entries, selfId).length : 0;

  const set = <K extends keyof WorldDraft>(key: K, value: WorldDraft[K]) => onChange({ ...draft, [key]: value });
  const setField = (key: string, value: string) => onChange({ ...draft, fields: { ...draft.fields, [key]: value } });

  function setNature(next: SpeciesNature) {
    // Le statut par défaut suit la nature (« Commun » pour une espèce,
    // « Vivant » pour un animal) tant que l'auteur ne l'a pas changé.
    const status = draft.status === defaultStatus(module, nature) ? defaultStatus(module, next) : draft.status;
    onChange({ ...draft, nature: next, status });
  }

  function renderField(field: WorldField | undefined) {
    if (!field || !fieldFitsNature(field, nature)) return null;
    return (
      <Field key={field.key} label={labels.field(field.key)} wide={WIDE_KINDS.has(field.kind)}>
        {(id) => (
          <WorldFieldInput
            id={id}
            projectId={projectId}
            field={field}
            value={draft.fields[field.key] ?? ""}
            onChange={(value) => setField(field.key, value)}
            labels={labels}
            disabled={disabled}
          />
        )}
      </Field>
    );
  }

  // « Rangé dans » (objet), « Espèce » (animal précis), « Fait partie de » (espèce).
  const parentKey = module === "item" ? "item" : nature === "individual" ? "individual" : "species";
  const displayName = draft.name.trim() || labels.text("profile.new");

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
      {/* Carte de présentation */}
      <Card className={cn(cardClass, "lg:sticky lg:top-0")}>
        <CardContent className="flex flex-col items-center gap-4 px-5 py-5 text-center">
          <WorldBanner
            module={module}
            url={banner.url}
            type={draft.type}
            category={category}
            busy={banner.busy}
            error={banner.error}
            disabled={disabled}
            ringColors={parseList(draft.fields.colorPalette)}
            onPick={banner.onPick}
            onRemove={banner.onRemove}
          />

          <div className="w-full min-w-0 space-y-2">
            <p className={cn("break-words text-lg font-semibold", !draft.name.trim() && "text-muted-foreground")}>
              {displayName}
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              <WorldTypeBadge module={module} type={draft.type} customTypes={customTypes} labels={labels} />
              {nature && (
                <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{labels.nature(nature)}</span>
              )}
              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{labels.status(draft.status)}</span>
            </div>
          </div>

          <div className="w-full space-y-2 border-t pt-4 text-left text-sm">
            {path.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t(`parent.${parentKey}.none`)}</p>
            ) : (
              <nav aria-label={t(`parent.${parentKey}.label`)} className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs">
                {path.map((item, index) => (
                  <span key={item.id} className="inline-flex items-center gap-1">
                    {index > 0 && <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />}
                    {onOpenEntry ? (
                      <button
                        type="button"
                        onClick={() => onOpenEntry(item.id)}
                        className="rounded text-primary underline-offset-4 hover:underline"
                      >
                        {item.name}
                      </button>
                    ) : (
                      <span>{item.name}</span>
                    )}
                  </span>
                ))}
              </nav>
            )}
            {contained > 0 && <p className="text-xs text-muted-foreground">{labels.text("profile.contains", { count: contained })}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Sections */}
      <div className="min-w-0 space-y-8">
        <Section
          storageKey={`ganis.worldSheet.${module}.identity.collapsed`}
          forceOpen={Boolean(nameError)}
          icon={Fingerprint}
          title={t("sections.identity.title")}
          description={labels.text("sections.identity")}
        >
          <Field label={t("form.name")} wide>
            {(id) => (
              <div className="space-y-2">
                <Input
                  id={id}
                  value={draft.name}
                  maxLength={MAX_WORLD_NAME_LENGTH}
                  placeholder={labels.text("form.namePlaceholder")}
                  aria-invalid={nameError ? true : undefined}
                  disabled={disabled}
                  onChange={(e) => set("name", e.target.value)}
                />
                {nameError && (
                  <p role="alert" className="text-sm text-destructive">
                    {nameError}
                  </p>
                )}
              </div>
            )}
          </Field>

          {nature && (
            <div className="space-y-2 sm:col-span-2">
              <p className="text-sm font-medium">{t("natures.title")}</p>
              <div role="radiogroup" aria-label={t("natures.title")} className="grid gap-2 sm:grid-cols-2">
                {NATURES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="radio"
                    aria-checked={nature === item}
                    disabled={disabled}
                    onClick={() => setNature(item)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      nature === item ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <span className="block text-sm font-medium">{labels.nature(item)}</span>
                    <span className="block text-xs leading-5 text-muted-foreground">{t(`natures.${item}.description`)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <Field label={t("form.type")}>
            {(id) => (
              <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-background pr-1 pl-2">
                <span id={id} className="inline-flex min-w-0 items-center gap-2 text-sm">
                  <TypeIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{labels.type(draft.type)}</span>
                </span>
                <Button type="button" size="xs" variant="ghost" disabled={disabled} onClick={() => setChangingType(true)}>
                  <Repeat2 />
                  {t("picker.change")}
                </Button>
              </div>
            )}
          </Field>

          <Field label={t("form.status")}>
            {(id) => (
              <WorldStatusSelect
                id={id}
                projectId={projectId}
                module={module}
                value={draft.status}
                onChange={(value) => set("status", value)}
                settings={settings}
                labels={labels}
                disabled={disabled}
              />
            )}
          </Field>

          <Field label={t(`parent.${parentKey}.label`)} wide hint={t(`parent.${parentKey}.hint`)}>
            {(id) => (
              <WorldParentSelect
                id={id}
                module={module}
                value={draft.parentId}
                onChange={(value) => set("parentId", value)}
                entries={entries}
                selfId={selfId}
                emptyLabel={t(`parent.${parentKey}.empty`)}
                disabled={disabled}
              />
            )}
          </Field>

          {parts.identity.map((key) => renderField(fieldByKey(module, key)))}
        </Section>

        {category && ownFields.length > 0 && (
          <Section
            storageKey={`ganis.worldSheet.${module}.category.collapsed`}
            icon={CategoryIcon}
            title={labels.category(category)}
            description={t("sections.category.description")}
            tint={categoryTint(module, category)}
          >
            {ownFields.map(renderField)}
          </Section>
        )}

        {specificFields.length > 0 && (
          <Section
            storageKey={`ganis.worldSheet.${module}.type.collapsed`}
            icon={TypeIcon}
            title={t("sections.type.title", { type: labels.type(draft.type) })}
            description={t("sections.type.description")}
            tint={categoryTint(module, category)}
          >
            {specificFields.map(renderField)}
          </Section>
        )}

        <Section
          storageKey={`ganis.worldSheet.${module}.story.collapsed`}
          icon={BookOpen}
          title={t("sections.story.title")}
          description={labels.text("sections.story")}
        >
          {parts.story.map((key) => renderField(fieldByKey(module, key)))}
        </Section>

        <CollapsibleCard
          open={galleryOpen}
          onOpenChange={setGalleryOpen}
          icon={Images}
          title={t("sections.gallery.title")}
          description={labels.text("sections.gallery")}
        >
          {gallery}
        </CollapsibleCard>

        {hidden.length > 0 && (
          <div className="flex gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-sm">
            <EyeOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium">{t("sections.hidden.title")}</p>
              <p className="text-muted-foreground">{t("sections.hidden.description")}</p>
              <p className="text-muted-foreground">
                {t("sections.hidden.list", { fields: hidden.map(labels.field).join(", ") })}
              </p>
            </div>
          </div>
        )}

        {hiddenByLevel.length > 0 && (
          <div className="flex gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-sm">
            <EyeOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium">{t("sections.hiddenByLevel.title")}</p>
              <p className="text-muted-foreground">
                {t("sections.hiddenByLevel.description", { fields: hiddenByLevel.map(labels.field).join(", ") })}
              </p>
            </div>
          </div>
        )}

        {extra}
        {footer}
      </div>

      <Dialog open={changingType} onOpenChange={setChangingType} className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("picker.changeTitle", { name: displayName })}</DialogTitle>
          <DialogDescription>{t("picker.changeDescription")}</DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <WorldTypePicker
            module={module}
            value={draft.type}
            settings={settings}
            labels={labels}
            onManage={
              onManage
                ? () => {
                    setChangingType(false);
                    onManage();
                  }
                : undefined
            }
            onSelect={(type) => {
              set("type", type);
              setChangingType(false);
            }}
          />
        </div>
      </Dialog>
    </div>
  );
}
