import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProjectStructure } from "@/components/structure/useProjectStructure";
import { api } from "@/lib/api";
import { documentKind, loadDocumentBlob } from "@/lib/documents";
import {
  assembleManuscript,
  canHoldText,
  countWords,
  markdownToHtml,
  textToHtml,
  wordTotals,
  type ManuscriptEntry,
  type NodeText,
} from "@/lib/novel";
import { sanitizeHtml } from "@/lib/sanitizeHtml";
import type { StructureDocument, StructureNode } from "@/types";
import { errorText } from "@/lib/errors";

/** Documents dont le texte peut servir de texte de scène. */
const TEXT_EXTENSIONS = new Set(["docx", "md", "markdown", "txt"]);

function isTextDocument(document: StructureDocument): boolean {
  const extension = document.name.split(".").pop()?.toLowerCase() ?? "";
  const kind = documentKind(document);
  return TEXT_EXTENSIONS.has(extension) && (kind === "word" || kind === "text");
}

/** Texte HTML (nettoyé) d'un document Word, Markdown ou texte. */
async function documentHtml(projectId: string, document: StructureDocument): Promise<string> {
  const blob = await loadDocumentBlob(projectId, document);
  const extension = document.name.split(".").pop()?.toLowerCase();
  if (extension === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() });
    return sanitizeHtml(result.value);
  }
  const text = await blob.text();
  return extension === "md" || extension === "markdown" ? markdownToHtml(text) : textToHtml(text);
}

export interface Manuscript {
  ready: boolean;
  loading: boolean;
  error: string | null;
  /** Texte retenu pour chaque élément (fiche, sinon documents). */
  texts: Map<string, NodeText>;
  /** Mots propres à un élément (sans ses éléments contenus). */
  ownWords: (node: StructureNode) => number;
  /** Mots de chaque élément, éléments contenus compris. */
  totals: Map<string, number>;
  /** Manuscrit assemblé dans l'ordre du plan. */
  entries: ManuscriptEntry[];
  /** Relit les textes des fiches et les documents. */
  refresh: () => void;
}

/**
 * Manuscrit d'un roman, assemblé à la demande depuis les éléments du
 * découpage. Le texte d'un élément est celui de sa fiche ; à défaut, celui
 * de ses documents texte (Word, Markdown, texte), dans leur ordre.
 *
 * Les textes des fiches sont relus dès qu'un élément change (texte modifié
 * dans un autre onglet, scène déplacée…) ; les documents, à l'ouverture et
 * sur « Actualiser ».
 */
export function useManuscript(projectId: string, labelOf: (node: StructureNode) => string): Manuscript {
  const { structure } = useProjectStructure(projectId);
  const [sheet, setSheet] = useState<Map<string, string>>(new Map());
  const [docs, setDocs] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [docsNonce, setDocsNonce] = useState(0);
  const run = useRef(0);

  const levelCount = structure?.levels.length ?? 0;

  // Signature des textes des fiches : change quand un texte est enregistré.
  const sheetSignature = useMemo(
    () => (structure ? structure.nodes.map((n) => `${n.id}:${n.contentWords}:${n.updatedAt}`).join("|") : ""),
    [structure],
  );

  // Textes écrits dans les fiches.
  useEffect(() => {
    if (!structure) return;
    let cancelled = false;
    api
      .getManuscriptContents(projectId)
      .then((rows) => {
        if (!cancelled) setSheet(new Map(rows.map((row) => [row.id, sanitizeHtml(row.content)])));
      })
      .catch((e: unknown) => !cancelled && setError(errorText(e, "errors:load.manuscript")))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, sheetSignature]);

  // Documents texte des éléments sans texte dans leur fiche.
  useEffect(() => {
    if (!structure) return;
    const id = ++run.current;
    setLoading(true);
    (async () => {
      const counts = await api.countStructureDocuments(projectId);
      const out = new Map<string, string>();
      for (const node of structure.nodes) {
        if (!counts[node.id] || node.contentWords > 0 || !canHoldText(node, structure.nodes, levelCount)) continue;
        const list = (await api.listStructureDocuments(projectId, node.id)).filter(isTextDocument).sort((a, b) => a.position - b.position);
        const parts: string[] = [];
        for (const document of list) {
          try {
            parts.push(await documentHtml(projectId, document));
          } catch {
            // Document illisible : ignoré, les autres sont gardés.
          }
        }
        if (parts.length) out.set(node.id, parts.join(""));
      }
      if (run.current === id) setDocs(out);
    })()
      .catch((e: unknown) => run.current === id && setError(errorText(e, "errors:load.manuscript")))
      .finally(() => run.current === id && setLoading(false));
    // Les documents ne changent pas avec le texte des fiches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, Boolean(structure), docsNonce]);

  const texts = useMemo(() => {
    const map = new Map<string, NodeText>();
    if (!structure) return map;
    for (const node of structure.nodes) {
      const html = sheet.get(node.id);
      if (html && node.contentWords > 0) {
        map.set(node.id, { html, source: "sheet", words: node.contentWords });
        continue;
      }
      const fromDocs = docs.get(node.id);
      if (fromDocs) {
        const words = countWords(fromDocs);
        if (words > 0) map.set(node.id, { html: fromDocs, source: "documents", words });
      }
    }
    return map;
  }, [structure, sheet, docs]);

  const ownWords = useCallback((node: StructureNode) => texts.get(node.id)?.words ?? node.contentWords, [texts]);

  const totals = useMemo(() => (structure ? wordTotals(structure.nodes, ownWords) : new Map<string, number>()), [structure, ownWords]);

  const entries = useMemo(
    () => (structure ? assembleManuscript(structure.nodes, levelCount, texts, labelOf) : []),
    [structure, levelCount, texts, labelOf],
  );

  const refresh = useCallback(() => {
    setDocsNonce((n) => n + 1);
    setLoaded(false);
    void api.getManuscriptContents(projectId).then((rows) => {
      setSheet(new Map(rows.map((row) => [row.id, sanitizeHtml(row.content)])));
      setLoaded(true);
    });
  }, [projectId]);

  return { ready: Boolean(structure) && loaded, loading, error, texts, ownWords, totals, entries, refresh };
}