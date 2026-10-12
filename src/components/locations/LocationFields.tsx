import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReferenceField, TagsField } from "@/components/characters/fields/SpecialFields";
import type { LocationLabels } from "@/components/locations/useLocationLabels";
import { fieldClass } from "@/components/workspace/views/PageShell";
import { fullName } from "@/lib/characters";
import {
  buildLocationTree,
  flattenTree,
  selfAndDescendants,
  statusValues,
  type LocationField,
} from "@/lib/locations";
import { cn } from "@/lib/utils";
import { useProjectCharacters } from "@/stores/characterStore";
import { useLocationStore } from "@/stores/locationStore";
import type { Location, LocationSettings } from "@/types";

const selectClass = cn(fieldClass, "h-9");

// ----------------------------------------------------------------------------
// Lieu choisi parmi les lieux du projet (parent, capitale, suzerain…)
// ----------------------------------------------------------------------------

interface LocationSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  locations: Location[];
  /** Lieux à ne pas proposer (le lieu lui-même, ses descendants…). */
  exclude?: Set<string>;
  /** Libellé de l'option vide. */
  emptyLabel: string;
  /** Options ajoutées en fin de liste (ex. « Autre lieu… »). */
  extraOptions?: { value: string; label: string }[];
  disabled?: boolean;
}

