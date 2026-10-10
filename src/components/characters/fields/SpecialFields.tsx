import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fieldClass } from "@/components/workspace/views/PageShell";
import { api } from "@/lib/api";
import {
  isDefaultValue,
  listValues,
  parseList,
  serializeList,
} from "@/lib/characters";
import { buildStructureTree, flattenVisible, levelKey } from "@/lib/structure";
import { cn } from "@/lib/utils";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterListKey, Structure } from "@/types";

// ----------------------------------------------------------------------------
// Libellé d'une valeur de liste
// ----------------------------------------------------------------------------

/** Libellé d'une valeur : traduite si c'est un code par défaut, sinon telle quelle. */
export function useListLabel() {
  const { t } = useTranslation("characters");

  return (list: CharacterListKey, value: string) =>
    isDefaultValue(list, value) ? t(`lists.${list}.${value}` as "lists.role.main") : value;
}

// ----------------------------------------------------------------------------
// Liste personnalisable
// ----------------------------------------------------------------------------

const ADD = "\u0000add";

interface ChoiceFieldProps {
  id: string;
  projectId: string;
  list: CharacterListKey;
  value: string;
  onChange: (value: string) => void;
  /** Propose « Non précisé » (champ facultatif). */
  allowEmpty?: boolean;
  disabled?: boolean;
}

/**
 * Liste déroulante d'une liste personnalisable du projet. « Ajouter une
 * valeur… » ouvre un champ : la nouvelle valeur est ajoutée à la liste du
 * projet (et proposée ensuite pour tous les personnages).
 */
export function ChoiceField({
  id,
  projectId,
  list,
  value,
  onChange,
  allowEmpty,
  disabled,
}: ChoiceFieldProps) {
  const { t } = useTranslation("characters");
  const label = useListLabel();
  const lists = useCharacterStore((state) => state.lists);
  const setList = useCharacterStore((state) => state.setList);

  const [adding, setAdding] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const values = listValues(lists, list);
  // Valeur retirée de la liste depuis : toujours proposée pour ce personnage.
  const options = value && !values.includes(value) ? [...values, value] : values;

  async function confirm() {
    const added = newValue.trim();

    if (!added) {
      setAdding(false);
      return;
    }

    const existing = values.find(
      (item) => label(list, item).toLowerCase() === added.toLowerCase(),
    );

    if (existing) {
      onChange(existing);
      setAdding(false);
      setNewValue("");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await setList(projectId, list, [...values, added]);
      onChange(added);
      setAdding(false);
      setNewValue("");
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
            value={newValue}
            maxLength={60}
            placeholder={t("choice.newPlaceholder")}
            disabled={busy}
            onChange={(e) => setNewValue(e.target.value)}
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
            aria-label={t("choice.confirm")}
          >
            <Check />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={busy}
            onClick={() => setAdding(false)}
            aria-label={t("choice.cancel")}
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
          setNewValue("");
          setAdding(true);
        } else {
          onChange(e.target.value);
        }
      }}
      className={cn(fieldClass, "h-9")}
    >
      {allowEmpty && <option value="">{t("choice.none")}</option>}
      {options.map((option) => (
        <option key={option} value={option}>
          {label(list, option)}
        </option>
      ))}
      <option value={ADD}>{t("choice.add")}</option>
    </select>
  );
}

// ----------------------------------------------------------------------------
// Étiquettes
// ----------------------------------------------------------------------------

const MAX_TAGS = 30;
const MAX_TAG_LENGTH = 50;

interface TagsFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/** Liste d'étiquettes : Entrée ou virgule pour ajouter, retour arrière pour retirer. */
export function TagsField({ id, value, onChange, placeholder, disabled }: TagsFieldProps) {
  const { t } = useTranslation("characters");
  const tags = parseList(value);
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const tag = raw.trim().slice(0, MAX_TAG_LENGTH);

    if (!tag || tags.length >= MAX_TAGS) return;

    if (!tags.some((item) => item.toLowerCase() === tag.toLowerCase())) {
      onChange(serializeList([...tags, tag]));
    }

    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(draft);
    } else if (event.key === "Backspace" && !draft && tags.length > 0) {
      onChange(serializeList(tags.slice(0, -1)));
    }
  }

  return (
    <div
      className={cn(
        "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5",
        "focus-within:ring-2 focus-within:ring-ring",
        disabled && "opacity-50",
      )}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground"
        >
          {tag}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(serializeList(tags.filter((item) => item !== tag)))}
            aria-label={t("tags.remove", { tag })}
            className="rounded hover:text-destructive"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}

      <input
        id={id}
        value={draft}
        disabled={disabled || tags.length >= MAX_TAGS}
        maxLength={MAX_TAG_LENGTH}
        placeholder={tags.length === 0 ? placeholder : ""}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Palette de couleurs
