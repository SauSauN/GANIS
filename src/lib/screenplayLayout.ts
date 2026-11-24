/*
 * Mise en page standard d'un scénario, page par page (testée).
 *
 * Courier 12 points, dix caractères au pouce : tout se compte en
 * caractères et en lignes, comme sur une machine à écrire. Une page tient
 * 55 lignes ; une page ≈ une minute à l'écran. Colonnes (depuis la marge
 * gauche, à 1,5 pouce du bord) :
 *
 * | Élément       | Retrait | Largeur |
 * | ------------- | ------- | ------- |
 * | En-tête, action | 0     | 60      |
 * | Personnage    | 22      | 38      |
 * | Didascalie    | 16      | 24      |
 * | Réplique      | 10      | 35      |
 * | Transition    | à droite | 60     |
 *
 * Règles de coupure : un en-tête ne reste jamais seul en bas de page ; une
 * réplique trop longue se coupe avec « (À SUIVRE) » en bas et le nom du
 * personnage suivi de « (SUITE) » en haut de la page suivante ; une action
 * se coupe entre deux lignes s'il en tient au moins deux. Une transition
 * reste avec ce qui la précède.
 */

export const LINES_PER_PAGE = 55;
export const PAGE_WIDTH = 60;

export const COLUMNS = {
  heading: { indent: 0, width: 60 },
  action: { indent: 0, width: 60 },
  character: { indent: 22, width: 38 },
  parenthetical: { indent: 16, width: 24 },
  dialogue: { indent: 10, width: 35 },
  transition: { indent: 0, width: 60 },
  section: { indent: 0, width: 60 },
} as const;

export type ScreenplayElement =
  | { type: "heading"; text: string; number?: string; revised?: boolean }
  | { type: "action"; text: string; revised?: boolean }
  | { type: "shot"; text: string; revised?: boolean }
  | { type: "transition"; text: string; revised?: boolean }
  | { type: "dialogue"; character: string; parenthetical?: string; text: string; contd?: boolean; revised?: boolean }
  /** Titre de saison ou d'épisode (série) : centré, souligné. */
  | { type: "section"; text: string; pageBreakBefore?: boolean };

export interface Line {
  text: string;
  /** Retrait en caractères depuis la marge gauche. */
  indent: number;
  bold?: boolean;
  underline?: boolean;
  align?: "right" | "center";
  /** Ligne modifiée pendant la révision : astérisque dans la marge droite. */
  revised?: boolean;
  /** Numéro de scène, imprimé dans les deux marges (en-têtes). */
  number?: string;
}

export interface LayoutLabels {
  /** « (À SUIVRE) » en bas d'une réplique coupée. */
  more: string;
  /** « (SUITE) » après le nom du personnage qui reprend. */
  contd: string;
}

export type Page = Line[];

