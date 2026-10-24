import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorsField, ReferenceField, TagsField } from "@/components/characters/fields/SpecialFields";
import type { WorldLabels } from "@/components/world/useWorldLabels";
import { fieldClass } from "@/components/workspace/views/PageShell";
import { errorText } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { buildWorldTree, flattenWorldTree, parentCandidates, statusValues, type WorldField } from "@/lib/world";
import { useWorldStore } from "@/stores/worldStore";
import type { WorldEntry, WorldModule, WorldSettings } from "@/types";

const selectClass = cn(fieldClass, "h-9");

// ----------------------------------------------------------------------------
// Champ du catalogue
// ----------------------------------------------------------------------------

/** Saisie d'un champ du catalogue, selon sa nature. */
export function WorldFieldInput({
  id,
  projectId,
  field,
  value,
  onChange,
  labels,
  disabled,
}: {
  id: string;
  projectId: string;
  field: WorldField;
  value: string;
  onChange: (value: string) => void;
  labels: WorldLabels;
  disabled?: boolean;
}) {
  const { t } = useTranslation("world");
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
      return <TagsField id={id} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} />;

    case "choice":
      return (
        <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={selectClass}>
          <option value="">{t("form.none")}</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {labels.option(field.key, option)}
            </option>
          ))}
        </select>
      );

    case "reference":
      return <ReferenceField id={id} projectId={projectId} value={value} onChange={onChange} disabled={disabled} />;

    case "colors":
      return <ColorsField id={id} value={value} onChange={onChange} disabled={disabled} />;

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
// Élément choisi parmi ceux du module (parent, autre côté d'un lien)
// ----------------------------------------------------------------------------

/** Liste déroulante des fiches d'un module, en arborescence (parent indiqué à côté). */
export function WorldEntrySelect({
  id,
  value,
  onChange,
  entries,
  emptyLabel,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  entries: WorldEntry[];
  emptyLabel: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation("world");
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const nodes = flattenWorldTree(buildWorldTree(entries));
  const known = !value || byId.has(value);

  return (
    <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={selectClass}>
      <option value="">{emptyLabel}</option>
      {nodes.map(({ entry }) => {
        const parent = entry.parentId ? byId.get(entry.parentId) : undefined;
        return (
          <option key={entry.id} value={entry.id}>
            {parent ? `${entry.name} · ${parent.name}` : entry.name}
          </option>
        );
      })}
      {!known && <option value={value}>{t("form.deleted")}</option>}
    </select>
  );
}

/** Parent : objet qui le contient, ou espèce d'un animal précis. */
export function WorldParentSelect({
  id,
  module,
  value,
  onChange,
  entries,
  selfId,
  emptyLabel,
  disabled,
}: {
  id: string;
  module: WorldModule;
  value: string | null;
  onChange: (value: string | null) => void;
  entries: WorldEntry[];
  selfId: string | null;
  emptyLabel: string;
  disabled?: boolean;
}) {
  const candidates = parentCandidates(module, entries, selfId);
  // Valeur actuelle gardée dans la liste même si elle n'est plus proposée.
  const current = value ? entries.find((entry) => entry.id === value) : undefined;
  const options = current && !candidates.includes(current) ? [...candidates, current] : candidates;

  return (
    <WorldEntrySelect
      id={id}
      value={value ?? ""}
      onChange={(next) => onChange(next || null)}
      entries={options}
      emptyLabel={emptyLabel}
      disabled={disabled}
    />
  );
}

// ----------------------------------------------------------------------------
// Statut (liste personnalisable)
// ----------------------------------------------------------------------------

const ADD = "\u0000add";

/** Statut ; « Ajouter une valeur… » l'ajoute à la liste du projet. */
export function WorldStatusSelect({
  id,
  projectId,
  module,
  value,
  onChange,
  settings,
  labels,
  disabled,
}: {
  id: string;
  projectId: string;
  module: WorldModule;
  value: string;
  onChange: (value: string) => void;
  settings: WorldSettings;
  labels: WorldLabels;
  disabled?: boolean;
}) {
  const { t } = useTranslation(["world", "characters"]);
  const setStatusList = useWorldStore((state) => state.setStatusList);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const values = statusValues(module, settings.lists);
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
      await setStatusList(projectId, module, [...values, added]);
      onChange(added);
      setAdding(false);
      setDraft("");
    } catch (e) {
      setError(errorText(e));
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
          <Button type="button" size="icon" variant="outline" disabled={busy} onClick={() => void confirm()} aria-label={t("characters:choice.confirm")}>
            <Check />
          </Button>
          <Button type="button" size="icon" variant="ghost" disabled={busy} onClick={() => setAdding(false)} aria-label={t("characters:choice.cancel")}>
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
