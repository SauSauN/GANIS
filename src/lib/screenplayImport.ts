import type { ScenePlace, SceneTime, ScreenplayKind } from "@/types";

/*
 * Import d'un scénario écrit ailleurs (testé) :
 * - Fountain (.fountain, .txt) : le texte brut des logiciels de scénario ;
 * - Final Draft (.fdx) : XML, un paragraphe par élément.
 *
 * Le résultat est une suite de scènes : en-tête (intérieur / extérieur,
 * lieu, moment), puis éléments (action, réplique avec son personnage et
 * sa didascalie, transition, plan, note). Les personnages et les lieux
 * sont donnés par leur nom : l'interface les relie aux fiches existantes
 * ou en crée.
 */

export interface ImportedBlock {
  kind: ScreenplayKind;
  /** Nom du personnage (réplique), tel qu'écrit, sans extension (V.O.)… */
  character: string | null;
  parenthetical: string;
  content: string;
}

export interface ImportedScene {
  /** En-tête tel qu'écrit (« INT. CUISINE — NUIT »). */
  heading: string;
  place: ScenePlace | null;
  location: string | null;
  time: SceneTime | null;
  blocks: ImportedBlock[];
}

export interface ImportedScript {
  title: string | null;
  scenes: ImportedScene[];
}

// ----------------------------------------------------------------------------
// En-tête de scène
// ----------------------------------------------------------------------------

const TIMES: Array<[RegExp, SceneTime]> = [
  [/^(DAY|JOUR)$/, "day"],
  [/^(NIGHT|NUIT)$/, "night"],
  [/^(MORNING|MATIN)$/, "morning"],
  [/^(EVENING|SOIR|SOIRÉE)$/, "evening"],
  [/^(DAWN|AUBE)$/, "dawn"],
  [/^(DUSK|CRÉPUSCULE|CREPUSCULE)$/, "dusk"],
  [/^(CONTINUOUS|CONTINU|CONTINUE|SUITE)$/, "continuous"],
  [/^(LATER|PLUS TARD)$/, "later"],
];

const PLACE = /^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\/E\.?|INT\.|EXT\.|EST\.|INT |EXT |EST )\s*/i;

/** Ligne qui ressemble à un en-tête de scène (INT., EXT., INT./EXT., EST.). */
export function isSceneHeading(line: string): boolean {
  return PLACE.test(line.trim() + " ");
}

/** « INT. CUISINE — NUIT #12# » → intérieur, « Cuisine », nuit. */
export function parseHeading(raw: string): Pick<ImportedScene, "heading" | "place" | "location" | "time"> {
  const heading = raw.replace(/#[^#]*#\s*$/, "").trim();
  const match = heading.match(PLACE);
  let place: ScenePlace | null = null;
  let rest = heading;
  if (match) {
    const token = match[1].toUpperCase().replace(/\s/g, "");
    place = token.includes("/") ? "intExt" : token.startsWith("INT") ? "int" : "ext";
    rest = heading.slice(match[0].length);
  }
  let time: SceneTime | null = null;
  const parts = rest.split(/\s+[-–—]\s+/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1].trim().toUpperCase();
    const found = TIMES.find(([re]) => re.test(last));
    if (found) {
      time = found[1];
      parts.pop();
    }
  }
  const location = parts.join(" — ").trim();
  return { heading, place, location: location ? titleCase(location) : null, time };
}

/** « CUISINE DU PHARE » → « Cuisine du phare » (les lieux s'écrivent en minuscules dans les fiches). */
export function titleCase(text: string): string {
  if (text !== text.toUpperCase()) return text;
  const lower = text.toLocaleLowerCase("fr");
  return lower.charAt(0).toLocaleUpperCase("fr") + lower.slice(1);
}

