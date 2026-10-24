/**
 * ============================================================================
 *  GANIS — Initialisation des projets de démonstration
 * ============================================================================
 *
 *  Ce script crée DEUX projets complets et professionnels dans GANIS :
 *
 *    1. ROMAN  : "Les Racines du Silence"
 *                Thriller psychologique de science-fiction dystopique.
 *
 *    2. MANGA  : "Kurokumo no Tsuyoshi" (La Force du Nuage Noir)
 *                Shonen de sabre et fantasy, format manga professionnel.
 *
 *  Il utilise EXCLUSIVEMENT les commandes Tauri déjà présentes dans GANIS
 *  (via src/lib/api). Aucune fonctionnalité n'est simulée : tout ce qui est
 *  créé ici est réellement visible, éditable et persisté dans l'application.
 *
 *  Chaque projet exploite au maximum les modules suivants :
 *    - Synopsis (genres, sous-genres, ton)
 *    - Personnages (fiches complètes, 3 niveaux de détail)
 *    - Relations entre personnages (graphe)
 *    - Lieux (hiérarchie, types, champs spécifiques)
 *    - Liens personnages ↔ lieux
 *    - Structure narrative (parties/tomes, chapitres, scènes/pages)
 *    - Texte rédigé dans chaque scène/page
 *    - Objectifs de mots / pages, état de rédaction, narration
 *    - Trame (Plot Board) : événements, liens de cause à effet, tension
 *    - Notes (bible de l'univers, recherches, idées)
 *    - Documents de référence (à ajouter manuellement)
 *    - Historique, versions, corbeille (via l'utilisation normale)
 *    - Recherche (testable sur tout le contenu ci-dessous)
 *
 *  ── Utilisation ─────────────────────────────────────────────────────────
 *
 *    1. Connecte-toi dans GANIS (un compte doit exister).
 *    2. Depuis la racine du dépôt :
 *
 *        npm install -D tsx
 *        npx tsx scripts/seed-demo-projects.ts
 *
 *       Pour supprimer et recréer les deux projets :
 *
 *        npx tsx scripts/seed-demo-projects.ts --force
 *
 *  ── Sécurité ────────────────────────────────────────────────────────────
 *
 *    - Aucune donnée personnelle, aucun secret, aucun chemin local.
 *    - Contenu entièrement original (auteur fictif : "Nelly Auteur").
 *    - Sans --force, refuse de s'exécuter si un projet du même nom existe.
 *    - Avec --force, supprime puis purge les projets avant de les recréer.
 *    - Ne touche à aucun autre projet ni réglage de l'application.
 * ============================================================================
 */

import { api } from "../src/lib/api/index";
import type {
  CharacterInput,
  LocationInput,
  RelationInput,
  PlotEvent,
  PlotData,
  StructureNode,
} from "../src/types";

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

const FORCE = process.argv.includes("--force");

const c = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

const log = (m: string) => console.log(`${c.cyan}[seed]${c.reset} ${m}`);
const ok = (m: string) => console.log(`${c.green}  ✓${c.reset} ${m}`);
const warn = (m: string) => console.log(`${c.yellow}  !${c.reset} ${m}`);
const title = (m: string) => console.log(`\n${c.bold}${c.cyan}━━ ${m} ━━${c.reset}`);

