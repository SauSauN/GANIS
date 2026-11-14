/**
 * Tests de bout en bout de GANIS : la vraie application (Rust + React).
 *
 * Un seul lancement de GANIS sur un dossier de données neuf, puis les
 * parcours s'enchaînent comme pour un utilisateur : premier lancement,
 * comptes, tableau de bord, chaque module de l'espace de travail, roman,
 * manga, recherche, corbeille, historique, paramètres, persistance après
 * redémarrage et isolation entre comptes.
 *
 *   cd src-tauri && cargo build
 *   npx playwright test
 *
 * Les tests sont en série : chacun part de l'état laissé par le précédent.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { launchGanis, type GanisApp } from "./ganis-app";

const ADMIN = { username: "admin_e2e", password: "motdepasse1" };
const AUTRE = { username: "autre_e2e", password: "autrepasse2" };
const ROMAN = "Roman E2E";
const MANGA = "Manga E2E";
const PUBLIC = "Projet public E2E";

let app: GanisApp;
let page: Page;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  app = await launchGanis();
  page = app.page;
});

// En cas d'échec : capture d'écran et arbre d'accessibilité de la fenêtre
// GANIS (le rapport de Playwright ne les prend pas pour une page CDP).
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus || !page) return;
  const snapshot = await page.locator("body").ariaSnapshot().catch(() => "");
  await testInfo.attach("page.aria.yml", { body: snapshot, contentType: "text/yaml" });
  const screenshot = await page.screenshot().catch(() => null);
  if (screenshot) await testInfo.attach("page.png", { body: screenshot, contentType: "image/png" });
  if (process.env.GANIS_E2E_DUMP) console.log(snapshot);
});

test.afterAll(async () => {
  await app?.close();
});

// ---------------------------------------------------------------------------
// Aides
// ---------------------------------------------------------------------------

async function go(route: string) {
  await page.evaluate((r) => { window.location.hash = r; }, route);
  await expect(page).toHaveURL(new RegExp(`#${route.replace(/[/]/g, "\/")}$`));
}

/** Ferme le guide de démarrage ou un tutoriel s'il est ouvert. */
async function closeHelp() {
  for (const name of ["Fermer le guide", "Fermer le tutoriel"]) {
    const button = page.getByRole("button", { name });
    if (await button.isVisible().catch(() => false)) await button.click();
  }
}

const modules = () => page.getByRole("complementary", { name: "Modules du projet" });
const features = () => page.getByRole("complementary", { name: "Fonctionnalités du module" });
const tabs = () => page.getByRole("tablist", { name: "Onglets du projet" });
/** Contenu de l'onglet actif (les autres onglets restent montés, cachés). */
const view = () => page.getByRole("tabpanel");

/** Ouvre un module ; un second clic sur le module actif replie son panneau. */
async function openModule(name: string) {
  const button = modules().getByRole("button", { name, exact: true });
  const shown = async () =>
    (await button.getAttribute("aria-pressed")) === "true" && (await features().isVisible());
  for (let attempt = 0; attempt < 3 && !(await shown()); attempt++) {
    await button.click();
    await page.waitForTimeout(300);
    await closeHelp();
  }
  await expect(features()).toBeVisible();
}

async function openFeature(module: string, feature: string | RegExp) {
  await openModule(module);
  await features().getByRole("button", { name: feature }).first().click();
  await closeHelp();
}

async function save() {
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("contentinfo").getByRole("status")).toContainText(/Enregistré|Prêt/);
}

async function login(user = ADMIN) {
  await go("/login");
  await page.getByLabel("Nom d'utilisateur").fill(user.username);
  await page.getByLabel("Mot de passe", { exact: true }).fill(user.password);
  await page.locator("form").getByRole("button", { name: /Se connecter/ }).click();
  await page.waitForURL(/#\/dashboard/);
  await closeHelp();
}

async function logout() {
  await page.getByRole("button", { name: "Menu utilisateur" }).click();
  await page.getByRole("menu").getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page.getByRole("button", { name: "Commencer" })).toBeVisible();
}