/** Coupe un texte en lignes d'au plus `width` caractères (mots entiers). */
export function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      // Un mot plus long que la colonne est coupé.
      let rest = word;
      while (rest.length > width) {
        if (line) {
          out.push(line);
          line = "";
        }
        out.push(rest.slice(0, width));
        rest = rest.slice(width);
      }
      if (!line) line = rest;
      else if (line.length + 1 + rest.length <= width) line += ` ${rest}`;
      else {
        out.push(line);
        line = rest;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Un morceau à placer : ses lignes, et comment il peut se couper. */
interface Chunk {
  lines: Line[];
  /** Lignes vides avant (ignorées en haut de page). */
  before: number;
  kind: "heading" | "action" | "dialogue" | "transition" | "section";
  /** Réplique : nom du personnage (pour la reprise après coupure). */
  character?: string;
  /** Réplique : nombre de lignes d'en-tête (nom, didascalie) avant le texte. */
  head?: number;
  pageBreakBefore?: boolean;
}

function chunksOf(elements: ScreenplayElement[], labels: LayoutLabels): Chunk[] {
  const chunks: Chunk[] = [];
  for (const el of elements) {
    const revised = "revised" in el ? el.revised : undefined;
    const lines = (text: string, col: { indent: number; width: number }, extra: Partial<Line> = {}) =>
      wrap(text, col.width).map((t) => ({ text: t, indent: col.indent, revised, ...extra }));
    switch (el.type) {
      case "section":
        chunks.push({ kind: "section", before: 2, pageBreakBefore: el.pageBreakBefore, lines: lines(el.text.toUpperCase(), COLUMNS.section, { align: "center", underline: true, bold: true }) });
        break;
      case "heading": {
        const ls = lines(el.text.toUpperCase(), COLUMNS.heading, { bold: true });
        if (ls[0] && el.number) ls[0].number = el.number;
        chunks.push({ kind: "heading", before: 2, lines: ls });
        break;
      }
      case "action":
        chunks.push({ kind: "action", before: 1, lines: lines(el.text, COLUMNS.action) });
        break;
      case "shot":
        chunks.push({ kind: "action", before: 1, lines: lines(el.text.toUpperCase(), COLUMNS.action) });
        break;
      case "transition":
        chunks.push({ kind: "transition", before: 1, lines: lines(el.text.toUpperCase(), COLUMNS.transition, { align: "right" }) });
        break;
      case "dialogue": {
        const name = el.contd ? `${el.character.toUpperCase()} ${labels.contd}` : el.character.toUpperCase();
        const head = [...lines(name, COLUMNS.character)];
        const paren = el.parenthetical?.trim();
        if (paren) head.push(...lines(`(${paren.replace(/^\(|\)$/g, "")})`, COLUMNS.parenthetical));
        chunks.push({ kind: "dialogue", before: 1, character: el.character.toUpperCase(), head: head.length, lines: [...head, ...lines(el.text, COLUMNS.dialogue)] });
        break;
      }
    }
  }
  return chunks;
}

/** Pagine les éléments d'un scénario. */
export function paginate(elements: ScreenplayElement[], labels: LayoutLabels, linesPerPage = LINES_PER_PAGE): Page[] {
  const chunks = chunksOf(elements, labels);
  const pages: Page[] = [];
  let page: Page = [];
  const room = () => linesPerPage - page.length;
  const newPage = () => {
    if (page.length) pages.push(page);
    page = [];
  };
  const place = (chunk: Chunk, lines: Line[]) => {
    const blank = page.length ? chunk.before : 0;
    for (let i = 0; i < blank; i += 1) page.push({ text: "", indent: 0 });
    page.push(...lines);
  };

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (chunk.pageBreakBefore && page.length) newPage();
    const blank = page.length ? chunk.before : 0;
    let need = blank + chunk.lines.length;
    // Un en-tête emporte au moins deux lignes de ce qui le suit.
    if (chunk.kind === "heading" || chunk.kind === "section") {
      const next = chunks[index + 1];
      if (next) need += next.before + Math.min(2, next.lines.length);
    }
    if (need <= room()) {
      place(chunk, chunk.lines);
      continue;
    }
    if (chunk.kind === "action") {
      const fit = room() - blank;
      if (fit >= 2 && chunk.lines.length - fit >= 2) {
        place(chunk, chunk.lines.slice(0, fit));
        newPage();
        page.push(...chunk.lines.slice(fit));
        continue;
      }
    }
    if (chunk.kind === "dialogue") {
      const head = chunk.head ?? 1;
      // Lignes de texte qui tiennent, en gardant une ligne pour « (À SUIVRE) ».
      const fit = room() - blank - head - 1;
      const text = chunk.lines.slice(head);
      if (fit >= 2 && text.length - fit >= 1) {
        place(chunk, [...chunk.lines.slice(0, head), ...text.slice(0, fit), { text: labels.more, indent: COLUMNS.character.indent }]);
        newPage();
        page.push({ text: `${chunk.character} ${labels.contd}`, indent: COLUMNS.character.indent }, ...text.slice(fit));
        continue;
      }
    }
    // Une transition ne commence pas une page : elle emporte la dernière ligne.
    if (chunk.kind === "transition" && page.length) {
      const last = page.pop()!;
      while (page.length && !page[page.length - 1].text) page.pop();
      newPage();
      page.push(last, { text: "", indent: 0 }, ...chunk.lines);
      continue;
    }
    newPage();
    page.push(...chunk.lines.slice(0, linesPerPage));
    // Un morceau plus long qu'une page entière (rare) déborde sur la suivante.
    let rest = chunk.lines.slice(linesPerPage);
    while (rest.length) {
      newPage();
      page.push(...rest.slice(0, linesPerPage));
      rest = rest.slice(linesPerPage);
    }
  }
  newPage();
  return pages;
}

