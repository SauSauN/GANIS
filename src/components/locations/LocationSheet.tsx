import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  ChevronRight,
  EyeOff,
  Fingerprint,
  Images,
  Repeat2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LocationFieldInput,
  ParentSelect,
  StatusSelect,
} from "@/components/locations/LocationFields";
import { LocationTypePicker } from "@/components/locations/LocationTypePicker";
import { BannerPicker, TypeBadge } from "@/components/locations/LocationVisuals";
import {
  CATEGORY_ICONS,
  categoryTint,
  typeIcon,
} from "@/components/locations/locationStyle";
import type { LocationLabels } from "@/components/locations/useLocationLabels";
import {
  cardClass,
  cardContentClass,
  cardHeaderClass,
} from "@/components/workspace/views/PageShell";
import {
  IDENTITY_FIELDS,
  MAX_LOCATION_NAME_LENGTH,
  STORY_FIELDS,
  ancestorsOf,
  categoryFields,
  childrenOf,
  fieldByKey,
  findType,
  hiddenFilledKeys,
  typeFields,
  type LocationDraft,
  type LocationField,
} from "@/lib/locations";
import { cn } from "@/lib/utils";
import type { Location, LocationSettings } from "@/types";

export interface BannerControls {
  url: string | null;
  busy?: boolean;
  error?: string | null;
  onPick: (file: File) => void;
  onRemove: () => void;
}

interface LocationSheetProps {
  projectId: string;
  draft: LocationDraft;
  onChange: (draft: LocationDraft) => void;
  /** Lieu modifié ; `null` à la création. */
  selfId: string | null;
  locations: Location[];
  settings: LocationSettings;
  labels: LocationLabels;
  /** Message d'erreur du nom (déjà traduit). */
  nameError?: string | null;
  banner: BannerControls;
  /** Galerie (fournie par la vue : enregistrée ou en attente). */
  gallery: ReactNode;
  /** Bloc affiché après les sections (lieux contenus…). */
  extra?: ReactNode;
  /** Boutons sous les sections. */
  footer: ReactNode;
  /** Ouvre la fiche d'un autre lieu (fil d'Ariane). */
  onOpenLocation?: (id: string) => void;
  /** Ouvre les paramètres des types personnalisés. */
  onManageTypes?: () => void;
  disabled?: boolean;
}

/** Libellé + champ, avec un identifiant commun. */
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

/** Carte de section : icône, titre, description, champs sur deux colonnes. */
function Section({
  icon: Icon,
  title,
  description,
  tint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  tint?: React.CSSProperties;
  children: ReactNode;
}) {
  return (
    <Card className={cardClass}>
      <CardHeader className={cn(cardHeaderClass, "flex flex-row items-center gap-4")}>
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg",
            !tint && "bg-primary/10 text-primary",
          )}
          style={tint}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </span>
      </CardHeader>
      <CardContent className={cn(cardContentClass, "grid gap-x-4 gap-y-5 sm:grid-cols-2")}>
        {children}
      </CardContent>
    </Card>
  );
}

const WIDE_KINDS = new Set(["longText", "tags"]);

/**
 * Fiche d'un lieu : carte de présentation à gauche (image, nom, type,
 * emplacement), et à droite les sections — identité, champs de la
 * catégorie, champs du type, histoire et notes, images. Sert à la
 * création et à la modification.
 */
