import { plotSummary } from "@/lib/plot";
import type { VersionKind } from "@/types";

/*
 * Comparaison de deux versions d'un élément (fenêtre « Versions »).
 *
 * Une version contient les colonnes de l'élément : `fields` (fiches),
 * `content` (note : JSON de l'éditeur ; synopsis : HTML)… Elles sont
 * ramenées à des valeurs lisibles, champ par champ, puis comparées mot à
 * mot.
 */

type Row = Record<string, string | number | null>;

/** Valeur lisible d'un champ. `ref` : identifiant à remplacer par un nom. */
export interface FieldValue {
  key: string;
  /** Clé de traduction du libellé, ou libellé direct (préfixé « = »). */
  label: string;
  text: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isId(value: string): boolean {
  return UUID.test(value);
}

/** Texte d'un document de l'éditeur de notes (JSON). */
export function noteText(content: string | number | null): string {
  if (typeof content !== "string" || !content.trim()) return "";
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.text === "string") parts.push(record.text);
    if (Array.isArray(record.content)) {
      record.content.forEach(walk);
      if (record.type !== "text" && record.type !== "doc") parts.push("\n");
    }
    const attrs = record.attrs as Record<string, unknown> | undefined;
    const data = attrs?.data as { boxes?: Array<{ label?: unknown }> } | undefined;
    if (Array.isArray(data?.boxes)) {
      parts.push(data.boxes.map((box) => (typeof box.label === "string" ? box.label : "")).filter(Boolean).join(" → "), "\n");
    }
  };
  try {
    walk(JSON.parse(content));
  } catch {
    return "";
  }
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

/** Texte d'un HTML (synopsis), sans jamais l'insérer dans la page. */
export function htmlText(html: string | number | null): string {
  if (typeof html !== "string" || !html.trim()) return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("p, h1, h2, h3, li, blockquote, br").forEach((element) => element.append("\n"));
  return (doc.body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

function listText(value: string | number | null): string {
  if (typeof value !== "string") return "";
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string").join(", ") : "";
  } catch {
    return "";
  }
}

function fieldsOf(value: string | number | null): Record<string, string> {
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, item] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof item === "string" || typeof item === "number") out[key] = String(item);
      else if (Array.isArray(item)) out[key] = item.map(String).join(", ");
      else if (item && typeof item === "object") out[key] = JSON.stringify(item);
    }
    return out;
  } catch {
    return {};
  }
}

const str = (value: string | number | null | undefined) => (value === null || value === undefined ? "" : String(value));

/** Champs lisibles d'une version, dans l'ordre d'affichage. */
export function readableFields(kind: VersionKind, row: Row, resolve: (id: string) => string | null): FieldValue[] {
  const named = (value: string) => (isId(value) ? (resolve(value) ?? value) : value);

  switch (kind) {
    case "plot":
      return [{ key: "data", label: "versions:fields.plot", text: plotSummary(row.data, "—") }];
    case "note":
      return [
        { key: "title", label: "versions:fields.title", text: str(row.title) },
        { key: "content", label: "versions:fields.content", text: noteText(row.content) },
      ];
    case "synopsis":
      return [
        { key: "content", label: "versions:fields.content", text: htmlText(row.content) },
        { key: "genres", label: "synopsis:genres.label", text: listText(row.genres) },
        { key: "subgenres", label: "synopsis:subgenres.label", text: listText(row.subgenres) },
        { key: "tone", label: "synopsis:tone.label", text: listText(row.tone) },
      ];
    case "structureNode":
      return [
        { key: "title", label: "versions:fields.title", text: str(row.title) },
        { key: "summary", label: "versions:fields.summary", text: str(row.summary) },
        { key: "number", label: "versions:fields.number", text: row.numbered === 0 ? "—" : str(row.number) },
        // Roman : texte de la scène (colonne absente des versions anciennes).
        ...(row.content ? [{ key: "content", label: "versions:fields.text", text: htmlText(row.content) }] : []),
      ];
    case "editorial":
      return [
        { key: "pitch", label: "versions:fields.pitch", text: str(row.pitch) },
        { key: "summaryShort", label: "versions:fields.summaryShort", text: str(row.summary_short) },
        { key: "summaryLong", label: "versions:fields.summaryLong", text: htmlText(row.summary_long) },
      ];
    case "character": {
      const fields = fieldsOf(row.fields);
      return [
        { key: "firstName", label: "characters:fields.firstName", text: str(row.first_name) },
        { key: "lastName", label: "characters:fields.lastName", text: str(row.last_name) },
        { key: "role", label: "characters:fields.role", text: str(row.role) },
        { key: "status", label: "characters:fields.status", text: str(row.status) },
        ...Object.entries(fields).map(([key, value]) => ({
          key: `fields.${key}`,
          label: `characters:fields.${key}`,
          text: value.split(", ").map(named).join(", "),
        })),
      ];
    }
    case "location": {
      const fields = fieldsOf(row.fields);
      return [
        { key: "name", label: "versions:fields.name", text: str(row.name) },
        { key: "type", label: "versions:fields.type", text: str(row.type) },
        { key: "status", label: "versions:fields.status", text: str(row.status) },
        { key: "parent", label: "versions:fields.parent", text: row.parent_id ? named(str(row.parent_id)) : "" },
        ...Object.entries(fields).map(([key, value]) => ({
          key: `fields.${key}`,
          label: `locations:fields.${key}`,
          text: value.split(", ").map(named).join(", "),
        })),
      ];
    }
  }
}

export interface FieldChange {
  key: string;
  label: string;
  before: string;
  after: string;
}

/** Champs qui diffèrent entre `before` (version) et `after` (état actuel). */
export function changedFields(before: FieldValue[], after: FieldValue[]): FieldChange[] {
  const keys = [...new Set([...before.map((f) => f.key), ...after.map((f) => f.key)])];
  const find = (list: FieldValue[], key: string) => list.find((field) => field.key === key);
  return keys
    .map((key) => {
      const a = find(before, key);
      const b = find(after, key);
      return { key, label: (a ?? b)!.label, before: a?.text ?? "", after: b?.text ?? "" };
    })
    .filter((change) => change.before !== change.after);
}

export type DiffPart = { kind: "same" | "added" | "removed"; text: string };

/** Au-delà, la comparaison mot à mot serait trop lente : texte entier. */
const MAX_DIFF_TOKENS = 3000;

/**
 * Différences mot à mot (plus longue sous-suite commune). Les espaces sont
 * gardés comme jetons pour reconstituer le texte tel quel.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);

  if (a.length * b.length > MAX_DIFF_TOKENS * MAX_DIFF_TOKENS / 4 || a.length > MAX_DIFF_TOKENS || b.length > MAX_DIFF_TOKENS) {
    return [
      ...(before ? [{ kind: "removed" as const, text: before }] : []),
      ...(after ? [{ kind: "added" as const, text: after }] : []),
    ];
  }

  // Table des longueurs (de la fin vers le début).
  const table: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  const push = (kind: DiffPart["kind"], text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      push("removed", a[i++]);
    } else {
      push("added", b[j++]);
    }
  }
  while (i < a.length) push("removed", a[i++]);
  while (j < b.length) push("added", b[j++]);
  return parts;
}