/** Carte d'un projet du tableau de bord. */
const card = (name: string) =>
  page.getByRole("main").locator("div, article, li")
    .filter({ has: page.getByRole("button", { name, exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Dupliquer le projet" }) })
    .last();

async function openProject(name: string) {
  await go("/dashboard");
  await closeHelp();
  await page.getByRole("button", { name, exact: true }).first().click();
  await page.waitForURL(/#\/workspace\//);
  await page.waitForTimeout(500);
  await closeHelp();
}

async function createProject(name: string, type: string, description = "") {
  await page.getByRole("button", { name: "Nouveau projet" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Créer un nouveau projet" });
  await dialog.getByLabel("Nom du projet").fill(name);
  if (description) await dialog.getByLabel("Description (facultatif)").fill(description);
  await dialog.getByLabel("Type de création").selectOption({ label: type });
  await dialog.getByRole("button", { name: "Créer le projet" }).click();
  await page.waitForURL(/#\/workspace\//);
  await page.waitForTimeout(500);
  await closeHelp();
}

/** Confirme la boîte de dialogue ouverte avec le bouton `name`. */
async function confirm(name: string | RegExp) {
  await page.getByRole("alertdialog").or(page.getByRole("dialog")).last()
    .getByRole("button", { name }).click();
}

/** Onglet affiché (les onglets en trop sont masqués de la barre). */
const activeTab = () => tabs().getByRole("tab", { selected: true });

/** Première création d'une fiche : choix du niveau de détail, puis « Continuer ». */
async function passDetailLevel() {
  const continuer = view().getByRole("button", { name: "Continuer" });
  await page.waitForTimeout(300);
  if (await continuer.isVisible().catch(() => false)) await continuer.click();
}

const field = (scope: Locator, label: string | RegExp) =>
  scope.getByLabel(label, { exact: typeof label === "string" }).first();

// ---------------------------------------------------------------------------
// 1. Premier lancement
// ---------------------------------------------------------------------------

test.describe("Premier lancement", () => {
  test("l'accueil présente GANIS et change de langue", async () => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Donnez forme à vos histoires");
    await expect(page.getByRole("button", { name: "Commencer" })).toBeVisible();

    const langue = page.getByRole("combobox", { name: "Langue de l'interface" });
    await langue.selectOption("EN");
    await expect(page.getByRole("button", { name: /Get started|Start/ })).toBeVisible();
    await page.getByRole("combobox").first().selectOption("FR");
    await expect(page.getByRole("button", { name: "Commencer" })).toBeVisible();
  });

  test("sans compte, « Se connecter » mène à la création de l'administrateur", async () => {
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL(/#\/setup/);
    await expect(page.getByRole("button", { name: "Créer le compte administrateur" })).toBeVisible();
  });

  test("le formulaire de l'administrateur refuse les saisies invalides", async () => {
    const submit = page.getByRole("button", { name: "Créer le compte administrateur" });

    await page.getByLabel("Nom d'utilisateur").fill("a!");
    await page.getByLabel("Mot de passe", { exact: true }).fill("court");
    await page.getByLabel("Confirmer le mot de passe").fill("different");
    await submit.click();
    await expect(page).toHaveURL(/#\/setup/);

    await page.getByLabel("Nom d'utilisateur").fill(ADMIN.username);
    await page.getByLabel("Mot de passe", { exact: true }).fill(ADMIN.password);
    await page.getByLabel("Confirmer le mot de passe").fill("pas-le-meme1");
    await submit.click();
    await expect(page).toHaveURL(/#\/setup/);
  });

  test("création du compte administrateur et guide de démarrage", async () => {
    await page.getByLabel("Mot de passe", { exact: true }).fill(ADMIN.password);
    await page.getByLabel("Confirmer le mot de passe").fill(ADMIN.password);
    await page.getByRole("button", { name: "Créer le compte administrateur" }).click();
    await page.waitForURL(/#\/dashboard/);

    const guide = page.getByRole("dialog", { name: "Guide de démarrage" });
    await expect(guide).toBeVisible();
    await expect(guide).toContainText("Étape 1 sur");
    await guide.getByRole("button", { name: "Suivant" }).click();
    await expect(guide).toContainText("Étape 2 sur");
    await guide.getByRole("button", { name: "Précédent" }).click();
    await expect(guide).toContainText("Étape 1 sur");
    await guide.getByRole("button", { name: "Fermer le guide" }).click();
    await expect(guide).toBeHidden();

    await expect(page.getByRole("heading", { name: `Bonjour, ${ADMIN.username}` })).toBeVisible();
    await expect(page.getByRole("button", { name: "Espace privé" })).toBeVisible();
    await expect(page.getByText("Aucun projet pour l'instant")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 2. Tableau de bord
// ---------------------------------------------------------------------------

test.describe("Tableau de bord", () => {
  test("créer un projet roman ouvre son espace de travail", async () => {
    await createProject(ROMAN, "Roman", "Un roman écrit par les tests");
    await expect(page.getByRole("banner")).toContainText(ROMAN);
    await expect(modules().getByRole("button", { name: "Manuscrit" })).toBeVisible();
    await expect(view().getByRole("heading", { name: ROMAN })).toBeVisible();
  });

  test("créer un projet manga", async () => {
    await go("/dashboard");
    await createProject(MANGA, "Manga");
    await expect(modules().getByRole("button", { name: "Scénario" })).toBeVisible();
    await expect(modules().getByRole("button", { name: "Manuscrit" })).toHaveCount(0);
  });

  test("le nom du projet est obligatoire", async () => {
    await go("/dashboard");
    await page.getByRole("button", { name: "Nouveau projet" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Créer un nouveau projet" });
    await dialog.getByRole("button", { name: "Créer le projet" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Annuler" }).click();
    await expect(dialog).toBeHidden();
  });

  test("liste, recherche et compteurs", async () => {
    await go("/dashboard");
    await expect(page.getByRole("button", { name: /Projets actifs 2/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tous les projets (2)" })).toBeVisible();

    const recherche = page.getByRole("textbox", { name: "Rechercher un projet" });
    await recherche.fill("manga");
    await expect(page.getByRole("main").getByText(MANGA).first()).toBeVisible();
    await expect(page.getByRole("main").getByText(ROMAN, { exact: true })).toHaveCount(0);
    await recherche.fill("introuvable-xyz");
    await expect(page.getByText("Aucun projet ne correspond")).toBeVisible();
    await recherche.fill("");
  });

  test("favoris", async () => {
    await card(MANGA).getByRole("button", { name: "Ajouter aux favoris" }).click();
    await expect(page.getByRole("button", { name: /Favoris 1/ })).toBeVisible();
    await page.getByRole("button", { name: /Favoris 1/ }).click();
    await expect(card(MANGA)).toBeVisible();
    await expect(card(ROMAN)).toHaveCount(0);
    await page.getByRole("button", { name: /Projets actifs/ }).click();
  });

  test("archiver puis désarchiver un projet", async () => {
    await card(ROMAN).getByRole("button", { name: "Archiver le projet" }).click();
    await expect(page.getByRole("button", { name: /Archivés 1/ })).toBeVisible();
    await page.getByRole("button", { name: /Archivés 1/ }).click();
    await card(ROMAN).getByRole("button", { name: "Désarchiver le projet" }).click();
    await expect(page.getByRole("button", { name: /Archivés 0/ })).toBeVisible();
    await page.getByRole("button", { name: /Projets actifs/ }).click();
    await expect(card(ROMAN)).toBeVisible();
  });

  test("dupliquer, mettre à la corbeille et restaurer un projet", async () => {
    const copie = `${MANGA} (copie)`;
    await card(MANGA).getByRole("button", { name: "Dupliquer le projet" }).click();
    await expect(page.getByRole("button", { name: /Projets actifs 3/ })).toBeVisible();
    await expect(card(copie)).toBeVisible();

    await card(copie).getByRole("button", { name: "Supprimer le projet" }).click();
    await confirm("Mettre à la corbeille");
    await expect(page.getByRole("button", { name: /Corbeille 1/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Projets actifs 2/ })).toBeVisible();

    await page.getByRole("button", { name: /Corbeille 1/ }).click();
    await page.getByRole("button", { name: `Restaurer « ${copie} »` }).click();
    await expect(page.getByRole("button", { name: /Corbeille 0/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Projets actifs 3/ })).toBeVisible();
    await page.getByRole("button", { name: /Projets actifs/ }).click();
  });
});

// ---------------------------------------------------------------------------
// 3. Espace de travail : Détails
// ---------------------------------------------------------------------------

test.describe("Détails du projet", () => {
  test.beforeAll(async () => {
    await openProject(ROMAN);
  });

  test("l'accueil du projet affiche ses informations", async () => {
    await openFeature("Détails", "Accueil du projet");
    await expect(view()).toContainText("Informations du projet");
    await expect(view()).toContainText("Roman");
  });

  test("synopsis : contenu, genres, enregistrement", async () => {
    await openFeature("Détails", "Synopsis du projet");
    await expect(tabs().getByRole("tab", { name: /Synopsis/ })).toBeVisible();

    const editeur = view().locator("[contenteditable=true]").first();
    await editeur.click();
    await page.keyboard.type("Une héroïne traverse le royaume de Lunéa pour retrouver sa sœur.");
    const genres = view().getByPlaceholder(/Fantasy, Aventure/);
    await genres.fill("Fantasy");
    await genres.press("Enter");
    await save();

    await openFeature("Détails", "Accueil du projet");
    await expect(view()).toContainText("royaume de Lunéa");
  });

  test("glossaire : ajouter un terme et le retrouver", async () => {
    await openFeature("Détails", "Glossaire");
    await view().getByRole("button", { name: "Nouveau terme" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Terme").fill("Lunéa");
    await dialog.getByLabel("Catégorie").fill("Lieu");
    await dialog.getByLabel("Définition").fill("Le royaume où se déroule l'histoire.");
    await dialog.getByRole("button", { name: /Ajouter|Enregistrer|Créer/ }).last().click();
    await expect(dialog).toBeHidden();
    await expect(view()).toContainText("Lunéa");
    await expect(view()).toContainText("Le royaume où se déroule l'histoire.");
  });
});

// ---------------------------------------------------------------------------
// 4. Personnages et relations
// ---------------------------------------------------------------------------

test.describe("Personnages", () => {
  async function createCharacter(firstName: string, lastName: string) {
    await openFeature("Personnages", "Créer un personnage");
    await passDetailLevel();
    await field(view(), "Prénom").fill(firstName);
    await field(view(), "Nom").fill(lastName);
    await view().getByRole("button", { name: "Créer le personnage" }).click();
    await expect(activeTab()).toContainText(firstName);
  }

  test("le niveau de détail se choisit à la première création", async () => {
    await openFeature("Personnages", "Créer un personnage");
    const niveaux = view().getByRole("radiogroup", { name: "Niveau de détail des fiches" });
    await expect(niveaux).toBeVisible();
    await expect(niveaux.getByRole("radio")).toHaveCount(3);
    await niveaux.getByRole("radio").first().check();
    await view().getByRole("button", { name: "Continuer" }).click();
    await expect(field(view(), "Prénom")).toBeVisible();
  });

  test("un personnage sans nom est refusé", async () => {
    await view().getByRole("button", { name: "Créer le personnage" }).click();
    await expect(view().getByRole("heading", { name: "Créer un personnage" })).toBeVisible();
  });

  test("créer deux personnages", async () => {
    await createCharacter("Aldric", "VENN");
    await createCharacter("Mira", "SOL");
  });

  test("modifier une fiche et l'enregistrer", async () => {
    const fiche = view();
    await expect(field(fiche, "Prénom")).toHaveValue("Mira");
    await field(fiche, "Prénom").fill("Mirabelle");
    await save();
    await expect(activeTab()).toContainText("Mirabelle");
  });

  test("liste, recherche et affichage en tableau", async () => {
    await openFeature("Personnages", "Liste des personnages");
    await expect(view()).toContainText("2 personnages");
    await expect(view()).toContainText("Aldric");
    await expect(view()).toContainText("Mirabelle");

    const recherche = view().getByRole("searchbox", { name: "Rechercher" });
    await recherche.fill("ald");
    await expect(view()).toContainText("Aldric");
    await expect(view().getByText(/Mirabelle/)).toHaveCount(0);
    await recherche.fill("");

    await view().getByRole("radio", { name: "Tableau" }).check();
    await expect(view().getByRole("table").or(view().getByRole("grid")).first()).toBeVisible();
    await view().getByRole("radio", { name: "Cartes" }).check();
    await view().getByRole("combobox", { name: "Trier" }).selectOption({ label: "Modifiés récemment" });
    await expect(view().getByRole("listitem").first()).toContainText("Mirabelle");
  });

  test("relation entre deux personnages", async () => {
    await openFeature("Personnages", "Relations entre personnages");
    await view().getByRole("button", { name: /Nouvelle relation|Ajouter une relation|Créer une relation/ }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Personnage", { exact: true }).selectOption({ label: "Aldric VENN" });
    await dialog.getByLabel("En relation avec").selectOption({ label: "Mirabelle SOL" });
    await dialog.getByRole("button", { name: /Créer|Enregistrer|Ajouter/ }).last().click();
    await expect(dialog).toBeHidden();
    await expect(view()).toContainText("Aldric");
    await expect(view()).toContainText("Mirabelle");
  });

  test("arbre généalogique d'un personnage", async () => {
    await openFeature("Personnages", "Relations entre personnages");
    await view().getByRole("radio", { name: "Arbre" }).click();
    const root = view().getByRole("combobox", { name: "Arbre de" });
    await root.selectOption({ label: "Aldric VENN" });
    await expect(root).toHaveValue(/.+/);
    await view().getByRole("radio", { name: "Réseau" }).click();
  });
});

// ---------------------------------------------------------------------------
// 5. Lieux
// ---------------------------------------------------------------------------

test.describe("Lieux", () => {
  async function createLocation(name: string, group: string, type: string) {
    await openFeature("Lieux", "Créer un lieu");
    await passDetailLevel();
    // Le type choisi adapte la fiche (une capitale n'est pas une forêt).
    await expect(view().getByRole("heading", { name: "Quel genre de lieu ?" })).toBeVisible();
    await view().getByRole("combobox", { name: group }).selectOption({ label: type });
    await field(view(), "Nom du lieu").fill(name);
    await view().getByRole("button", { name: "Créer le lieu" }).click();
    await expect(activeTab()).toContainText(name);
  }

  test("créer des lieux", async () => {
    await createLocation("Lunéa", "Territoires politiques", "Royaume");
    await createLocation("Port-Brume", "Agglomérations", "Port");
  });

  test("liste et recherche des lieux", async () => {
    await openFeature("Lieux", "Liste des lieux");
    await expect(view()).toContainText("2 lieux");
    await view().getByPlaceholder("Rechercher un lieu…").fill("brume");
    await expect(view()).toContainText("Port-Brume");
    await expect(view().getByText("Lunéa", { exact: true })).toHaveCount(0);
    await view().getByPlaceholder("Rechercher un lieu…").fill("zzz");
    await expect(view()).toContainText("Aucun lieu ne correspond");
    await view().getByPlaceholder("Rechercher un lieu…").fill("");
  });
});

// ---------------------------------------------------------------------------
// 6. Découpage, trame, manuscrit
// ---------------------------------------------------------------------------

test.describe("Découpage et trame", () => {
  test("ajouter une partie, un chapitre et une scène", async () => {
    await openFeature("Découpage", "Plan du récit");
    await expect(view()).toContainText("Votre découpage est vide");
    await expect(view().getByRole("list", { name: "Niveaux du découpage" })).toContainText(/Parties\s*0/);

    for (const niveau of ["Partie", "Chapitre", "Scène"]) {
      await view().getByRole("button", { name: `Ajouter : ${niveau}` }).first().click();
      await expect(features().getByRole("treeitem", { name: `${niveau} 1` })).toBeVisible();
    }
    await expect(features().getByRole("heading", { name: "Arborescence (3)" })).toBeVisible();
  });

  test("fiche d'une scène : titre et texte du roman", async () => {
    await features().getByRole("button", { name: "Scène 1" }).click();
    await expect(activeTab()).toContainText("Scène 1");

    await view().getByPlaceholder(/Sans titre/).first().fill("La lettre");
    const texte = view().locator("[contenteditable=true]").first();
    await texte.click();
    await page.keyboard.type("Aldric ouvrit la lettre scellée de cire bleue.");
    await save();
    await expect(features().getByRole("tree")).toContainText("La lettre");
  });

  test("lecture complète du récit (bouton ▶)", async () => {
    await page.getByRole("button", { name: "Lire l'histoire" }).click();
    await expect(view()).toContainText("Aldric ouvrit la lettre");
    await page.getByRole("button", { name: /Lire l'histoire|Revenir|Quitter la lecture/ }).first().click();
  });

  test("plateau des trames", async () => {
    await openFeature("Trame", "Plateau des trames");
    await expect(view()).toContainText(/Trame principale|Votre trame est vide/);
  });

  test("lecture de l'histoire", async () => {
    await openFeature("Trame", "Lecture de l'histoire");
    await expect(tabs().getByRole("tab", { name: /Lecture de l'histoire/ })).toBeVisible();
  });

  test("manuscrit, suivi de rédaction et dossier éditorial (roman)", async () => {
    for (const feature of ["Manuscrit", "Suivi de rédaction", "Dossier éditorial", "Rechercher et remplacer"]) {
      await openFeature("Manuscrit", feature);
      await expect(tabs().getByRole("tab", { name: new RegExp(feature) })).toBeVisible();
      await expect(page.getByText("Une erreur")).toHaveCount(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Notes
// ---------------------------------------------------------------------------

test.describe("Notes", () => {
  test("créer une note et y écrire", async () => {
    await openFeature("Notes", "Créer une note");
    await field(view(), "Titre").fill("Recherches sur Lunéa");
    await view().getByRole("button", { name: "Créer la note" }).click();
    await expect(activeTab()).toContainText("Recherches sur Lunéa");

    const editeur = view().locator("[contenteditable=true]").first();
    await editeur.click();
    await page.keyboard.type("Le climat y est froid toute l'année.");
    await save();
  });

  test("liste des notes et recherche", async () => {
    await openFeature("Notes", "Liste des notes");
    await expect(view()).toContainText("Recherches sur Lunéa");
    await view().getByPlaceholder("Rechercher une note…").fill("rien-de-tel");
    await expect(view()).toContainText("Aucune note ne correspond.");
    await view().getByPlaceholder("Rechercher une note…").fill("");
  });

  test("mur de post-it", async () => {
    await openFeature("Notes", "Mur de post-it");
    await expect(tabs().getByRole("tab", { name: /Mur de post-it/ })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 8. Recherche, paramètres du projet, corbeille, historique
// ---------------------------------------------------------------------------

test.describe("Outils du projet", () => {
  test("la recherche globale trouve personnages, lieux et notes, sans accents", async () => {
    await page.getByRole("button", { name: "Rechercher dans le projet" }).click();
    const recherche = features().getByRole("searchbox", { name: /Rechercher dans le projet/ });
    await recherche.fill("lunea");
    await expect(features()).toContainText("Lunéa");
    await expect(features()).toContainText("Recherches sur Lunéa");
    await recherche.fill("ALDRIC");
    await expect(features()).toContainText("Aldric");
    await recherche.fill("mot-absent-du-projet");
    await expect(features().getByText("Aldric")).toHaveCount(0);
  });

  test("la palette de commandes s'ouvre avec Ctrl+K", async () => {
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  const MODULES_FACULTATIFS: { module: string; section: string; activer: string; creer: string; nom: string }[] = [
    { module: "Objets", section: "Objets", activer: "Activer les objets", creer: "Créer un objet", nom: "L'épée de Lunéa" },
    { module: "Faune et flore", section: "Faune et flore", activer: "Activer la faune et la flore", creer: "Créer une fiche", nom: "Loup des neiges" },
    { module: "Factions", section: "Factions", activer: "Activer les factions", creer: "Créer une faction", nom: "L'ordre de la Brume" },
    { module: "Peuples", section: "Peuples, cultures et religions", activer: "Activer les peuples, cultures et religions", creer: "Créer une fiche", nom: "Les Sylvains" },
    { module: "Magie", section: "Magie et pouvoirs", activer: "Activer la magie et les pouvoirs", creer: "Créer une fiche", nom: "Magie des marées" },
  ];

  test("paramètres du projet : chaque section s'ouvre", async () => {
    await openModule("Paramètres du projet");
    for (const section of ["Informations", "Statut et organisation", "Personnages", "Lieux", "Découpage", "Trame", "Notes"]) {
      await features().getByRole("button", { name: section, exact: true }).click();
      await expect(activeTab()).toContainText(section);
      await expect(page.getByText(/Une erreur (est survenue|d'affichage)/)).toHaveCount(0);
    }
  });

  test("paramètres du projet : activer les modules facultatifs", async () => {
    for (const { module, section, activer } of MODULES_FACULTATIFS) {
      await openModule("Paramètres du projet");
      await features().getByRole("button", { name: section, exact: true }).click();
      const interrupteur = view().getByRole("switch", { name: activer });
      await expect(interrupteur).not.toBeChecked();
      await interrupteur.click();
      await expect(interrupteur).toBeChecked();
      await expect(modules().getByRole("button", { name: module, exact: true })).toBeVisible();
    }
  });

  test("modules facultatifs : créer une fiche dans chacun", async () => {
    for (const { module, creer, nom } of MODULES_FACULTATIFS) {
      await openFeature(module, creer);
      await passDetailLevel();
      // Choix du type, quand le module en propose.
      const type = view().getByRole("combobox").first();
      if (await type.isVisible().catch(() => false)) {
        const valeur = await type.locator("option:not([disabled])").first().getAttribute("value");
        if (valeur !== null) await type.selectOption(valeur);
      }
      await field(view(), "Nom").fill(nom);
      await view().getByRole("button", { name: /^Créer/ }).last().click();
      await expect(activeTab()).toContainText(nom);
    }
  });

  test("corbeille : supprimer un lieu puis le restaurer", async () => {
    await openFeature("Lieux", "Liste des lieux");
    await view().getByText("Port-Brume").first().click();
    await expect(activeTab()).toContainText("Port-Brume");
    await view().getByRole("button", { name: /Supprimer/ }).first().click();
    await confirm(/Supprimer|corbeille/);
    await expect(tabs().getByRole("tab", { name: /Port-Brume/ })).toHaveCount(0);

    await openFeature("Détails", "Corbeille");
    await expect(view()).toContainText("Port-Brume");
    await view().getByRole("button", { name: /Restaurer/ }).first().click();
    await expect(view().getByText("Port-Brume")).toHaveCount(0);

    await openFeature("Lieux", "Liste des lieux");
    await expect(view()).toContainText("Port-Brume");
  });

  test("historique : les actions sont journalisées", async () => {
    await openFeature("Détails", "Historique");
    await expect(view()).toContainText(/Aldric|Lunéa|Port-Brume/);
  });

  test("double-clic sur un onglet : plein écran puis retour", async () => {
    const onglet = tabs().getByRole("tab").first();
    await onglet.dblclick();
    await expect(modules()).toBeHidden();
    await onglet.dblclick();
    await expect(modules()).toBeVisible();
  });

  test("fermer un onglet avec Ctrl+W", async () => {
    const nom = (await activeTab().textContent())!.trim();
    await page.keyboard.press("Control+w");
    await expect(activeTab()).not.toHaveText(nom);
  });
});

// ---------------------------------------------------------------------------
// 9. Manga
// ---------------------------------------------------------------------------

test.describe("Manga", () => {
  test("chemin de fer et suivis du scénario", async () => {
    await openProject(MANGA);
    for (const feature of ["Chemin de fer", "Suivi du scénario", "Suivi de fabrication", "Continuité"]) {
      await openFeature("Scénario", feature);
      await expect(tabs().getByRole("tab", { name: new RegExp(feature) })).toBeVisible();
      await expect(page.getByText(/Une erreur (est survenue|d'affichage)/)).toHaveCount(0);
    }
  });

  test("découpage manga : ajouter un tome", async () => {
    await openFeature("Découpage", "Plan du récit");
    await view().getByRole("button", { name: /Ajouter : Tome|Ajouter à la racine/ }).first().click();
    await page.waitForTimeout(300);
    const enregistrer = view().getByRole("button", { name: "Enregistrer" }).first();
    if (await enregistrer.isVisible().catch(() => false)) await enregistrer.click();
    await expect(view()).toContainText(/Tome/);
  });
});

// ---------------------------------------------------------------------------
// 10. Paramètres généraux
// ---------------------------------------------------------------------------

test.describe("Paramètres généraux", () => {
  test("changer de thème depuis la barre de titre", async () => {
    const avant = await page.evaluate(() => document.documentElement.className);
    await page.getByRole("button", { name: "Changer de thème" }).click();
    await page.getByRole("menuitem").or(page.getByRole("menuitemradio")).filter({ hasText: /Sombre/ }).first()
      .click({ timeout: 2_000 }).catch(() => {}); // Le bouton bascule directement le thème.
    await expect.poll(() => page.evaluate(() => document.documentElement.className)).not.toBe(avant);
  });

  test("les sections des paramètres s'ouvrent", async () => {
    await go("/settings");
    await expect(page.getByRole("main")).toContainText(/Compte|Apparence/);
    for (const section of ["Compte", "Apparence", "Enregistrement"]) {
      const lien = page.getByRole("button", { name: new RegExp(section) }).or(page.getByRole("tab", { name: new RegExp(section) })).first();
      if (await lien.isVisible().catch(() => false)) {
        await lien.click();
        await expect(page.getByRole("main")).toContainText(section);
      }
    }
  });

  test("packages : les thèmes système et le choix d'un thème", async () => {
    await go("/packages");
    const main = page.getByRole("main");
    await expect(main).toContainText("Thèmes système");
    for (const theme of ["GANIS Classique", "Parchemin", "Forêt", "Crépuscule", "Contraste élevé"]) {
      await expect(main).toContainText(theme);
    }
    const avant = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary"));
    await main.getByRole("button", { name: "Utiliser" }).first().click();
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary")))
      .not.toBe(avant);
    // Retour au thème d'origine.
    await main.getByRole("button", { name: "Utiliser" }).first().click();
  });

  test("rythme de travail", async () => {
    await go("/dashboard");
    await page.getByRole("button", { name: "Rythme de travail" }).click();
    await expect(page.getByRole("dialog").or(page.getByRole("main")).first()).toBeVisible();
    await page.keyboard.press("Escape");
  });
});

// ---------------------------------------------------------------------------
// 11. Comptes et espaces
// ---------------------------------------------------------------------------

test.describe("Comptes et espaces", () => {
  test("déconnexion puis connexion refusée avec un mauvais mot de passe", async () => {
    await go("/dashboard");
    await logout();
    await go("/login");
    await page.getByLabel("Nom d'utilisateur").fill(ADMIN.username);
    await page.getByLabel("Mot de passe", { exact: true }).fill("mauvais-mdp9");
    await page.locator("form").getByRole("button", { name: /Se connecter/ }).click();
    await expect(page.getByRole("alert").or(page.getByText(/incorrect|invalide/i)).first()).toBeVisible();
    await expect(page).toHaveURL(/#\/login/);
  });

  test("connexion de l'administrateur : ses projets privés sont là", async () => {
    await login();
    await expect(page.getByRole("main")).toContainText(ROMAN);
    await expect(page.getByRole("main")).toContainText(MANGA);
  });

  test("espace public : « Commencer » sans compte ne montre pas les projets privés", async () => {
    await logout();
    await go("/");
    await page.getByRole("button", { name: "Commencer" }).click();
    // Avertissement : l'espace public n'est pas chiffré.
    const avertissement = page.getByRole("dialog", { name: "Espace public" });
    await expect(avertissement).toContainText("ne sont pas chiffrés");
    await avertissement.getByRole("button", { name: "Continuer sans compte" }).click();
    await page.waitForURL(/#\/dashboard/);
    await closeHelp();
    await expect(page.getByRole("button", { name: "Espace public" })).toBeVisible();
    await expect(page.getByRole("main").getByText(ROMAN)).toHaveCount(0);
    await createProject(PUBLIC, "Film");
    await go("/dashboard");
    await expect(card(PUBLIC)).toBeVisible();
  });

  test("créer un second compte : il ne voit pas les projets de l'administrateur", async () => {
    await go("/register");
    await page.getByLabel("Nom d'utilisateur").fill(AUTRE.username);
    await page.getByLabel("Mot de passe", { exact: true }).fill(AUTRE.password);
    await page.getByLabel(/Confirmer/).fill(AUTRE.password);
    await page.locator("form").getByRole("button").last().click();
    // Le compte créé, GANIS demande de se connecter.
    await page.waitForURL(/#\/login/);
    await login(AUTRE);
    await expect(page.getByRole("button", { name: "Menu utilisateur" })).toContainText(AUTRE.username);
    await expect(page.getByRole("heading", { name: `Bonjour, ${AUTRE.username}` })).toBeVisible();
    await expect(page.getByRole("main").getByText(ROMAN)).toHaveCount(0);
    await expect(page.getByRole("main").getByText(MANGA)).toHaveCount(0);
    await expect(page.getByRole("main").getByText(PUBLIC)).toHaveCount(0);
  });

  test("un nom d'utilisateur déjà pris est refusé", async () => {
    await logout();
    await go("/register");
    await page.getByLabel("Nom d'utilisateur").fill(ADMIN.username);
    await page.getByLabel("Mot de passe", { exact: true }).fill("encoreun1");
    await page.getByLabel(/Confirmer/).fill("encoreun1");
    await page.locator("form").getByRole("button").last().click();
    await expect(page).toHaveURL(/#\/register/);
  });
});

// ---------------------------------------------------------------------------
// 12. Persistance
// ---------------------------------------------------------------------------

test.describe("Persistance", () => {
  test("après redémarrage, comptes, projets et fiches sont conservés", async () => {
    app = await app.restart();
    page = app.page;
    await page.waitForTimeout(1500);

    // Un compte existe : pas d'assistant de configuration.
    await expect(page).not.toHaveURL(/#\/setup/);
    await login();
    await openProject(ROMAN);

    await openFeature("Personnages", "Liste des personnages");
    await expect(view()).toContainText("Aldric");
    await expect(view()).toContainText("Mirabelle");

    await openFeature("Lieux", "Liste des lieux");
    await expect(view()).toContainText("Lunéa");
    await expect(view()).toContainText("Port-Brume");

    await openFeature("Notes", "Liste des notes");
    await expect(view()).toContainText("Recherches sur Lunéa");

    await openFeature("Détails", "Glossaire");
    await expect(view()).toContainText("Lunéa");

    await openFeature("Détails", "Accueil du projet");
    await expect(view()).toContainText("royaume de Lunéa");
  });
});
