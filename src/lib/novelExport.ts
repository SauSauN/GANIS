/*
 * Export des textes du romancier : manuscrit continu, pitch et résumés.
 *
 * Le contenu (HTML de l'éditeur, toujours nettoyé) est d'abord converti en
 * un document neutre (`ExportDocument` : titres, paragraphes mis en forme,
 * séparateurs de scène, sauts de page), puis écrit en Word (.docx), en PDF
 * ou en texte brut. Les bibliothèques Word et PDF ne sont chargées qu'au
 * moment de l'export.
 *
 * Mise en page « manuscrit » : page de titre, chaque chapitre sur une
 * nouvelle page, paragraphes justifiés avec retrait de première ligne,
 * interligne 1,5, numéros de page.
 */

export interface ExportRun {
  text: string;
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
}

export type ExportBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string; pageBreakBefore?: boolean }
  | { type: "paragraph"; runs: ExportRun[]; indent?: boolean; /** Retrait à gauche (scénario) : 1, 2… */ inset?: number }
  /** Séparateur de scène (* * *). */
  | { type: "sceneBreak" };

export interface ExportDocument {
  title: string;
  /** Lignes sous le titre (auteur, nombre de mots…). */
  subtitle: string[];
  /** Page de titre séparée (manuscrit) ou titre en tête (pitch, résumé). */
  titlePage: boolean;
  /**
   * Mise en page : « manuscrit » (par défaut : titres centrés, paragraphes
   * justifiés) ou « scénario » (tout aligné à gauche, titres compacts,
   * retraits pour les champs et les textes des cases).
   */
  layout?: "manuscript" | "script";
  blocks: ExportBlock[];
}

export type ExportFormat = "docx" | "pdf" | "txt";

// ----------------------------------------------------------------------------
// HTML → blocs
// ----------------------------------------------------------------------------

const BLOCKS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "PRE", "DIV", "TD", "TH"]);

/** Paragraphes mis en forme d'un HTML de l'éditeur (déjà nettoyé). */
export function htmlToBlocks(html: string, indent = true): ExportBlock[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const blocks: ExportBlock[] = [];
  let runs: ExportRun[] = [];

  const flush = () => {
    // Espaces superflues en début et fin de paragraphe.
    while (runs.length && !runs[0].text.trim()) runs.shift();
    while (runs.length && !runs[runs.length - 1].text.trim()) runs.pop();
    if (runs.length) {
      runs[0] = { ...runs[0], text: runs[0].text.replace(/^\s+/, "") };
      const last = runs.length - 1;
      runs[last] = { ...runs[last], text: runs[last].text.replace(/\s+$/, "") };
      blocks.push({ type: "paragraph", runs, indent });
    }
    runs = [];
  };

  const walk = (node: Node, style: Omit<ExportRun, "text">) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ");
      if (text) runs.push({ text, ...style });
      return;
    }
    if (!(node instanceof Element)) return;
    const tag = node.tagName;
    if (tag === "BR") {
      runs.push({ text: "\n", ...style });
      return;
    }
    if (tag === "HR") {
      flush();
      blocks.push({ type: "sceneBreak" });
      return;
    }
    const next = {
      ...style,
      ...(tag === "STRONG" || tag === "B" ? { bold: true } : {}),
      ...(tag === "EM" || tag === "I" ? { italics: true } : {}),
      ...(tag === "U" ? { underline: true } : {}),
    };
    const isBlock = BLOCKS.has(tag);
    if (isBlock) flush();
    node.childNodes.forEach((child) => walk(child, next));
    if (isBlock) flush();
  };

  doc.body.childNodes.forEach((child) => walk(child, {}));
  flush();
  return blocks;
}