// ----------------------------------------------------------------------------
// Rendus
// ----------------------------------------------------------------------------

export interface TitlePage {
  title: string;
  /** Lignes sous le titre (« Scénario », « Écrit par… »). */
  lines: string[];
  /** Note en bas de page (logline, contact). */
  footer?: string;
}

export interface RenderOptions {
  titlePage?: TitlePage;
  /** En-tête de chaque page (révision : « Révision bleue — 22/11/2026 »). */
  header?: string;
}

const pad = (n: number) => " ".repeat(Math.max(0, n));

/** Une ligne en texte brut, sur la largeur de la page (marges comprises). */
function plainLine(line: Line): string {
  const margin = 6;
  let body: string;
  if (line.align === "right") body = pad(PAGE_WIDTH - line.text.length) + line.text;
  else if (line.align === "center") body = pad(Math.floor((PAGE_WIDTH - line.text.length) / 2)) + line.text;
  else body = pad(line.indent) + line.text;
  const left = line.number ? line.number.padEnd(margin) : pad(margin);
  const right = line.number ? `${pad(PAGE_WIDTH - body.length)}  ${line.number}` : line.revised ? `${pad(PAGE_WIDTH - body.length)}  *` : "";
  return (left + body + right).trimEnd();
}

/** Texte brut paginé : numéro de page en haut à droite, saut de page entre les pages. */
export function pagesToText(pages: Page[], options: RenderOptions = {}): string {
  const out: string[] = [];
  if (options.titlePage) {
    const tp = options.titlePage;
    out.push(...Array(18).fill(""), pad(Math.floor((66 - tp.title.length) / 2)) + tp.title.toUpperCase(), "");
    for (const l of tp.lines) out.push(pad(Math.floor((66 - l.length) / 2)) + l);
    if (tp.footer) out.push("", "", ...wrap(tp.footer, 60).map((l) => pad(6) + l));
    out.push("\f");
  }
  pages.forEach((page, i) => {
    const number = i + 1;
    const head = [options.header ?? "", number > 1 ? `${number}.` : ""];
    out.push(head[0] + pad(66 - head[0].length - head[1].length) + head[1], "");
    for (const line of page) out.push(plainLine(line));
    if (i < pages.length - 1) out.push("\f");
  });
  return out.join("\n").replace(/[ \t]+\n/g, "\n") + "\n";
}

// Polices standard du PDF : Courier (sans fichier de police à embarquer).
// Leurs métriques (fichiers AFM d'Adobe, libres de diffusion) sont lues par
// pdfmake dans son système de fichiers virtuel.
async function courierFiles(): Promise<Record<string, string>> {
  const [regular, bold, italic, boldItalic] = await Promise.all([
    import("@/assets/fonts/courier/Courier.afm?raw"),
    import("@/assets/fonts/courier/Courier-Bold.afm?raw"),
    import("@/assets/fonts/courier/Courier-Oblique.afm?raw"),
    import("@/assets/fonts/courier/Courier-BoldOblique.afm?raw"),
  ]);
  return {
    "data/Courier.afm": regular.default,
    "data/Courier-Bold.afm": bold.default,
    "data/Courier-Oblique.afm": italic.default,
    "data/Courier-BoldOblique.afm": boldItalic.default,
  };
}