/** Liste déroulante des lieux, en arborescence (indentation). */
export function LocationSelect({
  id,
  value,
  onChange,
  locations,
  exclude,
  emptyLabel,
  extraOptions,
  disabled,
}: LocationSelectProps) {
  const { t } = useTranslation("locations");
  const nodes = flattenTree(buildLocationTree(locations)).filter(
    (node) => !exclude?.has(node.location.id),
  );
  const known = !value || locations.some((location) => location.id === value);
  const byId = new Map(locations.map((location) => [location.id, location]));

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={selectClass}
    >
      <option value="">{emptyLabel}</option>
      {nodes.map((node) => {
        // Le parent est indiqué à côté du nom (et non par une indentation,
        // qui resterait visible une fois le lieu choisi).
        const parent = node.location.parentId ? byId.get(node.location.parentId) : undefined;

        return (
          <option key={node.location.id} value={node.location.id}>
            {parent ? `${node.location.name} · ${parent.name}` : node.location.name}
          </option>
        );
      })}
      {!known && <option value={value}>{t("link.deleted")}</option>}
      {extraOptions?.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

// ----------------------------------------------------------------------------
// Personnage du projet (dirigeant…)
// ----------------------------------------------------------------------------

export function CharacterSelect({
  id,
  projectId,
  value,
  onChange,
  emptyLabel,
  disabled,
}: {
  id: string;
  projectId: string;
  value: string;
  onChange: (value: string) => void;
  /** Libellé de l'option vide (par défaut « Non précisé »). */
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation("locations");
  const { characters, loaded } = useProjectCharacters(projectId);
  const known = !value || !loaded || characters.some((character) => character.id === value);

  return (
    <select
      id={id}
      value={value}
      disabled={disabled || !loaded}
      onChange={(e) => onChange(e.target.value)}
      className={selectClass}
    >
      <option value="">
        {loaded && characters.length === 0 ? t("link.noCharacters") : (emptyLabel ?? t("link.none"))}
      </option>
      {characters.map((character) => (
        <option key={character.id} value={character.id}>
          {fullName(character)}
        </option>
      ))}
      {!known && <option value={value}>{t("link.deleted")}</option>}
    </select>
  );
}

// ----------------------------------------------------------------------------
// Champ du catalogue
// ----------------------------------------------------------------------------

interface LocationFieldInputProps {
  id: string;
  projectId: string;
  field: LocationField;
  value: string;
  onChange: (value: string) => void;
  labels: LocationLabels;
  /** Lieux du projet (champs « lieu »). */
  locations: Location[];
  /** Lieu de la fiche (exclu des champs « lieu ») ; `null` à la création. */
  selfId: string | null;
  disabled?: boolean;
}

/** Saisie d'un champ du catalogue, selon sa nature. */
export function LocationFieldInput({
  id,
  projectId,
  field,
  value,
  onChange,
  labels,
  locations,
  selfId,
  disabled,
}: LocationFieldInputProps) {
  const { t } = useTranslation("locations");
  const placeholder = labels.placeholder(field.key);

  switch (field.kind) {
    case "longText":
      return (
        <textarea
          id={id}
          rows={3}
          value={value}
          maxLength={field.maxLength}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={cn(fieldClass, "resize-y py-2 leading-6 placeholder:text-muted-foreground")}
        />
      );

    case "tags":
      return (
        <TagsField id={id} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} />
      );

    case "choice":
      return (
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={selectClass}
        >
          <option value="">{t("link.none")}</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {labels.option(field.key, option)}
            </option>
          ))}
        </select>
      );

    case "reference":
      return (
        <ReferenceField id={id} projectId={projectId} value={value} onChange={onChange} disabled={disabled} />
      );

    case "location": {
      const others = locations.filter((location) => location.id !== selfId);

      return (
        <LocationSelect
          id={id}
          value={value}
          onChange={onChange}
          locations={others}
          emptyLabel={others.length === 0 ? t("link.noLocations") : t("link.none")}
          disabled={disabled}
        />
      );
    }

    case "character":
      return (
        <CharacterSelect id={id} projectId={projectId} value={value} onChange={onChange} disabled={disabled} />
      );

    default:
      return (
        <Input
          id={id}
          value={value}
          maxLength={field.maxLength}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

// ----------------------------------------------------------------------------
// Lieu parent
// ----------------------------------------------------------------------------

/** « Situé dans » : un lieu ne peut pas être placé dans lui-même ni dans ses descendants. */
export function ParentSelect({
  id,
  value,
  onChange,
  locations,
  selfId,
  disabled,
}: {
  id: string;
  value: string | null;
  onChange: (value: string | null) => void;
  locations: Location[];
  selfId: string | null;
  disabled?: boolean;
}) {
  const { t } = useTranslation("locations");
  const exclude = selfId ? selfAndDescendants(locations, selfId) : undefined;

  return (
    <LocationSelect
      id={id}
      value={value ?? ""}
      onChange={(next) => onChange(next || null)}
      locations={locations}
      exclude={exclude}
      emptyLabel={t("form.noParent")}
      disabled={disabled}
    />
  );
}

// ----------------------------------------------------------------------------
// Statut (liste personnalisable)
// ----------------------------------------------------------------------------

const ADD = "\u0000add";

/** Statut du lieu ; « Ajouter une valeur… » l'ajoute à la liste du projet. */
export function StatusSelect({
  id,
  projectId,
  value,
  onChange,
  settings,
  labels,
  disabled,
}: {
  id: string;
  projectId: string;
  value: string;
  onChange: (value: string) => void;
  settings: LocationSettings;
  labels: LocationLabels;
  disabled?: boolean;
}) {
  const { t } = useTranslation(["locations", "characters"]);
  const setStatusList = useLocationStore((state) => state.setStatusList);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const values = statusValues(settings.lists);
  const options = value && !values.includes(value) ? [...values, value] : values;

  async function confirm() {
    const added = draft.trim();

    if (!added) {
      setAdding(false);
      return;
    }

    const existing = values.find((item) => labels.status(item).toLowerCase() === added.toLowerCase());

    if (existing) {
      onChange(existing);
      setAdding(false);
      setDraft("");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await setStatusList(projectId, [...values, added]);
      onChange(added);
      setAdding(false);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (adding) {
    return (
      <div className="space-y-1">
        <div className="flex gap-2">
          <Input
            id={id}
            autoFocus
            value={draft}
            maxLength={60}
            placeholder={t("characters:choice.newPlaceholder")}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void confirm();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setAdding(false);
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={busy}
            onClick={() => void confirm()}
            aria-label={t("characters:choice.confirm")}
          >
            <Check />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={busy}
            onClick={() => setAdding(false)}
            aria-label={t("characters:choice.cancel")}
          >
            <X />
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        if (e.target.value === ADD) {
          setDraft("");
          setAdding(true);
        } else {
          onChange(e.target.value);
        }
      }}
      className={selectClass}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels.status(option)}
        </option>
      ))}
      <option value={ADD}>{t("characters:choice.add")}</option>
    </select>
  );
}