function id(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function assertNotExists(name: string): Promise<void> {
  const projects = await api.listProjects();
  const existing = projects.find((p) => p.name === name);
  if (!existing) return;
  if (!FORCE) {
    throw new Error(
      `Le projet "${name}" existe déjà. Relance avec --force pour le remplacer.`,
    );
  }
  warn(`Suppression de "${name}" existant…`);
  await api.deleteProject(existing.id);
  const trashed = await api.listProjectTrash();
  for (const p of trashed) if (p.name === name) await api.purgeProject(p.id);
}

// ---------------------------------------------------------------------------
// Structure : helpers
// ---------------------------------------------------------------------------

interface StructureSpec {
  title: string;
  summary?: string;
  content?: string;
  /** Remplit l'objectif de mots (roman) ou de pages (manga). */
  wordGoal?: number;
  pageGoal?: number;
  /** État de rédaction (roman) ou statut de scénario (manga). */
  writingStatus?: "todo" | "draft" | "revision" | "proofread" | "corrected";
  scriptStatus?: "todo" | "progress" | "review" | "final";
  narrativeGoal?: string;
  children?: StructureSpec[];
}

/**
 * Construit récursivement un arbre dans le découpage du projet.
 * `level` commence à 0. `maxLevel` indique le niveau maximal (dernier niveau
 * des scènes/pages, où le texte et le contenu sont écrits).
 */
async function buildStructure(
  projectId: string,
  specs: StructureSpec[],
  level = 0,
  parentId: string | null = null,
): Promise<Map<string, StructureNode>> {
  const map = new Map<string, StructureNode>();
  for (const spec of specs) {
    const node = await api.createStructureNode(projectId, {
      parentId,
      level,
      title: spec.title,
    });
    if (spec.summary) {
      await api.updateStructureNode(projectId, node.id, {
        summary: spec.summary,
      });
    }
    if (spec.content) {
      await api.setStructureNodeContent(projectId, node.id, spec.content);
    }
    if (spec.wordGoal !== undefined) {
      await api.setStructureNodeNovel(projectId, node.id, {
        wordGoal: spec.wordGoal,
        writingStatus: spec.writingStatus ?? "todo",
        narrativePerson: null,
        narrativeTense: null,
      });
    }
    if (spec.scriptStatus !== undefined || spec.narrativeGoal !== undefined) {
      await api.setMangaChapter(projectId, node.id, {
        narrativeGoal: spec.narrativeGoal ?? "",
        pageGoal: spec.pageGoal ?? null,
        scriptStatus: spec.scriptStatus ?? "todo",
      });
    }
    map.set(`${level}:${spec.title}`, node);
    if (spec.children?.length) {
      const children = await buildStructure(
        projectId,
        spec.children,
        level + 1,
        node.id,
      );
      for (const [k, v] of children) map.set(k, v);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Personnages
// ---------------------------------------------------------------------------

async function createCharacter(
  projectId: string,
  input: CharacterInput,
): Promise<string> {
  const character = await api.createCharacter(projectId, input);
  return character.id;
}

// ---------------------------------------------------------------------------
// Lieux
// ---------------------------------------------------------------------------

async function createLocation(
  projectId: string,
  input: LocationInput,
): Promise<string> {
  const location = await api.createLocation(projectId, input);
  return location.id;
}

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

async function createRelation(
  projectId: string,
  input: RelationInput,
): Promise<void> {
  await api.createRelation(projectId, input);
}

// ---------------------------------------------------------------------------
// Trame (Plot Board)
// ---------------------------------------------------------------------------

interface SeedEvent {
  lane: "main" | "sub" | "third";
  row: number;
  title: string;
  note: string;
  pivot: boolean;
  status: "idea" | "draft" | "written" | "revised";
  tags?: string[];
  characterIds?: string[];
  povId?: string | null;
  locationId?: string | null;
  nodeId?: string | null;
  words?: number;
}

async function seedPlot(
  projectId: string,
  events: SeedEvent[],
  options: {
    subLaneName: string;
    thirdLaneName: string;
    tension: Record<number, number>;
    acts: Record<number, string>;
    rowLabels: Record<number, string>;
  },
): Promise<void> {
  const raw = await api.getPlot(projectId);
  const data: PlotData = raw.data ? JSON.parse(raw.data) : { lanes: [] };

  // Trame principale par défaut (créée par blankPlot)
  if (!data.lanes || data.lanes.length === 0) {
    throw new Error("La trame par défaut n'a pas été créée par le projet.");
  }
  const main = data.lanes.find((l) => l.main) ?? data.lanes[0];

  // Ajout de deux trames parallèles si absentes
  if (!data.lanes.find((l) => l.name === options.subLaneName)) {
    data.lanes.push({
      id: id(),
      name: options.subLaneName,
      color: "#2b7de9",
      main: false,
      hidden: false,
      characterId: null,
    });
  }
  if (!data.lanes.find((l) => l.name === options.thirdLaneName)) {
    data.lanes.push({
      id: id(),
      name: options.thirdLaneName,
      color: "#e3a21a",
      main: false,
      hidden: false,
      characterId: null,
    });
  }
  const sub = data.lanes.find((l) => l.name === options.subLaneName)!;
  const third = data.lanes.find((l) => l.name === options.thirdLaneName)!;

  const laneId = (k: "main" | "sub" | "third") =>
    k === "main" ? main.id : k === "sub" ? sub.id : third.id;

  for (const e of events) {
    const event: PlotEvent = {
      id: id(),
      laneId: laneId(e.lane),
      row: e.row,
      title: e.title,
      note: e.note,
      pivot: e.pivot,
      status: e.status,
      tags: e.tags ?? [],
      characterIds: e.characterIds ?? [],
      povId: e.povId ?? null,
      locationId: e.locationId ?? null,
      nodeId: e.nodeId ?? null,
      alsoNodeIds: [],
      noteIds: [],
      date: "",
      words: e.words ?? 0,
    };
    data.events.push(event);
  }

  data.tension = options.tension;
  data.acts = options.acts;
  data.rowLabels = options.rowLabels;

  await api.updatePlot(projectId, JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

async function createNote(
  projectId: string,
  noteTitle: string,
  paragraphs: string[],
  folderId: string | null = null,
): Promise<string> {
  const note = await api.createNote(projectId, folderId, noteTitle);
  // Contenu TipTap JSON (paragraphes).
  const content = {
    type: "doc",
    content: paragraphs.map((p) => ({
      type: "paragraph",
      content: p ? [{ type: "text", text: p }] : [],
    })),
  };
  await api.updateNote(projectId, note.id, {
    content: JSON.stringify(content),
    excerpt: paragraphs.join(" ").slice(0, 300),
  });
  return note.id;
}

async function createFolder(
  projectId: string,
  name: string,
  parentId: string | null = null,
): Promise<string> {
  const folder = await api.createNoteFolder(projectId, parentId, name);
  return folder.id;
}

// ===========================================================================
// ██  PROJET 1 — ROMAN : « Les Racines du Silence »
// ===========================================================================

async function seedNovel(): Promise<void> {
  title("ROMAN — Les Racines du Silence");

  await assertNotExists("Les Racines du Silence");

  const project = await api.createProject({
    name: "Les Racines du Silence",
    description:
      "Dans la cité-état d'Aethel, où les souvenirs se vendent et s'achètent, une jeune archiviste découvre une mémoire qui pourrait faire tomber le Consortium. Thriller psychologique sur l'identité, la vérité et le prix de l'oubli.",
    projectType: "novel",
  });
  ok(`Projet créé (${project.id})`);

  // --- Synopsis -----------------------------------------------------------
  await api.updateSynopsis(project.id, {
    content:
      "<p>Elara Vance, archiviste méticuleuse du Grand Archive d'Aethel, mène une vie réglée jusqu'au jour où elle trouve un éclat de mémoire qui n'aurait jamais dû se trouver dans ses rayons. Ce souvenir appartient à un homme mort depuis vingt ans — et il contient un secret que le Consortium of Memory a tout fait pour effacer.</p><p>Contrainte de fuir, Elara descend dans les quartiers noyés de la ville, où elle rencontre Lyra, une ancienne plongeuse de mémoire au passé trouble, et Simon, un enfant qui a trouvé un éclat perdu. Poursuivie par Kaelen Roric, l'agent le plus redouté du Consortium, Elara devra choisir entre la vérité qu'elle cherche et celle qu'elle est devenue.</p>",
    genres: ["Science-fiction", "Thriller"],
    subgenres: ["Dystopie", "Cyberpunk", "Roman psychologique"],
    tone: ["Sombre", "Mélancolique", "Tendu"],
  });
  ok("Synopsis, genres, sous-genres et ton");

  // --- Personnages --------------------------------------------------------
  const elaraId = await createCharacter(project.id, {
    firstName: "Elara",
    lastName: "Vance",
    role: "main",
    status: "alive",
    fields: {
      nickname: "La Fourmi",
      age: "29 ans",
      gender: "female",
      occupation: "Archiviste au Grand Archive",
      origin: "",
      description:
        "Silhouette menue, cheveux bruns toujours attachés, mains fines d'archiviste. Elle a le regard de ceux qui lisent plus qu'ils ne parlent.",
      mainGoal:
        "Comprendre pourquoi un souvenir impossible se trouve dans l'Archive.",
      distinctiveTrait:
        "Elle note tout dans un carnet de cuir noir qu'elle ne quitte jamais.",
      notes: "",
      height: "1,68 m",
      build: "slim",
      silhouette: "Menue, droite, discrète",
      skinTone: "Pâle, presque translucide",
      face: "Visage fin, pommettes hautes",
      eyes: "Gris-vert, souvent baissés",
      hair: "Bruns, attachés en chignon lâche",
      distinguishingMarks:
        "Une cicatrice fine au poignet gauche, souvenir d'enfance.",
      voice: "Calme, posée, avec un léger accent des quartiers hauts.",
      postureGait: "Démarche droite, silencieuse",
      clothingStyle: "Pratique et sobre, tons gris et bleus.",
      mainOutfit: "Tunique grise, pantalon sombre, bottines usées",
      accessories: "Carnet noir, stylo à encre",
      colorPalette: JSON.stringify(["#3b5b8c", "#6b7a8f", "#e8e5df"]),
      psychology:
        "Elara croit que la vérité a une valeur absolue. C'est sa force et sa faiblesse : elle ne sait pas lâcher prise, même quand cela la détruit.",
      traits: JSON.stringify(["Méticuleuse", "Obstinée", "Introvertie"]),
      strengths: JSON.stringify(["Rigoureuse", "Courageuse à sa manière"]),
      flaws: JSON.stringify([
        "Naïve sur les intentions des autres",
        "Incapable de pardonner le mensonge",
      ]),
      motivations:
        "Sa mère est morte dans un « accident de mémoire » qu'elle n'a jamais pu expliquer.",
      deepDesire: "Comprendre la vérité sur la mort de sa mère.",
      fears: "Perdre la mémoire de sa mère — la seule qui lui reste.",
      weaknesses: "Ne sait pas mentir.",
      coreValues: "La vérité avant tout",
      beliefs: "Croire que la vérité libère",
      formativeEvent:
        "À 19 ans, elle a perdu sa mère dans un accident de mémoire.",
      secret: "Elle a déjà goûté à une mémoire illicite dans sa jeunesse.",
      innerConflict:
        "Chercher la vérité coûte des vies ; l'ignorer coûte son âme.",
      adversityResponse:
        "Elle se replie, observe, puis frappe avec précision.",
      plannedArc:
        "De l'archiviste qui croit à la vérité absolue à la femme qui apprend à choisir quel mensonge protège.",
    },
  });
  ok("Elara Vance créée");

  const kaelId = await createCharacter(project.id, {
    firstName: "Kaelen",
    lastName: "Roric",
    role: "antagonist",
    status: "alive",
    fields: {
      nickname: "Kael",
      age: "41 ans",
      gender: "male",
      occupation: "Agent senior du Consortium of Memory",
      description:
        "Grand, sec, élégant. Il porte des gants en permanence pour ne pas toucher les éclats qu'il manipule.",
      mainGoal:
        "Empêcher que l'ordre d'Aethel ne s'effondre — par tous les moyens.",
      distinctiveTrait: "Ne hausse jamais la voix, même quand il menace.",
      height: "1,89 m",
      build: "athletic",
      eyes: "Noisette, froids",
      hair: "Châtains gris, courts",
      distinguishingMarks:
        "Pas de cicatrice visible, mais ses gants cachent des marques.",
      voice: "Basse, lente, sans accent identifiable.",
      clothingStyle:
        "Costume sombre, gants noirs, jamais un cheveu de travers.",
      mainOutfit: "Costume noir, chemise blanche, gants de cuir noir",
      accessories: "Montre de gousset, stylo de cérémonie",
      colorPalette: JSON.stringify(["#1a1a1a", "#8b0000", "#c0c0c0"]),
      psychology:
        "Kaelen a vu l'effondrement d'une ville autrefois. Il croit, sincèrement, que le contrôle des mémoires est la seule chose qui empêche le chaos.",
      traits: JSON.stringify(["Discipliné", "Implacable", "Persuasif"]),
      strengths: JSON.stringify(["Sang-froid", "Réseau d'informateurs"]),
      flaws: JSON.stringify([
        "Croît que la fin justifie les moyens",
        "Incapable de douter de lui-même",
      ]),
      motivations:
        "Il a effacé ses propres souvenirs d'enfance pour devenir l'agent parfait.",
      deepDesire: "Devenir un homme sans failles.",
      fears: "L'effondrement de l'ordre qu'il a bâti.",
      weaknesses: "Lyra.",
      coreValues: "L'ordre avant tout",
      beliefs: "Le contrôle des mémoires est nécessaire.",
      formativeEvent:
        "Il a vu une ville entière sombrer dans la folie à cause de souvenirs non contrôlés.",
      secret: "Lyra l'a formé — et il n'a jamais réussi à l'effacer complètement.",
      innerConflict:
        "Il protège un ordre dont il sait qu'il est corrompu, parce qu'il ne connaît pas d'alternative.",
      adversityResponse:
        "Il reste calme, analyse, puis frappe précisément.",
      plannedArc:
        "De l'agent inflexible à l'homme qui, à la fin, choisit de laisser Elara faire ce qu'il n'a jamais osé.",
    },
  });
  ok("Kaelen Roric créé");

  const lyraId = await createCharacter(project.id, {
    firstName: "Lyra",
    lastName: "",
    role: "mentor",
    status: "alive",
    fields: {
      age: "Dans les 60 ans (elle ne dit jamais son âge)",
      gender: "female",
      occupation:
        "Ancienne plongeuse de mémoire, aujourd'hui guide au Sunken Quarter",
      description:
        "Peau mate, cheveux blancs coupés ras, mains d'ancienne combattante. Elle marche avec une canne dont personne ne sait si elle en a besoin.",
      mainGoal:
        "Protéger les fragments de sa propre mémoire qu'elle a cachés dans la ville.",
      distinctiveTrait:
        "Elle porte une prothèse de verre à l'œil gauche.",
      height: "1,72 m",
      build: "athletic",
      eyes:
        "Une prothèse de verre à l'œil gauche, l'autre est vert sombre.",
      hair: "Blancs, très courts",
      distinguishingMarks:
        "Une prothèse oculaire visible à l'œil nu.",
      voice:
        "Rauque, à cause d'années à respirer des vapeurs de souvenirs.",
      clothingStyle: "Pratique, sombre, usé aux coudes.",
      mainOutfit: "Veste de cuir fatiguée, bottes de pluie",
      accessories: "Canne de marche en bois noir",
      colorPalette: JSON.stringify(["#4a3f35", "#8b6f47", "#e0d5c1"]),
      psychology:
        "Lyra a tout vu, tout fait, et elle rit de ce qu'elle ne peut plus changer. Mais elle reconnaît en Elara sa propre jeunesse.",
      traits: JSON.stringify(["Cynique", "Protectrice", "Imprévisible"]),
      strengths: JSON.stringify(["Expérience", "Connaissance du réseau"]),
      flaws: JSON.stringify([
        "Manipule ceux qu'elle aime",
        "Ne dit jamais toute la vérité",
      ]),
      motivations: "Se racheter une conscience.",
      deepDesire: "Mourir utile.",
      fears: "Que Kaelen sache ce qu'elle a fait.",
      weaknesses: "Les enfants.",
      coreValues: "La liberté",
      beliefs: "Rien n'est jamais perdu.",
      formativeEvent:
        "Elle a laissé mourir un enfant qu'elle aurait pu sauver.",
      secret:
        "Le souvenir d'enfance de Kaelen, qu'elle n'a jamais osé détruire.",
      innerConflict:
        "Elle veut protéger Elara comme elle a trahi Kaelen.",
      adversityResponse:
        "Elle rit, puis elle agit.",
      plannedArc:
        "De la survivante solitaire à la femme qui accepte de mourir pour ses élèves.",
    },
  });
  ok("Lyra créée");

  // Simon (personnage secondaire important, POV d'interludes)
  const simonId = await createCharacter(project.id, {
    firstName: "Simon",
    lastName: "",
    role: "secondary",
    status: "alive",
    fields: {
      age: "11 ans",
      gender: "male",
      occupation: "Enfant des bas-fonds",
      description:
        "Petit garçon maigre, vêtu de vêtements trop grands. Il a trouvé un éclat de mémoire par hasard et ne sait pas quoi en faire.",
      mainGoal: "Comprendre ce qu'il a trouvé dans les décombres.",
      distinctiveTrait: "Il parle aux éclats comme à des personnes.",
      build: "slim",
      eyes: "Noirs, très grands",
      hair: "Noirs, en bataille",
      voice: "Aigu, un peu cassé.",
      clothingStyle: "Haillons rapiécés.",
      colorPalette: JSON.stringify(["#2b2b2b", "#8b0000", "#d4a373"]),
      psychology:
        "Simon a appris à survivre seul. Il est plus malin qu'il n'y paraît.",
      traits: JSON.stringify(["Curieux", "Méfiant", "Malin"]),
      fears: "Que les adultes lui prennent son éclat.",
      secret: "Il a compris ce que l'éclat contient, mais ne le dit pas.",
      plannedArc:
        "De l'enfant invisible à celui qui déclenche la catastrophe finale.",
    },
  });
  ok("Simon créé (POV secondaire)");

  // --- Relations -----------------------------------------------------------
  await createRelation(project.id, {
    sourceId: kaelId,
    targetId: lyraId,
    type: "mentor",
    directed: true,
    intensity: 4,
    sentiment: "neutral",
    label: "Élève devenu rival",
    description:
      "Lyra a formé Kaelen, puis l'a vu la trahir. Il reste une affection amère entre eux.",
    sinceNode: null,
    untilNode: null,
  });
  await createRelation(project.id, {
    sourceId: elaraId,
    targetId: lyraId,
    type: "mentor",
    directed: true,
    intensity: 5,
    sentiment: "positive",
    label: "Mère de substitution",
    description:
      "Lyra voit en Elara la fille qu'elle n'a jamais eue, et la protégera jusqu'au bout.",
    sinceNode: null,
    untilNode: null,
  });
  await createRelation(project.id, {
    sourceId: elaraId,
    targetId: kaelId,
    type: "rivalry",
    directed: false,
    intensity: 3,
    sentiment: "negative",
    label: "Poursuite",
    description:
      "Kaelen veut l'éclat, Elara veut la vérité. Leurs objectifs sont inconciliables.",
    sinceNode: null,
    untilNode: null,
  });
  await createRelation(project.id, {
    sourceId: elaraId,
    targetId: simonId,
    type: "friendship",
    directed: false,
    intensity: 3,
    sentiment: "positive",
    label: "Protection",
    description:
      "Elara prend Simon sous son aile. Il devient son ancre dans la fuite.",
    sinceNode: null,
    untilNode: null,
  });
  ok("4 relations entre personnages");

  // --- Lieux ---------------------------------------------------------------
  const aethelId = await createLocation(project.id, {
    name: "Aethel",
    type: "metropolis",
    parentId: null,
    status: "existing",
    fields: {
      aliases: "La Ville aux Mille Voix",
      description:
        "Cité-état stratifiée où les souvenirs circulent comme une monnaie. Les quartiers hauts sont propres et lumineux ; les bas-fonds sont noyés et oubliés.",
      population: "Environ 3 millions d'habitants",
      government: "Le Consortium of Memory (oligarchie)",
      climate: "Brumeux toute l'année, pluies acides au printemps",
      terrain: "Collines, un fleuve souterrain",
      atmosphere:
        "Bourdonnement des éclats, néons sales, silence des quartiers hauts.",
      history:
        "Fondée il y a deux siècles par des savants fuyant un empire en guerre, Aethel a bâti sa richesse sur l'extraction et le commerce des mémoires.",
      economy: "Extraction, indexation et redistribution des mémoires.",
      languages: JSON.stringify(["Aethélien", "Ancien impérial"]),
      currency: "Éclat (unité monétaire)",
      motto: "« Se souvenir, c'est posséder »",
      notes: "Cité à trois niveaux : hauts, moyens, noyés.",
      colorPalette: JSON.stringify(["#1f3a5f", "#6b7a8f", "#c9d6df"]),
    },
  });

  const archiveId = await createLocation(project.id, {
    name: "Le Grand Archive",
    type: "library",
    parentId: aethelId,
    status: "existing",
    fields: {
      description:
        "Tour de basalte de 300 mètres, où des millions d'éclats sont rangés dans des rayonnages pressurisés. Aucun bruit. Aucune poussière. Elara y a passé dix ans.",
      purpose:
        "Stockage et indexation des mémoires officielles du Consortium.",
      architect: "Maître Orvel",
      builtOn: "Il y a 180 ans",
      accessSecurity:
        "Accès réservé aux archivistes assermentés. Trois contrôles d'identité.",
      collections:
        "Trois millions d'éclats, dont les mémoires personnelles de chaque citoyen.",
      legends:
        "On dit que les étages inférieurs contiennent des mémoires que le Consortium lui-même a oubliées.",
      notes: "Elara y travaille ; c'est aussi le centre du pouvoir.",
      colorPalette: JSON.stringify(["#2b2b2b", "#6b7a8f", "#e0e0e0"]),
    },
  });

  const driftId = await createLocation(project.id, {
    name: "Le Driftmarket",
    type: "market",
    parentId: aethelId,
    status: "existing",
    fields: {
      description:
        "Marché illégal construit sur les toits de vieux immeubles. On y trouve des éclats de mémoire, des plongeurs, des faux souvenirs.",
      atmosphere: "Néons, cris, odeurs de vapeur et de peur.",
      dangers:
        "Vols, arnaques, plongées sauvages qui laissent des cerveaux vides.",
      goods: JSON.stringify([
        "Éclats volés",
        "Faux souvenirs",
        "Guides de plongée",
        "Mémoires de contrebande",
      ]),
      marketDays: "Chaque nuit, sauf les nuits de pluie acide",
      notes:
        "Lieu de rencontre entre Elara et Lyra. Kaelen y tend un piège à Elara.",
      colorPalette: JSON.stringify(["#8b0000", "#e2599c", "#2b2b2b"]),
    },
  });

  const sunkenId = await createLocation(project.id, {
    name: "Le Sunken Quarter",
    type: "district",
    parentId: aethelId,
    status: "abandoned",
    fields: {
      description:
        "Ancien quartier industriel inondé lors du « Grand Oubli ». Aujourd'hui, seuls les plus pauvres et les plus dangereux y vivent.",
      history:
        "Inondé il y a 60 ans, officiellement à cause d'un séisme. En réalité, pour noyer une archive rebelle.",
      dangers: "Eaux noires, structures instables, plongeurs fous.",
      legends:
        "Les mémoires des victimes y flotteraient encore sous forme d'éclats.",
      inhabitants: "Les Noyés, une communauté d'anciens plongeurs.",
      accessConditions:
        "Seuls les plongeurs expérimentés connaissent les passages.",
      notes:
        "Le repaire de Lyra. Elara y plonge dans le souvenir de sa mère.",
      colorPalette: JSON.stringify(["#0d1f2d", "#3b6b8c", "#5d7a8f"]),
    },
  });

  // Lien personnage ↔ lieux
  await api.createCharacterLocation(project.id, {
    characterId: elaraId,
    locationId: archiveId,
    type: "works",
    label: "Archiviste",
    description: "Elle y passe ses journées.",
    sinceNode: null,
    untilNode: null,
  });
  await api.createCharacterLocation(project.id, {
    characterId: lyraId,
    locationId: sunkenId,
    type: "lives",
    label: "Repaire",
    description: "Lyra vit dans une ancienne usine noyée du quartier.",
    sinceNode: null,
    untilNode: null,
  });
  ok("4 lieux créés + liens personnages ↔ lieux");

  // --- Structure du roman -------------------------------------------------
  const part1Content =
    "<p>Le Grand Archive ne faisait aucun bruit. C'était la première chose qu'Elara avait apprise, dix ans plus tôt : ici, le silence était une loi. Les éclats de mémoire, rangés dans leurs alvéoles pressurisés, ne pouvaient pas vibrer. Ils ne pouvaient pas parler. Ils ne pouvaient pas mentir.</p><p>Et pourtant, ce matin-là, elle entendit un chant.</p><p>Ce n'était pas un chant audible — les souvenirs ne font pas de bruit. C'était une vibration dans la paume, un frémissement qui remontait le long du poignet, comme une corde de harpe qu'on effleure. Elara retira l'éclat de sa pince de cérémonie, et le posa sur le tissu noir de son établi.</p><p>L'éclat était vieux. Fêlé sur un bord. Son étiquette indiquait : « Vance, M. — Accident de mémoire, 20 ans révolus ».</p><p>Elara sentit le sol se dérober sous elle.</p><p>Parce que sa mère n'avait pas de mémoire dans l'Archive. Elle avait vérifié. Elle avait vérifié chaque jour, depuis dix ans.</p>";

  const chapter2Content =
    "<p>Le directeur adjoint Marlow était un homme doux, aux mains propres, qui n'avait jamais touché un éclat de sa vie. Il écouta Elara jusqu'au bout, sans l'interrompre, puis il posa ses deux mains à plat sur son bureau.</p><p>— Elara. Combien d'éclats avez-vous manipulés aujourd'hui ?</p><p>— Trois cent douze, monsieur.</p><p>— Et combien de fois, dans votre carrière, avez-vous eu des hallucinations ?</p><p>C'était une question piège. Elara savait ce qu'on répondait. Elle le dit quand même :</p><p>— Jamais.</p><p>— Alors il faut en conclure que c'est la première fois. Le Dr. Kessler vous recevra demain matin.</p><p>Le Dr. Kessler était le médecin du Consortium. Elara savait ce qu'il prescrivait : un petit effacement, tout simple, des mémoires « perturbatrices ». Un sourire, une main sur l'épaule. Rentrez chez vous.</p><p>Ce soir-là, elle sortit son carnet de cuir noir. Elle y écrivit, pour la première fois en dix ans : Ne pas oublier.</p>";

  const chapter4Content =
    "<p>Elle avait mis sa capuche et sa peur. Les deux l'aidaient à passer inaperçue.</p><p>Le Driftmarket s'étendait sur les toits de trois immeubles du quartier bas, reliés par des passerelles de métal. Des lanternes rouges pendaient au-dessus des étals. On y vendait des éclats, des plongeurs, des faux souvenirs de vacances que des gens riches achetaient pour se sentir vivants.</p><p>— T'as l'air perdue, petite.</p><p>L'homme qui parlait était vieux, assis sur une caisse, une canne entre les jambes. Une prothèse de verre à l'œil gauche. Elara sut immédiatement qui c'était : Lyra. La plongeuse qui avait survécu à ce que personne ne survivait.</p><p>— J'ai besoin de plonger, dit Elara.</p><p>— Dans quoi ?</p><p>— Dans un souvenir qui n'existe pas.</p><p>Lyra rit. Un rire rauque, sans joie. — Ma petite, ça fait soixante ans que je plonge dans ce qui n'existe pas. Assieds-toi. Tu vas me raconter.</p>";

  const chapter8Content =
    "<p>Le souvenir était froid. C'était la première chose qu'Elara nota, avec le recul : sa mère ne se souvenait pas de la chaleur. Elle se souvenait du froid, de l'eau noire, et de la voix de Kaelen qui disait : Pardon.</p><p>Elara remonta à la surface avec un cri qu'aucun plongeur n'aurait dû pousser. Lyra la tenait par les épaules, hurlait son nom. Mais Elara n'entendait rien.</p><p>Elle venait de voir sa mère supplier un homme qu'elle connaissait — un jeune agent aux gants noirs — de l'épargner. Et l'homme, dans le souvenir, avait dit oui. Puis il avait effacé sa mère.</p><p>Kaelen avait tué sa mère. Mais Kaelen, ce jour-là, avait aussi essayé de la sauver.</p>";

  const chapter12Content =
    "<p>Elle brancha l'éclat sur le réseau d'irrigation mémorielle — le système qui alimentait chaque foyer en souvenirs publics. Kaelen la regardait, immobile, ses gants noirs aux mains.</p><p>— Si tu fais ça, dit-il doucement, trois millions de personnes se souviendront en même temps de ce que le Consortium a fait. Le chaos.</p><p>— Le chaos, dit Elara, ou la vérité. Vous avez choisi pour moi. Maintenant, c'est mon tour.</p><p>Elle appuya sur le bouton.</p><p>Et dans les tours comme dans les bas-fonds, dans les palais comme dans les eaux noyées, Aethel se mit à se souvenir.</p>";

  const structure = await buildStructure(project.id, [
    {
      title: "Partie I — L'Archiviste",
      summary: "Elara, sa vie réglée, et l'éclat impossible.",
      children: [
        {
          title: "Chapitre 1 — L'éclat de trop",
          summary:
            "Elara trouve un éclat qui n'appartient pas à l'Archive et décide de vérifier.",
          content: part1Content,
          wordGoal: 3500,
          writingStatus: "corrected",
        },
        {
          title: "Chapitre 2 — Le carnet noir",
          summary:
            "Elara confronte ses supérieurs, qui lui ordonnent d'oublier. Elle commence à douter.",
          content: chapter2Content,
          wordGoal: 3500,
          writingStatus: "proofread",
        },
        {
          title: "Chapitre 3 — La nuit blanche",
          summary:
            "Elara décide de fuir. Elle prépare son départ, détruit ses traces.",
          content:
            "<p>Elle passa la nuit à brûler ses papiers. Pas les vrais — les copies. Les vrais étaient déjà dans son carnet noir.</p><p>À l'aube, elle sortit par la porte de service du Grand Archive, la capuche sur la tête, l'éclat dans sa poche intérieure. Elle ne se retourna pas.</p>",
          wordGoal: 3500,
          writingStatus: "draft",
        },
      ],
    },
    {
      title: "Partie II — La Descente",
      summary: "Elara fuit dans les bas-fonds d'Aethel.",
      children: [
        {
          title: "Chapitre 4 — Le Driftmarket",
          summary:
            "Elara descend au marché noir pour trouver un plongeur.",
          content: chapter4Content,
          wordGoal: 4000,
          writingStatus: "revision",
        },
        {
          title: "Chapitre 5 — La plongeuse",
          summary:
            "Lyra accepte d'aider Elara, mais à ses conditions. Elle lui raconte son passé.",
          content:
            "<p>Lyra habitait une ancienne usine du Sunken Quarter, dont le toit avait été remplacé par une verrière brisée. L'eau montait jusqu'aux fenêtres du premier étage. Elle vivait au deuxième.</p><p>— Tu veux plonger dans l'éclat de ta mère, dit-elle en remplissant une cuve de solution saline. Tu sais ce que ça veut dire ?</p><p>— Non.</p><p>— Ça veut dire que tu vas vivre sa mort. Pas la voir. La vivre. Tu vas sentir ce qu'elle a senti.</p><p>Elara retira sa chemise. — Je suis prête.</p><p>— Non, dit Lyra. Mais tu vas le faire quand même.</p>",
          wordGoal: 4000,
          writingStatus: "draft",
        },
        {
          title: "Chapitre 6 — Le piège",
          summary:
            "Kaelen retrouve Elara au Driftmarket. Elle s'échappe de justesse.",
          content:
            "<p>Kaelen était assis à une table du Driftmarket, un verre de vapeur à la main. Il ne la regarda pas quand elle entra. Il dit simplement :</p><p>— Bonsoir, Elara.</p><p>Elle aurait pu courir. Elle savait qu'il l'aurait laissée partir — c'était un jeu pour lui. Alors elle s'assit en face de lui.</p><p>— Comment m'avez-vous trouvée ?</p><p>— Votre mère avait un tic. Elle se grattait le poignet gauche quand elle mentait. Vous avez le même.</p>",
          wordGoal: 4000,
          writingStatus: "todo",
        },
      ],
    },
    {
      title: "Partie III — Les Échos",
      summary: "La vérité sur la mère d'Elara émerge.",
      children: [
        {
          title: "Chapitre 7 — Simon",
          summary:
            "Elara rencontre Simon, un enfant qui a trouvé un éclat. Il sait des choses.",
          content:
            "<p>Simon ne ressemblait à rien de ce qu'Elara avait connu. Il était sale, maigre, et il parlait aux éclats comme à des oiseaux.</p><p>— Celui-là, dit-il en désignant un éclat fêlé dans sa paume, il me dit des choses.</p><p>— Quelles choses ?</p><p>— Des choses que personne ne devrait savoir. Sur ta mère, par exemple.</p><p>Elara s'accroupit. — Qu'est-ce que tu sais sur ma mère ?</p><p>— Qu'elle n'est pas morte comme on le dit.</p>",
          wordGoal: 4500,
          writingStatus: "todo",
        },
        {
          title: "Chapitre 8 — La chambre noyée",
          summary: "Elara plonge dans le souvenir de sa mère.",
          content: chapter8Content,
          wordGoal: 4500,
          writingStatus: "draft",
        },
        {
          title: "Chapitre 9 — La vérité de Lyra",
          summary:
            "Lyra avoue son rôle dans la mort de la mère d'Elara.",
          content:
            "<p>— C'est moi qui ai vendu sa mémoire au Consortium, dit Lyra.</p><p>Elara ne bougea pas.</p><p>— Je ne savais pas ce qu'elle contenait. Je ne savais pas que Kaelen était chargé de l'effacer. Je ne savais pas que ta mère était ta mère.</p><p>— Vous mentez.</p><p>— Non. Pour une fois.</p>",
          wordGoal: 4500,
          writingStatus: "todo",
        },
      ],
    },
    {
      title: "Partie IV — L'Effondrement",
      summary: "La confrontation finale avec le Consortium.",
      children: [
        {
          title: "Chapitre 10 — Le retour",
          summary:
            "Elara remonte dans les hauteurs pour confronter Kaelen.",
          content:
            "<p>La tour du Consortium se dressait au-dessus de la ville comme un reproche. Elara n'y était pas entrée depuis dix ans. Elle ne se souvenait pas des marches. Elle ne se souvenait pas des portes.</p><p>Mais elle se souvenait de la voix de Kaelen, dans le souvenir de sa mère. Pardon.</p>",
          wordGoal: 5000,
          writingStatus: "todo",
        },
        {
          title: "Chapitre 11 — L'offre",
          summary:
            "Kaelen propose à Elara un marché : la vérité contre le silence.",
          content:
            "<p>— Vous voulez la vérité, dit Kaelen. Je peux vous la donner. Toute la vérité. Mais vous devrez oublier ce que vous avez vu.</p><p>— Non.</p><p>— Alors vous ne saurez jamais.</p><p>— Je saurai. Vous n'avez pas idée de ce que je suis prête à faire.</p>",
          wordGoal: 5000,
          writingStatus: "todo",
        },
        {
          title: "Chapitre 12 — Le chant de l'Archive",
          summary: "Elara diffuse la mémoire volée à toute la ville.",
          content: chapter12Content,
          wordGoal: 5000,
          writingStatus: "draft",
        },
      ],
    },
  ]);
  ok(
    `Structure créée : 4 parties, 12 chapitres, ${structure.size} nœuds au total`,
  );

  // --- Narration sur les scènes --------------------------------------------
  const scenes = [...structure.values()].filter((n) => n.level === 2);
  for (const [index, scene] of scenes.entries()) {
    const alternating = index % 3 === 0;
    await api.setStructureNodeNovel(project.id, scene.id, {
      wordGoal: null,
      writingStatus: null,
      narrativePerson: alternating ? "third" : "first",
      narrativeTense: "past",
    });
  }
  ok(`${scenes.length} scènes configurées (narration)`);

  // --- Objectif global du manuscrit ---------------------------------------
  await api.setManuscriptGoal(project.id, 90_000);
  ok("Objectif global du roman : 90 000 mots");

  // --- Trame (Plot Board) --------------------------------------------------
  await seedPlot(
    project.id,
    [
      {
        lane: "main",
        row: 0,
        title: "Elara trouve l'éclat impossible",
        note: "Pivot d'ouverture. Le monde réglé d'Elara se fissure.",
        pivot: true,
        status: "written",
        tags: ["Inciting incident", "Turning Point"],
        characterIds: [elaraId],
        povId: elaraId,
        locationId: archiveId,
        nodeId: structure.get("2:Chapitre 1 — L'éclat de trop")?.id ?? null,
        words: 280,
      },
      {
        lane: "main",
        row: 1,
        title: "Confrontation avec Marlow",
        note: "Elara refuse l'effacement. Elle prend la fuite.",
        pivot: false,
        status: "written",
        characterIds: [elaraId],
        povId: elaraId,
        locationId: archiveId,
        nodeId: structure.get("2:Chapitre 2 — Le carnet noir")?.id ?? null,
        words: 180,
      },
      {
        lane: "main",
        row: 3,
        title: "Rencontre avec Lyra",
        note: "La descente au Driftmarket. Lyra accepte de l'aider.",
        pivot: false,
        status: "written",
        characterIds: [elaraId, lyraId],
        povId: elaraId,
        locationId: driftId,
        nodeId: structure.get("2:Chapitre 4 — Le Driftmarket")?.id ?? null,
        words: 200,
      },
      {
        lane: "main",
        row: 5,
        title: "Rencontre avec Simon",
        note: "L'enfant qui sait. Nouveau fil narratif.",
        pivot: false,
        status: "draft",
        tags: ["Subplot"],
        characterIds: [elaraId, simonId],
        povId: elaraId,
        locationId: sunkenId,
        nodeId: structure.get("2:Chapitre 7 — Simon")?.id ?? null,
        words: 0,
      },
      {
        lane: "main",
        row: 7,
        title: "La chambre noyée",
        note: "Elara plonge dans la mémoire de sa mère. Midpoint.",
        pivot: true,
        status: "draft",
        tags: ["Revelation", "Midpoint"],
        characterIds: [elaraId, lyraId],
        povId: elaraId,
        locationId: sunkenId,
        nodeId: structure.get("2:Chapitre 8 — La chambre noyée")?.id ?? null,
        words: 230,
      },
      {
        lane: "main",
        row: 9,
        title: "La vérité de Lyra",
        note: "La trahison. Elara est seule.",
        pivot: true,
        status: "idea",
        tags: ["All is lost"],
        characterIds: [elaraId, lyraId],
        povId: elaraId,
        locationId: sunkenId,
        nodeId: structure.get("2:Chapitre 9 — La vérité de Lyra")?.id ?? null,
        words: 0,
      },
      {
        lane: "main",
        row: 11,
        title: "L'offre de Kaelen",
        note: "Faux espoir. Elara refuse.",
        pivot: false,
        status: "idea",
        characterIds: [elaraId, kaelId],
        povId: elaraId,
        locationId: archiveId,
        nodeId: structure.get("2:Chapitre 11 — L'offre")?.id ?? null,
        words: 0,
      },
      {
        lane: "main",
        row: 12,
        title: "Le chant de l'Archive",
        note: "Climax. Elara diffuse la vérité.",
        pivot: false,
        status: "idea",
        tags: ["Climax"],
        characterIds: [elaraId, kaelId],
        povId: elaraId,
        locationId: archiveId,
        nodeId:
          structure.get("2:Chapitre 12 — Le chant de l'Archive")?.id ?? null,
        words: 140,
      },
      {
        lane: "sub",
        row: 0,
        title: "Kaelen reçoit l'ordre d'effacer la mère d'Elara",
        note: "Passé narratif. L'origine du crime.",
        pivot: false,
        status: "written",
        characterIds: [kaelId],
        povId: kaelId,
        locationId: archiveId,
        words: 150,
      },
      {
        lane: "sub",
        row: 2,
        title: "Kaelen découvre qu'Elara fouille",
        note: "Kaelen comprend que son passé remonte.",
        pivot: false,
        status: "written",
        characterIds: [kaelId],
        povId: kaelId,
        locationId: archiveId,
        words: 120,
      },
      {
        lane: "sub",
        row: 5,
        title: "Kaelen retrouve Lyra",
        note: "Retrouvailles tendues. Elle sait ce qu'il a fait.",
        pivot: false,
        status: "draft",
        characterIds: [kaelId, lyraId],
        povId: kaelId,
        locationId: sunkenId,
        words: 0,
      },
      {
        lane: "sub",
        row: 8,
        title: "Kaelen découvre le secret de l'éclat",
        note: "Kaelen comprend qu'il a effacé la mémoire d'une innocente.",
        pivot: true,
        status: "idea",
        characterIds: [kaelId],
        povId: kaelId,
        words: 0,
      },
      {
        lane: "third",
        row: 4,
        title: "Simon trouve l'éclat",
        note: "Le fil secondaire de Simon commence.",
        pivot: false,
        status: "draft",
        tags: ["Subplot"],
        characterIds: [simonId],
        povId: simonId,
        locationId: sunkenId,
        words: 100,
      },
      {
        lane: "third",
        row: 10,
        title: "Simon est kidnappé",
        note: "Le Consortium enlève Simon pour récupérer l'éclat.",
        pivot: false,
        status: "idea",
        characterIds: [simonId, kaelId],
        povId: simonId,
        locationId: archiveId,
        words: 0,
      },
    ],
    {
      subLaneName: "Kaelen (antagoniste)",
      thirdLaneName: "Simon (sous-intrigue)",
      tension: { 0: 2, 3: 4, 5: 6, 7: 8, 9: 9, 12: 10 },
      acts: {
        0: "Acte I — Mise en place",
        3: "Acte II — Confrontation",
        9: "Acte III — Révélation",
        12: "Acte IV — Résolution",
      },
      rowLabels: {
        0: "L'éclat impossible",
        3: "La rencontre",
        5: "L'enfant",
        7: "La plongée",
        9: "La trahison",
        12: "La diffusion",
      },
    },
  );
  ok("Trame créée : 3 lanes, 15 événements, tension, actes, labels");

  // --- Notes ---------------------------------------------------------------
  const bibleFolder = await createFolder(project.id, "Bible de l'univers");
  const researchFolder = await createFolder(project.id, "Recherches");
  const ideasFolder = await createFolder(project.id, "Idées et scènes coupées");

  await createNote(
    project.id,
    "Le Consortium of Memory",
    [
      "Le Consortium est une oligarchie de cinq familles qui contrôle l'extraction, l'indexation et la redistribution des mémoires officielles.",
      "Extraction : par des plongeurs formés, sous contrôle médical.",
      "Indexation : au Grand Archive, par les archivistes assermentés.",
      "Redistribution : via le réseau d'irrigation mémorielle dans chaque foyer.",
      "Crimes : effacement, vol, plongée sauvage. Le Dr. Kessler efface les mémoires « perturbatrices ».",
      "Le Dr. Kessler est le médecin officiel. Il signe tous les effacements.",
      "Le directeur adjoint Marlow est un homme doux, mais complice.",
    ],
    bibleFolder,
  );

  await createNote(
    project.id,
    "Science des souvenirs",
    [
      "Notes de recherche pour crédibiliser la plongée mémorielle.",
      "Les souvenirs se stockent sous forme d'éclats de verre cristallisé.",
      "Un éclat viable fait 2 à 5 cm, se manipule avec des gants isolants.",
      "La plongée se fait en immersion dans une cuve de solution saline.",
      "Les échos sont des fragments résiduels laissés par un souvenir mal effacé.",
      "À vérifier : la douleur de la plongée, la durée, les risques cérébraux.",
      "Le cerveau du plongeur peut être endommagé s'il plonge trop souvent.",
    ],
    researchFolder,
  );

  await createNote(
    project.id,
    "Scènes coupées",
    [
      "Scènes envisagées mais abandonnées.",
      "Un chapitre du point de vue de Simon (l'enfant).",
      "Une conversation entre Lyra et Kaelen dans une chambre d'hôtel.",
      "Un flashback sur la mort de la mère d'Elara (du point de vue de la mère).",
      "À recycler peut-être dans une suite ou un spin-off.",
    ],
    ideasFolder,
  );

  await createNote(
    project.id,
    "Géographie d'Aethel",
    [
      "Aethel est une cité-état stratifiée en trois niveaux.",
      "Niveau haut : le Grand Archive, le palais du Consortium, les jardins suspendus.",
      "Niveau moyen : les quartiers résidentiels, les marchés officiels, les écoles.",
      "Niveau bas : le Driftmarket, le Sunken Quarter, les ruelles oubliées.",
      "Le fleuve souterrain relie le Sunken Quarter au Grand Archive.",
    ],
    bibleFolder,
  );
  ok("4 notes dans 3 dossiers");

  log(`Projet Roman terminé : « ${project.name} » (${project.id})`);
}

// ===========================================================================
// ██  PROJET 2 — MANGA : « Kurokumo no Tsuyoshi »
// ===========================================================================

async function seedManga(): Promise<void> {
  title("MANGA — Kurokumo no Tsuyoshi");

  await assertNotExists("Kurokumo no Tsuyoshi");

  const project = await api.createProject({
    name: "Kurokumo no Tsuyoshi",
    description:
      "Kurokumo no Tsuyoshi (La Force du Nuage Noir). Un shonen de sabre et de fantasy : Kenji, dernier héritier d'un clan déchu, doit maîtriser un art martial maudit pour se venger du clan Mizo. Mais la malédiction est peut-être la clé du salut du monde.",
    projectType: "manga",
  });
  ok(`Projet créé (${project.id})`);

  // --- Synopsis -----------------------------------------------------------
  await api.updateSynopsis(project.id, {
    content:
      "<p>Dans un Japon fantasmé où les clans de sabreurs se disputent le contrôle des provinces, Kenji est le dernier survivant d'une famille massacrée par le clan Mizo. Il est recueilli par un vieux maître ermite, qui lui enseigne le style Kurokumo — un art martial interdit qui puise dans les émotions négatives du pratiquant.</p><p>Kenji doit apprendre à maîtriser sa haine avant qu'elle ne le consume, tout en découvrant que le style Kurokumo cache un secret capable de renverser l'ordre du monde.</p>",
    genres: ["Fantasy", "Action"],
    subgenres: ["Shonen", "Wuxia"],
    tone: ["Épique", "Sombre par moments", "Déterminé"],
  });
  ok("Synopsis, genres, sous-genres et ton");

  // --- Structure manga -----------------------------------------------------
  await api.setStructureTemplate(project.id, "manga");
  ok("Modèle de structure manga appliqué (Tome / Chapitre / Page)");

  // --- Personnages --------------------------------------------------------
  const kenjiId = await createCharacter(project.id, {
    firstName: "Kenji",
    lastName: "Kuroda",
    role: "main",
    status: "alive",
    fields: {
      age: "16 ans",
      gender: "male",
      occupation: "Disciple du maître Kuro",
      description:
        "Garçon sec, nerveux, cicatrices sur les avant-bras. Toujours vêtu de haillons sombres.",
      mainGoal: "Venger sa famille en maîtrisant le style Kurokumo.",
      distinctiveTrait:
        "Un bandeau noir sur les yeux pendant l'entraînement, pour apprendre à voir sans regarder.",
      height: "1,70 m",
      build: "slim",
      eyes: "Noirs, intenses, presque toujours baissés",
      hair: "Noirs, en bataille",
      distinguishingMarks: "Cicatrice en croix sur le bras droit.",
      voice: "Jeune, encore instable, qui se brise quand il crie.",
      clothingStyle: "Kimono usé, ceinture noire, sandales de bois.",
      mainOutfit: "Kimono déchiré, bandeau noir, sabre en bois",
      accessories: "Bandeau noir, sabre en bois",
      colorPalette: JSON.stringify(["#0d0d0d", "#3b3b3b", "#e63946"]),
      psychology:
        "Kenji est habité par une rage froide qui le terrifie. Il craint plus que tout de devenir comme ceux qu'il hait.",
      traits: JSON.stringify(["Acharné", "Solitaire", "Protecteur"]),
      strengths: JSON.stringify(["Vitesse", "Capacité d'apprentissage"]),
      flaws: JSON.stringify(["Colérique", "Impitoyable en combat"]),
      motivations: "Sa sœur, dont il ignore si elle est vivante.",
      deepDesire: "Être digne de son père.",
      fears: "Devenir un monstre comme son père l'était.",
      weaknesses: "La colère.",
      coreValues: "L'honneur de la famille Kuroda",
      beliefs: "La force sans maîtrise est une malédiction.",
      formativeEvent: "Le massacre de son village à 14 ans.",
      secret: "Il a déjà tué quelqu'un, à 14 ans.",
      innerConflict:
        "La rage le rend fort, mais la rage le détruit. Il doit choisir entre puissance et humanité.",
      adversityResponse: "Il frappe sans réfléchir, puis il regrette.",
      plannedArc:
        "Du garçon qui veut se venger à l'homme qui comprend que la vengeance est un piège du monde ancien.",
    },
  });
  ok("Kenji Kuroda créé");

  const shinjiroId = await createCharacter(project.id, {
    firstName: "Shinjiro",
    lastName: "Mizo",
    role: "antagonist",
    status: "alive",
    fields: {
      age: "45 ans",
      gender: "male",
      occupation: "Chef du clan Mizo, maître du style Mikagami",
      description:
        "Grand, élégant, kimono blanc immaculé. Il ne se bat jamais sans sourire.",
      mainGoal: "Unifier toutes les provinces sous la bannière du clan Mizo.",
      distinctiveTrait:
        "Il ne se bat qu'avec un sabre en bois, même contre des lames réelles.",
      height: "1,85 m",
      build: "athletic",
      eyes: "Noirs, sans fond",
      hair: "Noirs, longs, attachés",
      voice: "Douce, posée, presque aimable.",
      clothingStyle: "Kimono blanc, ceinture d'or, sabre en bois dans le dos.",
      mainOutfit: "Kimono blanc, ceinture d'or",
      accessories: "Sabre en bois",
      colorPalette: JSON.stringify(["#ffffff", "#c0a060", "#1a1a1a"]),
      psychology:
        "Shinjiro croit à une paix imposée par la domination. Il a une admiration sincère pour les maîtres des autres styles, mais cela ne l'empêche pas de les massacrer.",
      traits: JSON.stringify(["Souriant", "Impitoyable", "Raffiné"]),
      strengths: JSON.stringify(["Stratège", "Charismatique"]),
      flaws: JSON.stringify([
        "Mégalomane",
        "Incapable de concevoir la défaite",
      ]),
      motivations: "Unifier le Japon par la force.",
      fears: "La perte de contrôle.",
      secret: "Il craint que le Kurokumo ne soit plus fort que le Mikagami.",
      plannedArc:
        "De l'antagoniste parfait au révélateur que la vraie menace vient d'ailleurs.",
    },
  });
  ok("Shinjiro Mizo créé");

  const kuroId = await createCharacter(project.id, {
    firstName: "Kuro",
    lastName: "",
    role: "mentor",
    status: "alive",
    fields: {
      age: "Inconnu (probablement plus de 100 ans)",
      gender: "male",
      occupation: "Dernier maître vivant du style Kurokumo",
      description:
        "Vieil homme minuscule, chauve, les yeux couleur nuage. Marche avec un bâton plus haut que lui.",
      mainGoal:
        "Trouver un héritier digne de recevoir le Kurokumo avant sa mort.",
      distinctiveTrait:
        "Il parle en proverbes qui n'ont aucun sens — jusqu'à ce qu'ils en aient.",
      height: "1,40 m",
      build: "slim",
      eyes: "Gris nuage",
      hair: "Chauve",
      voice: "Voix cassée, mais qui porte.",
      clothingStyle: "Robe de moine, sandales",
      mainOutfit: "Robe grise, bâton de marche",
      accessories: "Bâton de marche",
      colorPalette: JSON.stringify(["#6b7a8f", "#e0e0e0", "#2b2b2b"]),
      psychology:
        "Kuro a renoncé à tout — sauf à la transmission. Il n'attend rien de Kenji, sinon qu'il apprenne à ne pas devenir son ombre.",
      traits: JSON.stringify(["Zen", "Taquin", "Insondable"]),
      strengths: JSON.stringify(["Expérience", "Maîtrise parfaite du Kurokumo"]),
      flaws: JSON.stringify(["N'explique jamais rien", "Sourit quand tout va mal"]),
      motivations: "Transmettre avant de mourir.",
      fears: "Que le Kurokumo meure avec lui.",
      secret: "Il est le dernier disciple du fondateur du Kurokumo.",
      plannedArc:
        "Du maître excentrique au sacrifice final qui révèle la vérité du Kurokumo.",
    },
  });
  ok("Kuro créé");

  const yukiId = await createCharacter(project.id, {
    firstName: "Yuki",
    lastName: "Kuroda",
    role: "secondary",
    status: "missing",
    fields: {
      age: "19 ans",
      gender: "female",
      occupation: "Sœur de Kenji, disparue depuis le massacre",
      description:
        "Grande, mince, sabre à la hanche. On ne sait pas si elle est vivante ou morte.",
      mainGoal: "Survivre. (POV : elle est prisonnière du clan Mizo.)",
      distinctiveTrait: "Un bandeau rouge dans ses cheveux noirs.",
      height: "1,68 m",
      build: "athletic",
      eyes: "Noirs, comme Kenji",
      hair: "Noirs, longs, attachés d'un bandeau rouge",
      distinguishingMarks: "Cicatrice sur la joue gauche.",
      voice: "Grave et posée, comme celle de son père.",
      clothingStyle: "Kimono sombre, sabre court.",
      mainOutfit: "Kimono sombre, bandeau rouge",
      accessories: "Sabre court du clan Kuroda",
      colorPalette: JSON.stringify(["#8b0000", "#2b2b2b", "#e0e0e0"]),
      psychology:
        "Yuki a survécu en devenant plus froide que ses geôliers. Elle prépare sa vengeance depuis deux ans.",
      traits: JSON.stringify(["Froide", "Patiente", "Déterminée"]),
      strengths: JSON.stringify(["Ruse", "Sabre court"]),
      flaws: JSON.stringify(["Incapable de pardonner", "Ne se méfie que des hommes"]),
      motivations: "Retrouver Kenji.",
      fears: "Que Kenji soit mort.",
      secret: "Elle est enceinte d'un Mizo, et elle le cache.",
      innerConflict: "Venger sa famille ou sauver son enfant.",
      plannedArc:
        "De l'ombre silencieuse à la révélatrice de la vérité sur le Kurokumo.",
    },
  });
  ok("Yuki Kuroda créée (sœur de Kenji)");

  // --- Relations -----------------------------------------------------------
  await createRelation(project.id, {
    sourceId: kenjiId,
    targetId: shinjiroId,
    type: "enmity",
    directed: true,
    intensity: 5,
    sentiment: "negative",
    label: "Vengeance",
    description:
      "Mizo a ordonné le massacre du clan de Kenji. Kenji veut le tuer de ses mains.",
    sinceNode: null,
    untilNode: null,
  });
  await createRelation(project.id, {
    sourceId: kenjiId,
    targetId: kuroId,
    type: "mentor",
    directed: true,
    intensity: 4,
    sentiment: "positive",
    label: "Élève",
    description:
      "Kuro enseigne à Kenji le Kurokumo, mais aussi la patience.",
    sinceNode: null,
    untilNode: null,
  });
  await createRelation(project.id, {
    sourceId: kenjiId,
    targetId: yukiId,
    type: "family",
    directed: false,
    intensity: 5,
    sentiment: "positive",
    label: "Frère et sœur",
    description:
      "Kenji croit Yuki morte. Yuki le croit mort. Leur retrouvaille sera un tournant.",
    sinceNode: null,
    untilNode: null,
  });
  await createRelation(project.id, {
    sourceId: shinjiroId,
    targetId: yukiId,
    type: "rivalry",
    directed: true,
    intensity: 3,
    sentiment: "negative",
    label: "Prisonnière",
    description:
      "Shinjiro retient Yuki prisonnière, fasciné par le clan Kuroda.",
    sinceNode: null,
    untilNode: null,
  });
  ok("4 relations créées");

  // --- Lieux ---------------------------------------------------------------
  await createLocation(project.id, {
    name: "Le Sanctuaire du Nuage Noir",
    type: "temple",
    parentId: null,
    status: "existing",
    fields: {
      aliases: "Le Temple de la Brume",
      description:
        "Temple abandonné au sommet d'une montagne, enveloppé de brume permanente. C'est là que Kuro entraîne Kenji.",
      purpose: "Lieu d'entraînement et sanctuaire du style Kurokumo.",
      architecture: "Bâtiments de bois noir, toits de chaume, un dōjō ouvert à tous les vents.",
      condition: "damaged",
      legends:
        "On dit que les maîtres y ont laissé leurs ombres, qui dansent avec les nuages.",
      atmosphere:
        "Silence, vent, brume. Le seul bruit est celui des sabres en bois.",
      dangers:
        "Chutes, froids extrêmes, et les « ombres » qui ne sont peut-être pas des légendes.",
      colorPalette: JSON.stringify(["#2b2b2b", "#6b7a8f", "#e0e0e0"]),
    },
  });

  await createLocation(project.id, {
    name: "La Citadelle d'Azur",
    type: "palace",
    parentId: null,
    status: "existing",
    fields: {
      aliases: "Le Siège des Mizo",
      description:
        "Capitale du clan Mizo, citadelle aux toits bleus, visible à dix lieues. Le siège du pouvoir du monde actuel.",
      purpose: "Capitale politique et militaire du clan Mizo.",
      residents: "Le seigneur Shinjiro Mizo et sa cour.",
      garrison: "3 000 samouraïs",
      defenses:
        "Trois enceintes, des douves sèches remplies de pieux, une garde de 3 000 hommes.",
      atmosphere:
        "Propreté militaire, silence des courtisans, couloirs interminables.",
      seatOfPower: "Le donjon central, entouré de douves sèches.",
      institutions:
        "Le Conseil des Cinq, qui conseille le seigneur Mizo.",
      history:
        "Bâtie il y a 300 ans par le premier seigneur Mizo, sur les ruines d'un temple Kurokumo.",
      colorPalette: JSON.stringify(["#1f3a8f", "#c0a060", "#e0e0e0"]),
    },
  });

  await createLocation(project.id, {
    name: "Le Village de Kuroda",
    type: "village",
    parentId: null,
    status: "destroyed",
    fields: {
      description:
        "Village natal de Kenji, réduit en cendres par le clan Mizo il y a deux ans.",
      history:
        "Kuroda était un village de sabreurs réputés pour leur style « Lame d'Argent » — un style jugé hérétique par Mizo.",
      condition: "ruined",
      dangers:
        "Terrain instable, souvenirs, et parfois des rōnin qui cherchent les survivants.",
      climate: "Hivers rudes, étés secs",
      colorPalette: JSON.stringify(["#4a4a4a", "#8b0000", "#2b2b2b"]),
    },
  });

  await createLocation(project.id, {
    name: "La Forêt des Murmures",
    type: "forest",
    parentId: null,
    status: "existing",
    fields: {
      description:
        "Forêt dense où Kenji et Yuki ont grandi. Chaque arbre semble murmurer des noms.",
      faunaFlora:
        "Cèdres centenaires, cerfs, renards, et parfois des rōnin cachés.",
      legends:
        "Les esprits des Kuroda y hanteraient la forêt.",
      dangers:
        "Brume épaisse, sentiers qui se ressemblent, ours.",
      colorPalette: JSON.stringify(["#1f3a1f", "#4a6b4a", "#c0a060"]),
    },
  });
  ok("4 lieux créés");

  // --- Structure manga -----------------------------------------------------
  const p1 =
    "<p><em>Page 1.</em></p><p><strong>Case 1.</strong> Plan large. Un village en flammes sous un ciel rouge. La fumée monte vers les étoiles.</p><p><strong>Case 2.</strong> Gros plan. Un sabre ensanglanté planté dans la terre. L'emblème du clan Kuroda luit faiblement.</p><p><strong>Case 3.</strong> Kenji, 14 ans, court dans les rizières. Il trébuche. Il se relève.</p><p><strong>Case 4.</strong> Kenji, en pensée : « Cours. Ne te retourne pas. Cours. »</p><p><em>Page 2.</em></p><p><strong>Case 1.</strong> Plan moyen. Trois samouraïs du clan Mizo, casques ornés d'un croissant de lune, avancent dans les rizières.</p><p><strong>Case 2.</strong> Samouraï 1 : « Il est là. Le gamin du Kuroda. »</p><p><strong>Case 3.</strong> Kenji plonge dans une rivière. La caméra suit son corps sous l'eau.</p><p><strong>Case 4.</strong> Samouraï 2, haussant les épaules : « Laisse-le. Les rivières le ramèneront. Ou les poissons. »</p>";

  const p2 =
    "<p><em>Page 1.</em></p><p><strong>Case 1.</strong> Kenji, à demi-mort de faim, arrive devant un temple en ruine. La brume l'entoure.</p><p><strong>Case 2.</strong> Un vieil homme minuscule balaie le parvis. Il ne lève pas les yeux.</p><p><strong>Case 3.</strong> Kuro : « Tu pues la mort, gamin. Va te laver. »</p><p><strong>Case 4.</strong> Kenji, interloqué : « Vous… vous ne me demandez pas qui je suis ? »</p><p><strong>Case 5.</strong> Kuro, enfin regardant : « Je le sais. Tu es celui qui ne sait pas encore qui il est. »</p>";

  const p3 =
    "<p><em>Page 1.</em></p><p><strong>Case 1.</strong> Kenji, les yeux fermés, un bandeau noir sur le front. Il tient une épée en bois.</p><p><strong>Case 2.</strong> Kuro : « Le Kurokumo ne se bat pas avec le corps. Il se bat avec ce que tu hais le plus. »</p><p><strong>Case 3.</strong> Kenji, soudain, ouvre les yeux. Ils sont devenus noirs — entièrement noirs.</p><p><strong>Case 4.</strong> Il frappe l'air. Un rocher derrière lui se fend en deux.</p><p><strong>Case 5.</strong> Kenji, effrayé : « C'est… c'est quoi ce pouvoir ? »</p><p><strong>Case 6.</strong> Kuro, sombre : « C'est le Kurokumo. Et c'est pour ça qu'il est interdit. »</p>";

  const p4 =
    "<p><em>Page 1.</em></p><p><strong>Case 1.</strong> Plan large. Kenji s'entraîne seul au sommet d'une falaise, face à la brume.</p><p><strong>Case 2.</strong> Kenji, en pensée : « Encore. Encore. Encore. »</p><p><strong>Case 3.</strong> Il frappe. Le vent se lève autour de lui.</p><p><strong>Case 4.</strong> Kuro, derrière lui, les bras croisés : « Tu progresses. Mais tu progresses mal. »</p><p><strong>Case 5.</strong> Kenji, essoufflé : « Pourquoi ? »</p><p><strong>Case 6.</strong> Kuro : « Parce que tu te bats contre tes ennemis. Tu devrais te battre contre toi-même. »</p>";

  const structure = await buildStructure(project.id, [
    {
      title: "Tome 1 — L'Héritier du Nuage Noir",
      summary:
        "Kenji survit au massacre, rencontre Kuro, commence l'apprentissage du Kurokumo.",
      children: [
        {
          title: "Chapitre 1 — Le Survivant",
          summary:
            "Kenji fuit son village en flammes, poursuivi par les hommes de Mizo.",
          content: p1,
          pageGoal: 20,
          scriptStatus: "final",
          narrativeGoal:
            "Présenter Kenji, son traumatisme et sa fuite. Établir l'urgence et le ton du manga.",
          children: [
            {
              title: "Page 1",
              content: p1,
              wordGoal: 200,
              writingStatus: "proofread",
            },
            {
              title: "Page 2",
              content: p1,
              wordGoal: 200,
              writingStatus: "draft",
            },
          ],
        },
        {
          title: "Chapitre 2 — Le Maître Fou",
          summary:
            "Kenji, recueilli par un vieil ermite, découvre le style Kurokumo.",
          content: p2,
          pageGoal: 18,
          scriptStatus: "review",
          narrativeGoal:
            "Introduire Kuro, le mentor excentrique. Poser les bases du Kurokumo et du pouvoir maudit.",
          children: [
            {
              title: "Page 1",
              content: p2,
              wordGoal: 180,
              writingStatus: "revision",
            },
          ],
        },
        {
          title: "Chapitre 3 — Le Premier Sang",
          summary:
            "Kenji, en entraînement, découvre le vrai pouvoir du Kurokumo et sa malédiction.",
          content: p3,
          pageGoal: 20,
          scriptStatus: "progress",
          narrativeGoal:
            "Révéler la puissance et le danger du Kurokumo. Kenji comprend qu'il risque de devenir un monstre.",
          children: [
            {
              title: "Page 1",
              content: p3,
              wordGoal: 220,
              writingStatus: "draft",
            },
          ],
        },
      ],
    },
    {
      title: "Tome 2 — L'Apprentissage du Noir",
      summary:
        "Kenji apprend le Kurokumo, mais la rage le consume. La confrontation avec Mizo approche.",
      children: [
        {
          title: "Chapitre 4 — Le Doute",
          summary:
            "Kenji doute de lui-même. Kuro lui révèle l'histoire du style Kurokumo.",
          content: p4,
          pageGoal: 18,
          scriptStatus: "todo",
          narrativeGoal:
            "Approfondir la psychologie de Kenji. Poser les questions morales du manga.",
          children: [
            {
              title: "Page 1",
              content: p4,
              wordGoal: 180,
              writingStatus: "todo",
            },
          ],
        },
        {
          title: "Chapitre 5 — Le Secret du Nuage",
          summary:
            "Kuro révèle que le Kurokumo n'est pas une malédiction, mais une arme contre les Mizo.",
          content:
            "<p><em>Page 1.</em></p><p><strong>Case 1.</strong> Kuro assis en tailleur, Kenji en face de lui.</p><p><strong>Case 2.</strong> Kuro : « Le Kurokumo a été créé par un homme qui voulait protéger les faibles. »</p><p><strong>Case 3.</strong> Kenji : « Alors pourquoi il est interdit ? »</p><p><strong>Case 4.</strong> Kuro : « Parce que les Mizo ont peur. Le Kurokumo peut annuler leur style. »</p>",
          pageGoal: 20,
          scriptStatus: "todo",
          narrativeGoal:
            "Révéler le secret du Kurokumo. Redéfinir l'objectif de Kenji : non pas se venger, mais sauver.",
          children: [],
        },
      ],
    },
    {
      title: "Tome 3 — La Vengeance",
      summary:
        "Kenji part affronter Mizo. La confrontation finale du premier arc.",
      children: [
        {
          title: "Chapitre 6 — Le Départ",
          summary: "Kenji quitte le sanctuaire pour la Citadelle d'Azur.",
          content:
            "<p><em>Page 1.</em></p><p><strong>Case 1.</strong> Kenji, debout à l'entrée du sanctuaire, regarde la route.</p><p><strong>Case 2.</strong> Kuro, derrière lui : « Tu sais que tu n'es pas prêt. »</p><p><strong>Case 3.</strong> Kenji : « Je le serai. »</p><p><strong>Case 4.</strong> Kuro, souriant tristement : « Alors vas-y. Et ne meurs pas. »</p>",
          pageGoal: 18,
          scriptStatus: "todo",
          narrativeGoal: "Transition. Marquer le passage du Tome 2 au Tome 3.",
          children: [],
        },
        {
          title: "Chapitre 7 — Le Duel",
          summary:
            "Kenji affronte Shinjiro Mizo pour la première fois. Il perd.",
          content:
            "<p><em>Page 1.</em></p><p><strong>Case 1.</strong> Duel au sommet d'une tour. Shinjiro, kimono blanc, sabre en bois.</p><p><strong>Case 2.</strong> Kenji attaque. Shinjiro esquive sans effort.</p><p><strong>Case 3.</strong> Shinjiro : « Tu es fort, gamin. Mais tu es seul. »</p><p><strong>Case 4.</strong> Il frappe. Kenji tombe.</p>",
          pageGoal: 22,
          scriptStatus: "todo",
          narrativeGoal:
            "Première défaite de Kenji. Poser Shinjiro comme un adversaire redoutable.",
          children: [],
        },
      ],
    },
  ]);
  ok(`Structure créée : 3 tomes, 7 chapitres, ${structure.size} nœuds`);

  // --- Script détaillé de la page 1 du chapitre 1 -------------------------
  const page1Node = structure.get("3:Page 1");
  if (page1Node) {
    await api.savePageScript(project.id, page1Node.id, {
      rhythm: "action",
      pageTurn: false,
      pageLabel: "Chapitre 1 — Page 1",
      panels: [
        {
          action: "Un village en flammes sous un ciel rouge.",
          framing: "extremeWide",
          setting: "Rizières, maisons en bois, fumée.",
          artistNotes:
            "Ambiance de fin du monde. Travelling lent vers la droite.",
          rhythm: "action",
          locationId: null,
          moment: "Crépuscule",
          continuity: "",
          characters: [],
          texts: [],
        },
        {
          action: "Un sabre ensanglanté planté dans la terre.",
          framing: "insert",
          setting: "Terre labourée, sang séché.",
          artistNotes:
            "Focus sur la lame, reflet du feu dans l'acier. L'emblème du clan Kuroda luit faiblement.",
          rhythm: "reveal",
          locationId: null,
          moment: "Crépuscule",
          continuity: "Le sabre porte l'emblème du clan Kuroda.",
          characters: [],
          texts: [],
        },
        {
          action: "Kenji court dans les rizières. Il trébuche. Il se relève.",
          framing: "wide",
          setting: "Rizières, boue.",
          artistNotes:
            "Montrer la panique dans les yeux. Poursuite. Le vent soulève ses cheveux.",
          rhythm: "action",
          locationId: null,
          moment: "Crépuscule",
          continuity: "",
          characters: [
            { characterId: kenjiId, state: "Paniqué, égratignures" },
          ],
          texts: [
            {
              kind: "thought",
              characterId: kenjiId,
              content: "Cours. Ne te retourne pas. Cours.",
            },
          ],
        },
      ],
    });
    ok("Script de la page 1 du chapitre 1 enregistré (3 cases détaillées)");
  }

  // --- Trame (Plot Board) --------------------------------------------------
  await seedPlot(
    project.id,
    [
      {
        lane: "main",
        row: 0,
        title: "Massacre du village Kuroda",
        note: "Événement fondateur. Le clan Mizo détruit le village de Kenji.",
        pivot: true,
        status: "written",
        tags: ["Inciting incident"],
        characterIds: [kenjiId, shinjiroId],
        povId: kenjiId,
        locationId: null,
      },
      {
        lane: "main",
        row: 1,
        title: "Kenji rencontre Kuro",
        note: "Premier contact avec le maître. Le début de l'apprentissage.",
        pivot: false,
        status: "written",
        characterIds: [kenjiId, kuroId],
        povId: kenjiId,
      },
      {
        lane: "main",
        row: 3,
        title: "Premier entraînement au Kurokumo",
        note: "Kenji commence à ressentir le pouvoir maudit.",
        pivot: false,
        status: "written",
        characterIds: [kenjiId, kuroId],
        povId: kenjiId,
      },
      {
        lane: "main",
        row: 5,
        title: "Kenji découvre le secret du Kurokumo",
        note: "Midpoint : le style n'est pas une malédiction, c'est une arme contre les Mizo.",
        pivot: true,
        status: "idea",
        tags: ["Midpoint", "Revelation"],
        characterIds: [kenjiId, kuroId],
        povId: kenjiId,
      },
      {
        lane: "main",
        row: 7,
        title: "Premier duel contre Shinjiro",
        note: "Kenji perd. Il est sauvé in extremis.",
        pivot: false,
        status: "idea",
        characterIds: [kenjiId, shinjiroId],
        povId: kenjiId,
      },
      {
        lane: "main",
        row: 8,
        title: "Duel final contre Shinjiro Mizo",
        note: "Climax du Tome 3.",
        pivot: false,
        status: "idea",
        tags: ["Climax"],
        characterIds: [kenjiId, shinjiroId],
        povId: kenjiId,
      },
      {
        lane: "sub",
        row: 2,
        title: "Shinjiro apprend la survie de Kenji",
        note: "Shinjiro envoie ses hommes traquer Kenji.",
        pivot: false,
        status: "written",
        characterIds: [shinjiroId],
        povId: shinjiroId,
      },
      {
        lane: "sub",
        row: 4,
        title: "Shinjiro consolide son pouvoir",
        note: "Shinjiro élimine un rival politique.",
        pivot: false,
        status: "draft",
        characterIds: [shinjiroId],
        povId: shinjiroId,
      },
      {
        lane: "sub",
        row: 6,
        title: "Shinjiro découvre l'existence du Kurokumo",
        note: "Shinjiro comprend que Kenji est une menace.",
        pivot: true,
        status: "idea",
        characterIds: [shinjiroId],
        povId: shinjiroId,
      },
      {
        lane: "third",
        row: 3,
        title: "Yuki prisonnière au château Mizo",
        note: "Yuki est vivante, prisonnière depuis deux ans.",
        pivot: false,
        status: "draft",
        tags: ["Subplot"],
        characterIds: [yukiId, shinjiroId],
        povId: yukiId,
      },
      {
        lane: "third",
        row: 6,
        title: "Yuki prépare son évasion",
        note: "Yuki rassemble des informations sur Shinjiro.",
        pivot: false,
        status: "idea",
        characterIds: [yukiId],
        povId: yukiId,
      },
    ],
    {
      subLaneName: "Shinjiro (antagoniste)",
      thirdLaneName: "Yuki (sous-intrigue)",
      tension: { 0: 3, 1: 2, 3: 5, 5: 7, 7: 9, 8: 10 },
      acts: {
        0: "Arc 1 — Le Survivant",
        3: "Arc 2 — L'Apprentissage",
        7: "Arc 3 — La Vengeance",
      },
      rowLabels: {
        0: "Le massacre",
        1: "La rencontre",
        3: "L'entraînement",
        5: "Le secret",
        7: "Le duel perdu",
        8: "Le duel final",
      },
    },
  );
  ok("Trame créée : 3 lanes, 11 événements, tension, actes, labels");

  // --- Notes ---------------------------------------------------------------
  const bibleFolder = await createFolder(project.id, "Bible de l'univers");
  const ideasFolder = await createFolder(project.id, "Arcs futurs");
  const refFolder = await createFolder(project.id, "Références visuelles");

  await createNote(
    project.id,
    "Les styles de sabre",
    [
      "Styles présents dans l'univers.",
      "Kurokumo (Nuage Noir) : style maudit, puise dans la haine. Interdit par le clan Mizo. Créé par un homme qui voulait protéger les faibles.",
      "Mikagami (Miroir d'Eau) : style du clan Mizo, basé sur la fluidité et la feinte.",
      "Lame d'Argent : style du clan Kuroda, basé sur la vitesse pure. Disparu avec le village.",
      "Chaque style a une faiblesse. Le Kurokumo craint le calme intérieur. Le Mikagami craint la force brute. La Lame d'Argent craint… elle-même.",
    ],
    bibleFolder,
  );

  await createNote(
    project.id,
    "Arcs futurs",
    [
      "Idées d'arcs pour les tomes suivants.",
      "Tome 4 : Kenji rencontre un autre disciple du Kurokumo, qui a sombré dans la folie.",
      "Tome 5 : La sœur de Kenji est vivante — elle est devenue une Mizo (cf. Yuki).",
      "Tome 6 : Le vrai antagoniste : le maître qui a créé le Kurokumo, toujours vivant.",
      "Tome 7 : Kenji doit choisir entre le Kurokumo et l'honneur de sa famille.",
    ],
    ideasFolder,
  );

  await createNote(
    project.id,
    "Palette et références",
    [
      "Kenji : noir, gris, rouge sombre. Vêtements usés, cheveux en bataille.",
      "Kuro : gris, blanc cassé, bâton de marche.",
      "Shinjiro : blanc immaculé, or, noir. Kimono impeccable, sabre en bois.",
      "Yuki : noir, rouge sombre (bandeau). Kimono discret.",
      "Sanctuaire : brume grise, bois noir, vert sombre.",
      "Citadelle : bleu azur, or, blanc.",
    ],
    refFolder,
  );

  await createNote(
    project.id,
    "Décisions narratives",
    [
      "Le Kurokumo ne doit pas être un simple power-up : il doit coûter quelque chose à Kenji.",
      "Shinjiro ne doit pas être un méchant caricatural : il croit à sa mission.",
      "Yuki doit rester dans l'ombre jusqu'au Tome 4 ou 5.",
      "Le vrai antagoniste n'est pas Shinjiro, mais le créateur du Kurokumo.",
      "Le thème central : la vengeance est un piège du monde ancien. Kenji doit choisir entre vengeance et protection.",
    ],
    bibleFolder,
  );
  ok("4 notes dans 3 dossiers");

  log(`Projet Manga terminé : « ${project.name} » (${project.id})`);
}

// ===========================================================================
// ██  Point d'entrée
// ===========================================================================

async function main(): Promise<void> {
  try {
    const { version } = await api.appInfo();
    log(`GANIS v${version} — initialisation des projets de démonstration`);
    if (FORCE) warn("Mode --force : les projets existants seront supprimés.");

    await seedNovel();
    await seedManga();

    console.log(`\n${c.green}${c.bold}✨ Les deux projets de démonstration sont prêts.${c.reset}`);
    console.log(`${c.dim}   Ouvre GANIS : ils apparaissent dans le tableau de bord.${c.reset}\n`);
  } catch (error) {
    console.error(`\n${c.red}[seed] Erreur :${c.reset}`, error);
    process.exit(1);
  }
}

void main();