/** Caractères que Courier (codage WinAnsi) ne sait pas écrire : remplacés. */
export function winAnsi(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[  ]/g, " ")
    .replace(/[^\u0000-ÿŒœŠšŸŽžƒˆ˜–—†‡•‰‹›€™]/g, (c) => c.normalize("NFD").replace(/[̀-ͯ]/g, "") || "?");
}

const CHAR = 7.2; // largeur d'un caractère de Courier 12
const LINE = 12; // hauteur d'une ligne
const LEFT = 108; // marge gauche (1,5 pouce)
const TOP = 72; // marge haute (1 pouce)

/** PDF au format standard (A4, Courier 12), à partir des pages. */
export async function pagesToPdf(pages: Page[], title: string, options: RenderOptions = {}): Promise<Uint8Array> {
  const pdfMakeModule = await import("pdfmake/build/pdfmake");
  const pdfMake = (pdfMakeModule.default ?? pdfMakeModule) as unknown as {
    vfs: Record<string, string>;
    fonts: Record<string, Record<string, string>>;
    createPdf: (definition: unknown) => { getBuffer: (cb: (buffer: ArrayBuffer | Uint8Array) => void) => void };
  };
  pdfMake.vfs = { ...(pdfMake.vfs ?? {}), ...(await courierFiles()) };
  pdfMake.fonts = { ...(pdfMake.fonts ?? {}), Courier: { normal: "Courier", bold: "Courier-Bold", italics: "Courier-Oblique", bolditalics: "Courier-BoldOblique" } };

  const content: Record<string, unknown>[] = [];
  const at = (text: string, x: number, y: number, extra: Record<string, unknown> = {}) => content.push({ text: winAnsi(text), absolutePosition: { x, y }, ...extra });
  let first = true;
  const startPage = () => {
    if (!first) content.push({ text: "", pageBreak: "before" });
    first = false;
  };

  if (options.titlePage) {
    startPage();
    const tp = options.titlePage;
    const centered = (text: string, y: number, extra: Record<string, unknown> = {}) => at(text, LEFT - 36 + ((66 - text.length) * CHAR) / 2, y, extra);
    centered(tp.title.toUpperCase(), 300, { bold: true });
    tp.lines.forEach((l, i) => centered(l, 336 + i * 2 * LINE));
    if (tp.footer) wrap(tp.footer, 60).forEach((l, i) => at(l, LEFT, 700 + i * LINE));
  }
  pages.forEach((page, i) => {
    startPage();
    if (options.header) at(options.header, LEFT, TOP - 36);
    if (i > 0 || options.titlePage) at(`${i + 1}.`, LEFT + PAGE_WIDTH * CHAR - `${i + 1}.`.length * CHAR + 36, TOP - 36);
    page.forEach((line, row) => {
      const y = TOP + row * LINE;
      if (!line.text) return;
      const x =
        line.align === "right"
          ? LEFT + (PAGE_WIDTH - line.text.length) * CHAR
          : line.align === "center"
            ? LEFT + ((PAGE_WIDTH - line.text.length) * CHAR) / 2
            : LEFT + line.indent * CHAR;
      at(line.text, x, y, { bold: line.bold, decoration: line.underline ? "underline" : undefined });
      if (line.number) {
        at(line.number, LEFT - 6 * CHAR, y, { bold: true });
        at(line.number, LEFT + (PAGE_WIDTH + 2) * CHAR, y, { bold: true });
      } else if (line.revised) {
        at("*", LEFT + (PAGE_WIDTH + 3) * CHAR, y);
      }
    });
  });

  const definition = {
    info: { title: winAnsi(title), creator: "GANIS" },
    pageSize: "A4",
    pageMargins: [LEFT, TOP, 55, 72],
    defaultStyle: { font: "Courier", fontSize: 12 },
    content,
  };
  return new Promise((resolve, reject) => {
    try {
      pdfMake.createPdf(definition).getBuffer((buffer) => resolve(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)));
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Word : un paragraphe par élément, aux retraits du format standard, en
 * Courier New 12 ; Word fait lui-même la pagination (le fichier reste
 * modifiable). Les numéros de scène encadrent l'en-tête.
 */
export async function elementsToDocx(elements: ScreenplayElement[], labels: LayoutLabels, options: RenderOptions = {}): Promise<Uint8Array> {
  const docx = await import("docx");
  const { AlignmentType, Document, Header, Packer, PageBreak, PageNumber, Paragraph, TextRun, TabStopType } = docx;
  const TW = 144; // un caractère de Courier 12 en vingtièmes de point
  const para = (text: string, indent: number, extra: Record<string, unknown> = {}, runs: Record<string, unknown> = {}) =>
    new Paragraph({ indent: { left: indent * TW }, spacing: { line: 240, lineRule: "exact" as never, before: 0, after: 0 }, children: [new TextRun({ text, ...runs })], ...extra });
  const blank = () => para("", 0);
  const children: InstanceType<typeof Paragraph>[] = [];

  if (options.titlePage) {
    const tp = options.titlePage;
    for (let i = 0; i < 18; i += 1) children.push(blank());
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: tp.title.toUpperCase(), bold: true })] }));
    for (const l of tp.lines) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240 }, children: [new TextRun(l)] }));
    if (tp.footer) children.push(new Paragraph({ spacing: { before: 2400 }, children: [new TextRun(tp.footer)] }));
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  for (const el of elements) {
    switch (el.type) {
      case "section":
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 480, after: 240 },
            children: [...(el.pageBreakBefore ? [new PageBreak()] : []), new TextRun({ text: el.text.toUpperCase(), bold: true, underline: {} })],
          }),
        );
        break;
      case "heading":
        children.push(blank());
        children.push(
          new Paragraph({
            keepNext: true,
            spacing: { before: 240 },
            indent: el.number ? { left: 0, hanging: 0 } : undefined,
            tabStops: [{ type: TabStopType.RIGHT, position: (PAGE_WIDTH + 6) * TW }],
            children: [new TextRun({ text: `${el.number ? `${el.number}  ` : ""}${el.text.toUpperCase()}${el.number ? `\t${el.number}` : ""}`, bold: true })],
          }),
        );
        break;
      case "action":
      case "shot":
        children.push(blank(), para(el.type === "shot" ? el.text.toUpperCase() : el.text, 0, {}, {}));
        break;
      case "transition":
        children.push(blank(), new Paragraph({ alignment: AlignmentType.RIGHT, indent: { right: 0 }, children: [new TextRun(el.text.toUpperCase())] }));
        break;
      case "dialogue":
        children.push(blank(), para(el.contd ? `${el.character.toUpperCase()} ${labels.contd}` : el.character.toUpperCase(), COLUMNS.character.indent, { keepNext: true }));
        if (el.parenthetical?.trim()) children.push(para(`(${el.parenthetical.trim().replace(/^\(|\)$/g, "")})`, COLUMNS.parenthetical.indent, { keepNext: true }));
        children.push(para(el.text, COLUMNS.dialogue.indent, { indent: { left: COLUMNS.dialogue.indent * TW, right: (PAGE_WIDTH - COLUMNS.dialogue.indent - COLUMNS.dialogue.width) * TW } }));
        break;
    }
  }

  const file = new Document({
    creator: "GANIS",
    styles: { default: { document: { run: { font: "Courier New", size: 24 } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 2160, right: 1440 } } },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                tabStops: [{ type: TabStopType.RIGHT, position: PAGE_WIDTH * TW }],
                children: [new TextRun(options.header ?? ""), new TextRun({ children: ["\t", PageNumber.CURRENT, "."] })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  const blob = await Packer.toBlob(file);
  return new Uint8Array(await blob.arrayBuffer());
}