/** Texte brut d'un document (pour l'export .txt). */
export function documentToText(document: ExportDocument): string {
  const lines: string[] = [document.title, ...document.subtitle, ""];
  const script = document.layout === "script";
  for (const block of document.blocks) {
    if (block.type === "heading") {
      if (!script || block.level === 1) lines.push("", block.text.toUpperCase(), script ? "=".repeat(Math.min(60, block.text.length)) : "", "");
      else if (block.level === 2) lines.push("", block.text, "-".repeat(Math.min(60, block.text.length)));
      else lines.push("", block.text);
    } else if (block.type === "sceneBreak") lines.push("", "* * *", "");
    else if (script) lines.push("    ".repeat(block.inset ?? 0) + block.runs.map((run) => run.text).join(""));
    else lines.push(block.runs.map((run) => run.text).join(""), "");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ----------------------------------------------------------------------------
// Word
// ----------------------------------------------------------------------------

export async function documentToDocx(document: ExportDocument): Promise<Uint8Array> {
  const docx = await import("docx");
  const { AlignmentType, Document, Footer, HeadingLevel, Packer, PageBreak, PageNumber, Paragraph, TextRun } = docx;

  const runsOf = (runs: ExportRun[]) =>
    runs.flatMap((run) =>
      run.text.split("\n").map(
        (part, index) =>
          new TextRun({ text: part, bold: run.bold, italics: run.italics, underline: run.underline ? {} : undefined, break: index > 0 ? 1 : undefined }),
      ),
    );

  const children: InstanceType<typeof Paragraph>[] = [];

  if (document.titlePage) {
    children.push(new Paragraph({ spacing: { before: 3600 } }));
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: document.title, size: 48, bold: true })] }));
    for (const line of document.subtitle) {
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240 }, children: [new TextRun({ text: line, size: 24 })] }));
    }
  } else {
    children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: document.title })] }));
    for (const line of document.subtitle) children.push(new Paragraph({ children: [new TextRun({ text: line, italics: true })] }));
  }

  const script = document.layout === "script";

  document.blocks.forEach((block, index) => {
    if (block.type === "heading" && script) {
      children.push(
        new Paragraph({
          heading: block.level === 1 ? HeadingLevel.HEADING_1 : block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          keepNext: true,
          spacing: { before: block.level === 1 ? 240 : block.level === 2 ? 360 : 200, after: 100 },
          children: [...(block.pageBreakBefore ? [new PageBreak()] : []), new TextRun({ text: block.text })],
        }),
      );
    } else if (block.type === "paragraph" && script) {
      children.push(
        new Paragraph({
          indent: block.inset ? { left: 567 * block.inset } : undefined,
          spacing: { line: 276, after: 80 },
          children: runsOf(block.runs),
        }),
      );
    } else if (block.type === "heading") {
      const breakBefore = block.pageBreakBefore || (document.titlePage && index === 0);
      children.push(
        new Paragraph({
          heading: block.level === 1 ? HeadingLevel.HEADING_1 : block.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          alignment: AlignmentType.CENTER,
          spacing: { before: block.level === 1 ? 2400 : 1200, after: 480 },
          children: [...(breakBefore ? [new PageBreak()] : []), new TextRun({ text: block.text })],
        }),
      );
    } else if (block.type === "sceneBreak") {
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 }, children: [new TextRun("*   *   *")] }));
    } else {
      children.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: block.indent ? { firstLine: 709 } : undefined,
          spacing: { line: 360, after: block.indent ? 0 : 160 },
          children: runsOf(block.runs),
        }),
      );
    }
  });

  const file = new Document({
    creator: "GANIS",
    title: document.title,
    styles: {
      default: { document: { run: { font: "Times New Roman", size: 24 } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", run: { size: 36, bold: true } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", run: { size: 30, bold: true } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", run: { size: 26, bold: true } },
      ],
    },
    sections: [
      {
        properties: { page: { margin: { top: 1418, bottom: 1418, left: 1418, right: 1418 } } },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT] })] })],
          }),
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(file);
  return new Uint8Array(await blob.arrayBuffer());
}

// ----------------------------------------------------------------------------
// PDF
// ----------------------------------------------------------------------------