// ----------------------------------------------------------------------------

const MAX_COLORS = 12;

interface ColorsFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** Palette : pastilles de couleur, « + » ouvre le sélecteur de couleur du système. */
export function ColorsField({ id, value, onChange, disabled }: ColorsFieldProps) {
  const { t } = useTranslation("characters");
  const colors = parseList(value);
  const [picking, setPicking] = useState("#8b5cf6");
  const inputRef = useRef<HTMLInputElement>(null);

  // L'évènement natif « change » part quand le sélecteur se ferme (React
  // `onChange` suit chaque mouvement) : la couleur est ajoutée à ce moment.
  const addRef = useRef<(color: string) => void>(() => {});
  addRef.current = (color: string) => {
    if (!colors.includes(color)) onChange(serializeList([...colors, color]));
  };

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const onNativeChange = () => addRef.current(input.value.toLowerCase());
    input.addEventListener("change", onNativeChange);
    return () => input.removeEventListener("change", onNativeChange);
  }, [colors.length >= MAX_COLORS]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {colors.map((color, index) => (
        <span key={`${color}-${index}`} className="group relative">
          <span
            className="block size-9 rounded-full border shadow-sm"
            style={{ backgroundColor: color }}
            title={color}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(serializeList(colors.filter((_, i) => i !== index)))}
            aria-label={t("colors.remove", { color })}
            className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full border bg-background opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}

      {colors.length < MAX_COLORS && (
        <label
          className={cn(
            "relative flex size-9 cursor-pointer items-center justify-center rounded-full border border-dashed text-muted-foreground transition-colors hover:border-primary hover:text-primary",
            "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
            disabled && "pointer-events-none opacity-50",
          )}
          title={t("colors.add")}
        >
          <Plus className="size-4" />
          <input
            ref={inputRef}
            id={id}
            type="color"
            value={picking}
            disabled={disabled}
            aria-label={t("colors.add")}
            onChange={(e) => setPicking(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Première apparition (élément du découpage)
// ----------------------------------------------------------------------------

/** Découpage du projet, chargé une fois par vue. */
function useStructure(projectId: string): Structure | null {
  const [structure, setStructure] = useState<Structure | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .getStructure(projectId)
      .then((next) => !cancelled && setStructure(next))
      .catch(() => !cancelled && setStructure(null));

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return structure;
}

interface ReferenceFieldProps {
  id: string;
  projectId: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Choix d'une partie, d'un chapitre, d'une scène… du plan du récit (les
 * noms des niveaux suivent le modèle de découpage du projet).
 */
export function ReferenceField({ id, projectId, value, onChange, disabled }: ReferenceFieldProps) {
  const { t } = useTranslation(["characters", "structure"]);
  const structure = useStructure(projectId);

  const nodes = structure ? flattenVisible(buildStructureTree(structure.nodes), new Set()) : [];
  const known = !value || nodes.some((node) => node.id === value);

  const levelName = (level: number) =>
    structure
      ? t(`structure:templates.${structure.template}.levels.${levelKey(level)}.one`)
      : "";

  return (
    <select
      id={id}
      value={value}
      disabled={disabled || !structure}
      onChange={(e) => onChange(e.target.value)}
      className={cn(fieldClass, "h-9")}
    >
      <option value="">
        {structure && nodes.length === 0 ? t("reference.emptyPlan") : t("choice.none")}
      </option>
      {nodes.map((node) => (
        <option key={node.id} value={node.id}>
          {"  ".repeat(node.depth)}
          {levelName(node.level)} · {node.title}
        </option>
      ))}
      {!known && structure && <option value={value}>{t("reference.deleted")}</option>}
    </select>
  );
}