export function LocationSheet({
  projectId,
  draft,
  onChange,
  selfId,
  locations,
  settings,
  labels,
  nameError,
  banner,
  gallery,
  extra,
  footer,
  onOpenLocation,
  onManageTypes,
  disabled,
}: LocationSheetProps) {
  const { t } = useTranslation("locations");
  const [changingType, setChangingType] = useState(false);

  const customTypes = settings.customTypes;
  const category = findType(draft.type, customTypes)?.category;
  const CategoryIcon = category ? CATEGORY_ICONS[category] : typeIcon(draft.type, undefined);
  const TypeIcon = typeIcon(draft.type, category);

  const ownFields = categoryFields(category);
  const specificFields = typeFields(draft.type, category);
  const hidden = hiddenFilledKeys(draft.fields, draft.type, category);

  // Emplacement : parents connus d'après le brouillon (parent choisi).
  const parent = draft.parentId ? locations.find((item) => item.id === draft.parentId) : undefined;
  const path = parent ? [...ancestorsOf(locations, parent.id), parent] : [];
  const contained = selfId ? childrenOf(locations, selfId).length : 0;

  const set = <K extends keyof LocationDraft>(key: K, value: LocationDraft[K]) =>
    onChange({ ...draft, [key]: value });

  const setField = (key: string, value: string) =>
    onChange({ ...draft, fields: { ...draft.fields, [key]: value } });

  function renderField(field: LocationField | undefined) {
    if (!field) return null;

    return (
      <Field key={field.key} label={labels.field(field.key)} wide={WIDE_KINDS.has(field.kind)}>
        {(id) => (
          <LocationFieldInput
            id={id}
            projectId={projectId}
            field={field}
            value={draft.fields[field.key] ?? ""}
            onChange={(value) => setField(field.key, value)}
            labels={labels}
            locations={locations}
            selfId={selfId}
            disabled={disabled}
          />
        )}
      </Field>
    );
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
      {/* ================================================================
          CARTE DE PRÉSENTATION
          ================================================================ */}
      <Card className={cn(cardClass, "lg:sticky lg:top-0")}>
        <CardContent className="flex flex-col items-center gap-4 px-5 py-5 text-center">
          <BannerPicker
            url={banner.url}
            type={draft.type}
            category={category}
            busy={banner.busy}
            error={banner.error}
            disabled={disabled}
            onPick={banner.onPick}
            onRemove={banner.onRemove}
          />

          <div className="w-full min-w-0 space-y-2">
            <p className={cn("break-words text-lg font-semibold", !draft.name.trim() && "text-muted-foreground")}>
              {draft.name.trim() || t("profile.newLocation")}
            </p>

            <div className="flex flex-wrap justify-center gap-1.5">
              <TypeBadge type={draft.type} customTypes={customTypes} labels={labels} />
              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                {labels.status(draft.status)}
              </span>
            </div>
          </div>

          <div className="w-full space-y-2 border-t pt-4 text-left text-sm">
            {path.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("profile.topLevel")}</p>
            ) : (
              <nav aria-label={t("form.parent")} className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs">
                {path.map((item, index) => (
                  <span key={item.id} className="inline-flex items-center gap-1">
                    {index > 0 && <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />}
                    {onOpenLocation ? (
                      <button
                        type="button"
                        onClick={() => onOpenLocation(item.id)}
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

            {contained > 0 && (
              <p className="text-xs text-muted-foreground">{t("profile.contains", { count: contained })}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ================================================================
          SECTIONS
          ================================================================ */}
      <div className="min-w-0 space-y-8">
        <Section
          icon={Fingerprint}
          title={t("sections.identity.title")}
          description={t("sections.identity.description")}
        >
          <Field label={t("form.name")} wide>
            {(id) => (
              <div className="space-y-2">
                <Input
                  id={id}
                  value={draft.name}
                  maxLength={MAX_LOCATION_NAME_LENGTH}
                  placeholder={t("form.namePlaceholder")}
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

          <Field label={t("form.type")}>
            {(id) => (
              <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-background pr-1 pl-2">
                <span id={id} className="inline-flex min-w-0 items-center gap-2 text-sm">
                  <TypeIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{labels.type(draft.type)}</span>
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => setChangingType(true)}
                >
                  <Repeat2 />
                  {t("picker.change")}
                </Button>
              </div>
            )}
          </Field>

          <Field label={t("form.status")}>
            {(id) => (
              <StatusSelect
                id={id}
                projectId={projectId}
                value={draft.status}
                onChange={(value) => set("status", value)}
                settings={settings}
                labels={labels}
                disabled={disabled}
              />
            )}
          </Field>

          <Field label={t("form.parent")} wide hint={t("form.parentHint")}>
            {(id) => (
              <ParentSelect
                id={id}
                value={draft.parentId}
                onChange={(value) => set("parentId", value)}
                locations={locations}
                selfId={selfId}
                disabled={disabled}
              />
            )}
          </Field>

          {IDENTITY_FIELDS.map((key) => renderField(fieldByKey(key)))}
        </Section>

        {category && ownFields.length > 0 && (
          <Section
            icon={CategoryIcon}
            title={labels.category(category)}
            description={t("sections.category.description")}
            tint={categoryTint(category)}
          >
            {ownFields.map(renderField)}
          </Section>
        )}

        {specificFields.length > 0 && (
          <Section
            icon={TypeIcon}
            title={t("sections.type.title", { type: labels.type(draft.type) })}
            description={t("sections.type.description")}
            tint={categoryTint(category)}
          >
            {specificFields.map(renderField)}
          </Section>
        )}

        <Section
          icon={BookOpen}
          title={t("sections.story.title")}
          description={t("sections.story.description")}
        >
          {STORY_FIELDS.map((key) => renderField(fieldByKey(key)))}
        </Section>

        <Card className={cardClass}>
          <CardHeader className={cn(cardHeaderClass, "flex flex-row items-center gap-4")}>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Images className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <CardTitle>{t("sections.gallery.title")}</CardTitle>
              <CardDescription>{t("sections.gallery.description")}</CardDescription>
            </span>
          </CardHeader>
          <CardContent className={cardContentClass}>{gallery}</CardContent>
        </Card>

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

        {extra}

        {footer}
      </div>

      <Dialog open={changingType} onOpenChange={setChangingType} className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {t("picker.changeTitle", { name: draft.name.trim() || t("profile.newLocation") })}
          </DialogTitle>
          <DialogDescription>{t("picker.changeDescription")}</DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <LocationTypePicker
            value={draft.type}
            customTypes={customTypes}
            labels={labels}
            onManageTypes={
              onManageTypes
                ? () => {
                    setChangingType(false);
                    onManageTypes();
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