export async function documentToPdf(document: ExportDocument): Promise<Uint8Array> {
  const pdfMakeModule = await import("pdfmake/build/pdfmake");
  const fontsModule = await import("pdfmake/build/vfs_fonts");
  const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as typeof import("pdfmake/build/pdfmake");
  const fonts = (fontsModule.default ?? fontsModule) as unknown as { vfs?: Record<string, string>; pdfMake?: { vfs: Record<string, string> } };
  (pdfMake as unknown as { vfs: Record<string, string> }).vfs = fonts.pdfMake?.vfs ?? fonts.vfs ?? {};

  type Content = Record<string, unknown>;
  const content: Content[] = [];

  if (document.titlePage) {
    content.push({ text: document.title, style: "bookTitle", margin: [0, 220, 0, 20] });
    for (const line of document.subtitle) content.push({ text: line, alignment: "center", margin: [0, 6, 0, 0] });
  } else {
    content.push({ text: document.title, style: "docTitle" });
    for (const line of document.subtitle) content.push({ text: line, italics: true, margin: [0, 0, 0, 4] });
    content.push({ text: "", margin: [0, 0, 0, 10] });
  }

  const script = document.layout === "script";

  document.blocks.forEach((block, index) => {
    if (block.type === "heading" && script) {
      content.push({
        text: block.text,
        style: `s${block.level}`,
        pageBreak: block.pageBreakBefore ? "before" : undefined,
        headlineLevel: block.level,
      });
    } else if (block.type === "paragraph" && script) {
      content.push({
        text: block.runs.map((run) => ({ text: run.text, bold: run.bold, italics: run.italics, decoration: run.underline ? "underline" : undefined })),
        lineHeight: 1.2,
        margin: [24 * (block.inset ?? 0), 0, 0, 4],
      });
    } else if (block.type === "heading") {
      const breakBefore = block.pageBreakBefore || (document.titlePage && index === 0);
      content.push({
        text: block.text,
        style: `h${block.level}`,
        pageBreak: breakBefore ? "before" : undefined,
      });
    } else if (block.type === "sceneBreak") {
      content.push({ text: "*   *   *", alignment: "center", margin: [0, 10, 0, 10] });
    } else {
      content.push({
        text: block.runs.map((run) => ({ text: run.text, bold: run.bold, italics: run.italics, decoration: run.underline ? "underline" : undefined })),
        alignment: "justify",
        leadingIndent: block.indent ? 20 : 0,
        lineHeight: 1.35,
        margin: [0, 0, 0, block.indent ? 2 : 8],
      });
    }
  });

  const definition = {
    info: { title: document.title, creator: "GANIS" },
    pageSize: "A4",
    pageMargins: [72, 72, 72, 72],
    defaultStyle: { fontSize: 11.5 },
    styles: {
      bookTitle: { fontSize: 26, bold: true, alignment: "center" },
      docTitle: { fontSize: 18, bold: true, margin: [0, 0, 0, 6] },
      h1: { fontSize: 20, bold: true, alignment: "center", margin: [0, 120, 0, 30] },
      h2: { fontSize: 16, bold: true, alignment: "center", margin: [0, 60, 0, 24] },
      h3: { fontSize: 13, bold: true, alignment: "center", margin: [0, 24, 0, 12] },
      s1: { fontSize: 18, bold: true, margin: [0, 6, 0, 8] },
      s2: { fontSize: 14, bold: true, margin: [0, 16, 0, 4] },
      s3: { fontSize: 11.5, bold: true, margin: [0, 10, 0, 3] },
    },
    footer: (current: number, total: number) =>
      document.titlePage && current === 1 ? null : { text: `${current} / ${total}`, alignment: "center", fontSize: 9, margin: [0, 20, 0, 0] },
    content,
  };

  return new Promise((resolve, reject) => {
    try {
      pdfMake
        .createPdf(definition as unknown as Parameters<typeof pdfMake.createPdf>[0])
        .getBuffer((buffer: ArrayBuffer | Uint8Array) => resolve(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)));
    } catch (error) {
      reject(error);
    }
  });
}

/** Fichier final dans le format demandé. */
export async function renderDocument(document: ExportDocument, format: ExportFormat): Promise<Uint8Array> {
  if (format === "docx") return documentToDocx(document);
  if (format === "pdf") return documentToPdf(document);
  return new TextEncoder().encode(documentToText(document));
}