/** Nom d'un personnage sans son extension : « LÉA (V.O.) » → « LÉA ». */
export function cleanCharacter(name: string): string {
  return name
    .replace(/^@/, "")
    .replace(/\s*\^\s*$/, "")
    .replace(/\s*\((V\.?O\.?|O\.?S\.?|O\.?C\.?|OFF|CONT'D|CONT’D|SUITE|CONT\.?)\)\s*/gi, " ")
    .trim();
}

// ----------------------------------------------------------------------------
// Fountain
// ----------------------------------------------------------------------------

const isUpper = (line: string) => /\p{L}/u.test(line) && line === line.toUpperCase();

/** Lit un scénario au format Fountain. */
export function parseFountain(text: string): ImportedScript {
  // Commentaires /* … */ (« boneyard ») retirés, fins de ligne unifiées.
  const source = text.replace(/\r\n?/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const lines = source.split("\n");
  let title: string | null = null;
  let start = 0;

  // Page de titre : « Clé: valeur » jusqu'à la première ligne vide.
  if (/^[A-Za-z ]+:/.test(lines[0] ?? "")) {
    while (start < lines.length && lines[start].trim() !== "") {
      const m = lines[start].match(/^Title:\s*(.*)$/i);
      if (m && m[1].trim()) title = m[1].trim().replace(/^_|_$|\*/g, "");
      start += 1;
    }
  }

  const scenes: ImportedScene[] = [];
  let scene: ImportedScene | null = null;
  const ensureScene = () => {
    if (!scene) {
      scene = { heading: "", place: null, location: null, time: null, blocks: [] };
      scenes.push(scene);
    }
    return scene;
  };

  let i = start;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    const prevBlank = i === 0 || lines[i - 1].trim() === "";
    const nextLine = lines[i + 1]?.trim() ?? "";

    if (!line) {
      i += 1;
      continue;
    }
    // Sections et résumés : structure du document, ignorés ; saut de page.
    if (/^#/.test(line) || /^=(?!=)/.test(line) || /^===+$/.test(line)) {
      i += 1;
      continue;
    }
    // Note [[…]] seule sur sa ligne.
    const note = line.match(/^\[\[([\s\S]*)\]\]$/);
    if (note) {
      ensureScene().blocks.push({ kind: "note", character: null, parenthetical: "", content: note[1].trim() });
      i += 1;
      continue;
    }
    // En-tête de scène (forcé par un point, ou INT./EXT.).
    if (prevBlank && ((line.startsWith(".") && !line.startsWith("..")) || isSceneHeading(line))) {
      scene = { ...parseHeading(line.replace(/^\./, "")), blocks: [] };
      scenes.push(scene);
      i += 1;
      continue;
    }
    // Transition (forcée par « > », ou en capitales finissant par « TO: »).
    if ((line.startsWith(">") && !line.endsWith("<")) || (prevBlank && isUpper(line) && /(TO:|À:|SUR:)$/.test(line) && nextLine === "")) {
      ensureScene().blocks.push({ kind: "transition", character: null, parenthetical: "", content: line.replace(/^>\s*/, "") });
      i += 1;
      continue;
    }
    // Réplique : nom en capitales (ou forcé par « @ »), suivi du texte.
    if (prevBlank && nextLine && (line.startsWith("@") || (isUpper(line) && !line.startsWith("!")))) {
      const character = cleanCharacter(line);
      i += 1;
      let parenthetical = "";
      let content: string[] = [];
      const flush = () => {
        if (content.length || parenthetical) {
          ensureScene().blocks.push({ kind: "dialogue", character, parenthetical, content: content.join("\n").trim() });
        }
        content = [];
        parenthetical = "";
      };
      while (i < lines.length && lines[i].trim() !== "") {
        const l = lines[i].trim();
        if (/^\(.*\)$/.test(l)) {
          // Une didascalie au milieu d'une réplique en ouvre une nouvelle.
          if (content.length) flush();
          parenthetical = l.slice(1, -1).trim();
        } else content.push(l);
        i += 1;
      }
      flush();
      continue;
    }
    // Action (forcée par « ! »), jusqu'à la ligne vide.
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() !== "") {
      paragraph.push(lines[i].trim().replace(/^!/, "").replace(/^>(.*)<$/, "$1").trim());
      i += 1;
    }
    ensureScene().blocks.push({ kind: "action", character: null, parenthetical: "", content: paragraph.join("\n") });
  }
  return { title, scenes: scenes.filter((s) => s.heading || s.blocks.length) };
}

// ----------------------------------------------------------------------------
// Final Draft (.fdx)
// ----------------------------------------------------------------------------

/** Lit un scénario Final Draft (.fdx). */
export function parseFdx(xml: string): ImportedScript {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("fdx");
  const content = doc.getElementsByTagName("Content")[0];
  if (!content) throw new Error("fdx");
  const title = doc.querySelector("TitlePage Paragraph Text")?.textContent?.trim() || null;

  const scenes: ImportedScene[] = [];
  let scene: ImportedScene | null = null;
  const ensureScene = () => {
    if (!scene) {
      scene = { heading: "", place: null, location: null, time: null, blocks: [] };
      scenes.push(scene);
    }
    return scene;
  };
  let character: string | null = null;
  let parenthetical = "";

  for (const paragraph of Array.from(content.children).filter((n) => n.tagName === "Paragraph")) {
    const type = paragraph.getAttribute("Type") ?? "Action";
    const text = Array.from(paragraph.getElementsByTagName("Text"))
      .map((t) => t.textContent ?? "")
      .join("")
      .trim();
    if (!text && type !== "Dialogue") continue;
    switch (type) {
      case "Scene Heading":
        scene = { ...parseHeading(text), blocks: [] };
        scenes.push(scene);
        character = null;
        break;
      case "Character":
        character = cleanCharacter(text);
        parenthetical = "";
        break;
      case "Parenthetical":
        parenthetical = text.replace(/^\(|\)$/g, "").trim();
        break;
      case "Dialogue":
        ensureScene().blocks.push({ kind: "dialogue", character, parenthetical, content: text });
        parenthetical = "";
        break;
      case "Transition":
        ensureScene().blocks.push({ kind: "transition", character: null, parenthetical: "", content: text });
        character = null;
        break;
      case "Shot":
        ensureScene().blocks.push({ kind: "shot", character: null, parenthetical: "", content: text });
        character = null;
        break;
      default:
        ensureScene().blocks.push({ kind: "action", character: null, parenthetical: "", content: text });
        character = null;
    }
  }
  return { title, scenes: scenes.filter((s) => s.heading || s.blocks.length) };
}

/** Lit un fichier Fountain ou Final Draft selon son extension. */
export async function readScreenplayFile(file: File): Promise<ImportedScript> {
  const text = await file.text();
  return /\.fdx$/i.test(file.name) ? parseFdx(text) : parseFountain(text);
}

export const SCREENPLAY_IMPORT_EXTENSIONS = [".fountain", ".spmd", ".txt", ".fdx"];

/** Noms des personnages et des lieux d'un scénario importé, sans doublon. */
export function importedNames(script: ImportedScript): { characters: string[]; locations: string[] } {
  const characters = new Set<string>();
  const locations = new Set<string>();
  for (const scene of script.scenes) {
    if (scene.location) locations.add(scene.location);
    for (const block of scene.blocks) if (block.character) characters.add(block.character);
  }
  return { characters: [...characters], locations: [...locations] };
}

/** Clé de comparaison d'un nom : sans accents, sans casse, espaces réduits. */
export function nameKey(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
