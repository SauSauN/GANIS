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

const FIRST = { username: "auteur_e2e", password: "plume-violette-1" };
const AUTRE = { username: "autre_e2e", password: "autre-plume-22" };
const ROMAN = "Roman E2E";
const MANGA = "Manga E2E";
const SERIE = "Série E2E";
const FILM = "Film E2E";
const PUBLIC = "Projet public E2E";

/** Hauteur d'un choix des sélecteurs (Graphe / Matrice / Liste, Par plan / Par trame…) : la même partout. */
const SEGMENTED_HEIGHT = 26;
async function expectSegmentedHeight(choice: import("@playwright/test").Locator) {
  const box = await choice.boundingBox();
  expect(box).toBeTruthy();
  // Moins d'un pixel d'écart : arrondis de l'affichage (mise à l'échelle de Windows).
  expect(Math.abs(box!.height - SEGMENTED_HEIGHT)).toBeLessThan(1);
}

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

async function login(user = FIRST) {
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
  // Recherche d'abord : le tableau de bord ne montre que les derniers projets ouverts.
  await page.getByRole("textbox", { name: "Rechercher un projet" }).fill(name);
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

  test("sans compte, « Se connecter » mène à la création du premier compte", async () => {
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL(/#\/setup/);
    await expect(page.getByRole("button", { name: "Créer mon compte" })).toBeVisible();
  });

  test("le formulaire du premier compte refuse les saisies invalides", async () => {
    const submit = page.getByRole("button", { name: "Créer mon compte" });

    await page.getByLabel("Nom d'utilisateur").fill("a!");
    await page.getByLabel("Mot de passe", { exact: true }).fill("court");
    await page.getByLabel("Confirmer le mot de passe").fill("different");
    await submit.click();
    await expect(page).toHaveURL(/#\/setup/);

    await page.getByLabel("Nom d'utilisateur").fill(FIRST.username);
    await page.getByLabel("Mot de passe", { exact: true }).fill(FIRST.password);
    await page.getByLabel("Confirmer le mot de passe").fill("pas-le-meme1");
    await submit.click();
    await expect(page).toHaveURL(/#\/setup/);
  });

  test("création du premier compte et guide de démarrage", async () => {
    await page.getByLabel("Mot de passe", { exact: true }).fill(FIRST.password);
    await page.getByLabel("Confirmer le mot de passe").fill(FIRST.password);
    await page.getByRole("button", { name: "Créer mon compte" }).click();
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

    await expect(page.getByRole("heading", { name: `Bonjour, ${FIRST.username}` })).toBeVisible();
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

  test("galerie : photos, dossiers, nom, description, rangement et ordre", async () => {
    await openFeature("Détails", "Galerie");
    const galerie = view().getByTestId("project-gallery");
    await expect(galerie).toContainText("Ajoutez vos premières images");

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r+mnAAAARElEQVR4nA3JMQHAQAwDMSMJEiMJEiN5JAZxcxC1WiWJERYrIp6oOCGZMTZrYp6pOf8RJjhsSHih4fJHmeKyJeWVlisfdEwxYUlDjK4AAAAASUVORK5CYII=",
      "base64",
    );
    await galerie.getByTestId("gallery-images-input").setInputFiles([
      { name: "carte.png", mimeType: "image/png", buffer: png },
      { name: "affiche.png", mimeType: "image/png", buffer: png },
    ]);
    // Onglet « Photos » (par défaut) : les photos seules ; le nom du fichier sert de nom.
    const photos = galerie.getByRole("list", { name: "Images de l'univers" }).getByRole("listitem");
    await expect(photos).toHaveCount(2);
    await expect(photos.nth(0).getByRole("button")).toHaveAccessibleName(/^carte/);
    await expect(photos.nth(1).getByRole("button")).toHaveAccessibleName(/^affiche/);
    await expect(galerie.getByTestId("gallery-place")).toHaveText("Photos");
    if (process.env.GANIS_E2E_SHOTS) await view().screenshot({ path: `${process.env.GANIS_E2E_SHOTS}/galerie-photos.png` });

    // Onglet « Dossiers » : seulement « Nouveau dossier » ; un seul niveau (pas de sous-dossiers).
    await galerie.getByRole("tab", { name: "Dossiers" }).click();
    await expect(galerie.getByTestId("gallery-place")).toHaveText("Dossiers");
    await expect(galerie.getByRole("button", { name: "Ajouter des images" })).toHaveCount(0);
    await galerie.getByRole("button", { name: "Nouveau dossier" }).click();
    await page.getByRole("dialog").last().getByLabel("Nom du dossier").fill("Cartes");
    await page.getByRole("dialog").last().getByRole("button", { name: "Créer" }).click();
    if (process.env.GANIS_E2E_SHOTS) await view().screenshot({ path: `${process.env.GANIS_E2E_SHOTS}/galerie-dossiers.png` });

    // Dossier système « Logo » (toujours là) : une seule image, le logo du projet.
    await galerie.getByRole("button", { name: "Ouvrir le dossier Logo" }).click();
    await expect(galerie.getByTestId("gallery-place")).toHaveText("Logo");
    await expect(galerie.getByTestId("gallery-folder-count")).toHaveText("0 / 1 image");
    await galerie.getByTestId("gallery-logo-input").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: png });
    await expect(galerie.getByTestId("gallery-logo")).toBeVisible();
    await expect(galerie.getByTestId("gallery-folder-count")).toHaveText("1 / 1 image");
    await expect(galerie.getByRole("button", { name: "Remplacer le logo" })).toBeVisible();
    // Pas de menu … : on ne le renomme pas, on ne le supprime pas.
    await galerie.getByRole("button", { name: "Retour à Dossiers" }).click();
    await expect(galerie.getByRole("button", { name: "Actions du dossier Logo" })).toHaveCount(0);

    // Dans un dossier : son nombre d'images, et « Ajouter des images » y range directement.
    await galerie.getByRole("button", { name: "Ouvrir le dossier Cartes" }).click();
    await expect(galerie.getByTestId("gallery-place")).toHaveText("Cartes");
    await expect(galerie.getByTestId("gallery-folder-count")).toHaveText("0 / 30 images");
    await expect(galerie).toContainText("Ce dossier est vide");
    await expect(galerie.getByRole("button", { name: "Nouveau dossier" })).toHaveCount(0);
    await galerie.getByTestId("gallery-images-input").setInputFiles([{ name: "port.png", mimeType: "image/png", buffer: png }]);
    await expect(photos).toHaveCount(1);
    await expect(galerie.getByTestId("gallery-folder-count")).toHaveText("1 / 30 images");

    // Retour, puis « Sans dossier » : renommer, décrire et ranger une photo.
    await galerie.getByRole("button", { name: "Retour à Dossiers" }).click();
    await galerie.getByRole("button", { name: "Ouvrir le dossier Sans dossier" }).click();
    await expect(photos).toHaveCount(2);
    await photos.nth(0).getByRole("button").click();
    const fenetre = page.getByRole("dialog").last();
    await expect(fenetre.getByTestId("gallery-dialog-image")).toBeVisible();
    if (process.env.GANIS_E2E_SHOTS) await page.screenshot({ path: `${process.env.GANIS_E2E_SHOTS}/galerie-fenetre.png` });
    // La photo tient dans la fenêtre : pas de barre de défilement.
    expect(await fenetre.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
    // On peut la télécharger (fenêtre « Enregistrer sous » du système, pas ouverte ici).
    await expect(fenetre.getByRole("button", { name: "Télécharger" })).toBeVisible();
    // Le formulaire est caché : la photo d'abord ; « Modifier » l'affiche.
    await expect(fenetre.getByLabel("Nom")).toHaveCount(0);
    await fenetre.getByRole("button", { name: "Modifier" }).click();
    await fenetre.getByLabel("Nom").fill("Carte du royaume");
    await fenetre.getByLabel("Dossier").selectOption({ label: "Cartes" });
    await fenetre.getByLabel("Description").fill("Le royaume de Lunéa et ses provinces.");
    await fenetre.getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByText("Image enregistrée.")).toBeVisible();
    // Rangée dans « Cartes », elle quitte « Sans dossier » : sa fenêtre se ferme.
    await expect(fenetre.getByTestId("gallery-dialog-image")).toHaveCount(0);
    await expect(photos).toHaveCount(1);

    await galerie.getByRole("button", { name: "Retour à Dossiers" }).click();
    await galerie.getByRole("button", { name: "Ouvrir le dossier Cartes" }).click();
    await expect(photos).toHaveCount(2);
    await expect(galerie.getByTestId("gallery-folder-count")).toHaveText("2 / 30 images");
    if (process.env.GANIS_E2E_SHOTS) await view().screenshot({ path: `${process.env.GANIS_E2E_SHOTS}/galerie-dossier.png` });

    // Onglet « Photos » : toutes les photos ; glisser la seconde avant la première.
    await galerie.getByRole("tab", { name: "Photos" }).click();
    await expect(photos).toHaveCount(3);
    await photos.nth(1).dragTo(photos.nth(0));
    await expect(photos.nth(0).getByRole("button")).toHaveAccessibleName(/^affiche/);
    await expect(photos.nth(1).getByRole("button")).toHaveAccessibleName(/^Carte du royaume/);

    // Fermer puis rouvrir l'onglet : tout a été enregistré.
    await page.keyboard.press("Control+w");
    await openFeature("Détails", "Galerie");
    await galerie.getByRole("tab", { name: "Dossiers" }).click();
    await galerie.getByRole("button", { name: "Ouvrir le dossier Cartes" }).click();
    await expect(photos).toHaveCount(2);
    await photos.nth(0).getByRole("button").click();
    await page.getByRole("dialog").last().getByRole("button", { name: "Modifier" }).click();
    await expect(page.getByRole("dialog").last().getByLabel("Description")).toHaveValue("Le royaume de Lunéa et ses provinces.");
    await page.getByRole("dialog").last().getByRole("button", { name: "Fermer" }).click();

    // Supprimer « Cartes » : ses photos reviennent dans « Sans dossier ».
    await galerie.getByRole("button", { name: "Retour à Dossiers" }).click();
    await galerie.getByRole("button", { name: "Ouvrir le dossier Cartes" }).hover();
    await galerie.getByRole("button", { name: "Actions du dossier Cartes" }).click();
    await page.getByRole("menuitem", { name: "Supprimer le dossier" }).click();
    await page.getByRole("alertdialog").last().getByRole("button", { name: "Supprimer le dossier" }).click();
    await expect(galerie.getByRole("button", { name: "Ouvrir le dossier Cartes" })).toHaveCount(0);
    await galerie.getByRole("button", { name: "Ouvrir le dossier Sans dossier" }).click();
    await expect(photos).toHaveCount(3);
    await galerie.getByRole("tab", { name: "Photos" }).click();

    // Le logo s'affiche sur l'accueil du projet, à côté de son nom.
    await openFeature("Détails", "Accueil du projet");
    await expect(view().getByTestId("project-logo")).toBeVisible();
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
    await field(fiche, "Âge").fill("27 ans");
    await field(fiche, "Profession / Activité").fill("Cartographe du roi");
    await field(fiche, "Description générale").fill("Une cartographe curieuse, toujours une plume à la main, qui note chaque détour du chemin. https://exemple.fr/une-adresse-tres-longue-sans-aucun-espace-qui-depasserait-largement-la-largeur-du-bloc");
    await save();
    await expect(activeTab()).toContainText("Mirabelle");

    // Bouton œil (à droite de la barre d'onglets, seulement sur une fiche personnage) :
    // l'essentiel à la place des panneaux du formulaire, dans le même onglet.
    // Deux états, deux icônes : « Aperçu de la fiche » (livre), puis « Modifier la fiche » (crayon).
    const oeil = page.getByTestId("preview-toggle");
    await expect(oeil).toHaveAccessibleName(/Aperçu de la fiche/);
    await oeil.click();
    await expect(oeil).toHaveAttribute("aria-pressed", "true");
    await expect(oeil).toHaveAccessibleName(/Modifier la fiche/);
    await expect(fiche.getByTestId("sheet-summary")).toBeVisible();
    await expect(field(fiche, "Prénom")).toHaveCount(0);
    const apercu = fiche.getByTestId("sheet-summary");
    await expect(apercu).toContainText("Cartographe du roi");
    await expect(apercu).toContainText("Une cartographe curieuse");
    // Un texte trop long passe à la ligne : rien ne dépasse vers la droite.
    const debord = await apercu.evaluate((bloc) =>
      Array.from(bloc.querySelectorAll<HTMLElement>("p, dd, dt, span")).some((el) => el.getBoundingClientRect().right > bloc.getBoundingClientRect().right + 1),
    );
    expect(debord).toBe(false);
    if (process.env.GANIS_E2E_SHOTS) await page.screenshot({ path: `${process.env.GANIS_E2E_SHOTS}/apercu-personnage.png` });
    // Par défaut, l'aperçu vaut pour toutes les fiches : Aldric aussi est en aperçu.
    await tabs().getByRole("tab", { name: /Aldric VENN/ }).click();
    await expect(view().getByTestId("sheet-summary")).toBeVisible();
    await expect(page.getByTestId("preview-toggle")).toHaveAttribute("aria-pressed", "true");
    await tabs().getByRole("tab", { name: /Mirabelle/ }).click();
    // Un second clic sur l'œil ramène le formulaire…
    await oeil.click();
    await expect(apercu).toHaveCount(0);
    await expect(field(fiche, "Prénom")).toHaveValue("Mirabelle");
    // … tout comme « Modifier la fiche » dans l'aperçu.
    await oeil.click();
    await apercu.getByRole("button", { name: "Modifier la fiche" }).click();
    await expect(apercu).toHaveCount(0);
    await expect(oeil).toHaveAttribute("aria-pressed", "false");
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
    // La disposition est une liste déroulante dans la barre du haut.
    const layout = view().getByRole("combobox", { name: "Disposition" });
    await layout.selectOption({ label: "Arbre" });
    const root = view().getByRole("combobox", { name: "Arbre de" });
    await root.selectOption({ label: "Aldric VENN" });
    await expect(root).toHaveValue(/.+/);
    await layout.selectOption({ label: "Réseau" });
    await expectSegmentedHeight(view().getByRole("radio", { name: "Graphe" }));
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
    // Une fiche de lieu a aussi son aperçu : l'essentiel à la place du formulaire.
    const bouton = page.getByTestId("preview-toggle");
    await expect(bouton).toHaveAccessibleName(/Aperçu de la fiche/);
    await bouton.click();
    const apercu = view().getByTestId("sheet-summary");
    await expect(apercu).toBeVisible();
    await expect(apercu).toContainText("Port");
    if (process.env.GANIS_E2E_SHOTS) await page.screenshot({ path: `${process.env.GANIS_E2E_SHOTS}/apercu-lieu.png` });
    await bouton.click();
    await expect(apercu).toHaveCount(0);
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

  test("image d'un lieu : la voir en grand, la cadrer, le cadrage s'applique", async () => {
    await openModule("Lieux");
    await features().getByRole("button", { name: /Port-Brume/ }).first().click();
    await expect(activeTab()).toContainText("Port-Brume");

    // Une image en paysage (8 × 4) : dans un cadre carré, on peut la déplacer en largeur.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r+mnAAAARElEQVR4nA3JMQHAQAwDMSMJEiMJEiN5JAZxcxC1WiWJERYrIp6oOCGZMTZrYp6pOf8RJjhsSHih4fJHmeKyJeWVlisfdEwxYUlDjK4AAAAASUVORK5CYII=",
      "base64",
    );
    await view().locator('input[type="file"]').first().setInputFiles({ name: "port.png", mimeType: "image/png", buffer: png });
    const voir = view().getByRole("button", { name: "Voir l'image" });
    await expect(voir).toBeVisible();

    // Un clic l'ouvre en grand, avec Cadrer, Remplacer et Retirer.
    await voir.click();
    // La fenêtre de l'image (et non la bulle d'aide « i », elle aussi une fenêtre).
    const fenetre = page.getByRole("dialog", { name: /^(Image de Port-Brume|Cadrer l'image)$/ });
    await expect(fenetre.getByTestId("image-dialog-full")).toBeVisible();
    const tailleVue = (await fenetre.boundingBox())!;
    await expect(fenetre.getByRole("button", { name: "Remplacer" })).toBeVisible();
    await expect(fenetre.getByRole("button", { name: "Retirer" })).toBeVisible();

    // Cadrer : zoom et déplacement au clavier, puis enregistrer.
    await fenetre.getByRole("button", { name: "Cadrer" }).click();
    const cadre = fenetre.getByTestId("frame-editor");
    // La vue en grand et le cadrage ont la même taille : la fenêtre ne saute pas.
    await expect(cadre).toBeVisible();
    const tailleCadrage = (await fenetre.boundingBox())!;
    expect(Math.abs(tailleCadrage.width - tailleVue.width)).toBeLessThan(2);
    expect(Math.abs(tailleCadrage.height - tailleVue.height)).toBeLessThan(2);
    const apercu = cadre.locator("img");
    const position = async () => Number((await apercu.getAttribute("style"))?.match(/object-position: ([\d.]+)%/)?.[1]);
    const box = (await cadre.boundingBox())!;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    const zoom = async () => Number((await apercu.getAttribute("style"))?.match(/scale\(([\d.]+)\)/)?.[1] ?? 1);
    await page.mouse.move(centre.x, centre.y);

    // Pavé tactile, pincer : le système l'envoie comme une molette avec Ctrl, en petits pas.
    // L'image zoome, et pas la page entière.
    const zoomPage = await page.evaluate(() => window.visualViewport?.scale ?? 1);
    const avantPincer = await zoom();
    await page.keyboard.down("Control");
    for (let i = 0; i < 15; i++) await page.mouse.wheel(0, -3);
    await page.keyboard.up("Control");
    await expect.poll(zoom).toBeGreaterThan(avantPincer * 1.3);
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(zoomPage);

    // Pavé tactile, deux doigts : beaucoup de petits mouvements qui s'additionnent.
    const avantDeuxDoigts = await zoom();
    for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 4);
    await expect.poll(zoom).toBeLessThan(avantDeuxDoigts * 0.8);

    // Zoom au maximum (molette) : c'est là qu'un pixel de souris compte le moins.
    for (let i = 0; i < 25; i++) await page.mouse.wheel(0, -100);
    await expect(apercu).toHaveAttribute("style", /scale\(5\)/);

    // Glisser au clic gauche, pixel par pixel : l'image suit la souris.
    const avant = await position();
    await page.mouse.down();
    for (let i = 1; i <= 30; i++) await page.mouse.move(centre.x + i, centre.y);
    await page.mouse.up();
    // Vers la droite : on découvre la gauche de l'image (le point gardé recule).
    await expect.poll(position).toBeLessThan(avant - 0.5);
    const apresGlisser = await position();

    // Les flèches du clavier déplacent aussi l'image, dans leur sens (← : l'image part à gauche).
    await cadre.focus();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(position).toBeGreaterThan(apresGlisser);

    // Boutons du zoom : à 500 %, « + » est grisé ; un clic sur le pourcentage revient à 100 %…
    const valeur = fenetre.getByTestId("zoom-value");
    await expect(valeur).toHaveText("500 %");
    await expect(fenetre.getByRole("button", { name: /^Zoomer/ })).toBeDisabled();
    await valeur.click();
    await expect(valeur).toHaveText("100 %");
    await expect(fenetre.getByRole("button", { name: /^Dézoomer/ })).toBeDisabled();
    // … puis « + » avance de 10 % en 10 % : 150 % pour la suite.
    for (let i = 0; i < 5; i++) await fenetre.getByRole("button", { name: /^Zoomer/ }).click();
    await expect(valeur).toHaveText("150 %");
    await expect(apercu).toHaveAttribute("style", /scale\(1\.5/);
    // Le mode d'emploi est dans le « i », en haut à côté du titre.
    await expect(fenetre.getByRole("button", { name: "Plus d'informations" })).toBeVisible();
    await fenetre.getByRole("button", { name: "Enregistrer" }).click();
    await expect(fenetre.getByTestId("image-dialog-full")).toBeVisible();
    await fenetre.getByRole("button", { name: "Fermer" }).click();
    await expect(fenetre).toBeHidden();

    // Le cadrage s'applique à l'image de la fiche…
    const image = voir.locator("img");
    await expect(image).toHaveAttribute("style", /scale\(1\.5/);
    // … et dans la liste des lieux.
    await openFeature("Lieux", "Liste des lieux");
    await expect(view().locator('img[style*="scale(1.5"]').first()).toBeVisible();
  });

  test("arborescence : lignes dans la liste, panneau en arbre ou en simple liste", async () => {
    // Port-Brume est situé dans Lunéa.
    await openModule("Lieux");
    await features().getByRole("button", { name: /Port-Brume/ }).first().click();
    await field(view(), "Situé dans").selectOption({ label: "Lunéa" });
    await save();

    // Vue « Liste » : Port-Brume sous Lunéa, relié par une ligne verticale.
    await openFeature("Lieux", "Liste des lieux");
    const liste = view().getByRole("tree");
    await expect(liste.getByRole("treeitem", { level: 2 })).toContainText("Port-Brume");
    await expect(liste.getByRole("treeitem", { level: 2 }).locator("span.absolute.w-px")).toHaveCount(1);
    if (process.env.GANIS_E2E_SHOTS) await liste.screenshot({ path: `${process.env.GANIS_E2E_SHOTS}/liste-arbre.png` });

    // Panneau du milieu : en arborescence par défaut.
    await openModule("Lieux");
    await expect(features().getByRole("treeitem", { name: /Port-Brume/ })).toHaveAttribute("aria-level", "2");

    // Paramètres du projet › Lieux : simple liste dans le panneau.
    await openModule("Paramètres du projet");
    await features().getByRole("button", { name: "Lieux", exact: true }).click();
    const reglage = view().getByRole("switch", { name: "Panneau du milieu en arborescence" });
    await expect(reglage).toHaveAttribute("aria-checked", "true");
    await reglage.click();
    await expect(reglage).toHaveAttribute("aria-checked", "false");

    await openModule("Lieux");
    await expect(features().getByRole("treeitem")).toHaveCount(0);
    await expect(features().getByRole("button", { name: "Port-Brume", exact: true })).toBeVisible();
    if (process.env.GANIS_E2E_SHOTS) await features().screenshot({ path: `${process.env.GANIS_E2E_SHOTS}/panneau-liste.png` });
    // La vue « Liste » garde son arborescence.
    await openFeature("Lieux", "Liste des lieux");
    await expect(view().getByRole("tree").getByRole("treeitem", { level: 2 })).toContainText("Port-Brume");

    // Retour à l'arborescence (le réglage par défaut) pour la suite.
    await openModule("Paramètres du projet");
    await features().getByRole("button", { name: "Lieux", exact: true }).click();
    await view().getByRole("switch", { name: "Panneau du milieu en arborescence" }).click();
    await openModule("Lieux");
    await expect(features().getByRole("treeitem", { name: /Port-Brume/ })).toHaveAttribute("aria-level", "2");
    if (process.env.GANIS_E2E_SHOTS) await features().screenshot({ path: `${process.env.GANIS_E2E_SHOTS}/panneau-arbre.png` });
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
    // « Par trame » : la liste des trames apparaît (après l'interrupteur pas à pas / continu).
    await view().getByRole("tab", { name: "Par trame" }).click();
    await expect(view().getByRole("combobox", { name: "Trame à parcourir" })).toBeVisible();
    if (process.env.GANIS_E2E_SHOTS) await view().screenshot({ path: `${process.env.GANIS_E2E_SHOTS}/lecture-par-trame.png` });
    await expectSegmentedHeight(view().getByRole("tab", { name: "Par trame" }));
    await view().getByRole("tab", { name: "Par plan" }).click();
  });

  test("manuscrit, suivi de rédaction et dossier éditorial (roman)", async () => {
    for (const feature of ["Manuscrit", "Suivi de rédaction", "Dossier éditorial", "Rechercher et remplacer"]) {
      await openFeature("Manuscrit", feature);
      await expect(tabs().getByRole("tab", { name: new RegExp(feature) })).toBeVisible();
      await expect(page.getByText("Une erreur")).toHaveCount(0);
    }
  });

  test("continuité : l'état d'un personnage dans une scène, puis son parcours", async () => {
    await openModule("Découpage");
    await features().getByRole("button", { name: /La lettre/ }).first().click();
    await expect(activeTab()).toContainText("La lettre");

    await view().getByRole("button", { name: "Ajouter un lien" }).click();
    await page.getByRole("menuitem", { name: "Personnages" }).click();
    const dialog = page.getByRole("dialog").last();
    await dialog.getByLabel("Personnages").selectOption({ label: "Aldric VENN" });
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dialog).toBeHidden();

    const etat = view().getByLabel("État de Aldric VENN");
    await etat.fill("Blessé à l'épaule");
    await etat.press("Enter");
    await page.waitForTimeout(300);

    // Roman : la continuité est dans le Manuscrit, pas en double dans le Découpage.
    await openModule("Découpage");
    await expect(features().getByRole("button", { name: /^Continuité/ })).toHaveCount(0);
    await openFeature("Manuscrit", "Continuité");
    const parcours = view().getByTestId("continuity-path");
    await expect(parcours).toContainText("La lettre");
    await expect(parcours).toContainText("Blessé à l'épaule");
    if (process.env.GANIS_E2E_SHOTS) await page.screenshot({ path: `${process.env.GANIS_E2E_SHOTS}/continuite-roman.png` });
    await view().getByRole("tab", { name: "Tableau des présences" }).click();
    // La scène de ce projet est à la racine du plan, hors de tout chapitre : colonnes par scène.
    await view().getByLabel("Colonnes").selectOption({ label: "Scènes" });
    await expect(view().getByTestId("presence-table")).toContainText("Aldric VENN");
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

    // « Plus d'outils » (…) : s'ouvre, se ferme et se rouvre sans faire planter l'onglet.
    const plus = view().getByRole("button", { name: "Plus d'outils" });
    await plus.click();
    await plus.click();
    await plus.click();
    await view().getByRole("menuitem", { name: "Lien" }).click();
    await expect(view().getByLabel("Adresse du lien").or(view().getByPlaceholder("https://…"))).toBeVisible();
    // Le menu (avec le champ du lien) reste dans la zone de la note.
    const zone = await view().locator(".note-editor").first().boundingBox();
    const menu = await view().locator(".note-editor [role=menu]").first().boundingBox();
    expect(zone && menu).toBeTruthy();
    expect(menu!.x).toBeGreaterThanOrEqual(zone!.x);
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(zone!.x + zone!.width + 0.5);
    await page.keyboard.press("Escape");
    await plus.click();
    await expect(view().getByRole("menuitemcheckbox", { name: "Citation" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByText("Cet onglet n'a pas pu s'afficher")).toHaveCount(0);

    // Clic droit dans le texte : le menu de l'app (pas celui du navigateur).
    await editeur.click({ button: "right" });
    const edition = page.getByRole("menu", { name: "Édition" });
    await expect(edition).toBeVisible();
    for (const action of ["Couper", "Copier", "Coller", "Tout sélectionner"]) {
      await expect(edition.getByRole("menuitem", { name: action })).toBeVisible();
    }
    await edition.getByRole("menuitem", { name: "Tout sélectionner" }).click();
    await expect(edition).toHaveCount(0);
    // Texte sélectionné : Copier devient possible.
    await editeur.click({ button: "right" });
    await expect(page.getByRole("menu", { name: "Édition" }).getByRole("menuitem", { name: "Copier" })).toBeEnabled();
    await page.keyboard.press("Escape");
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
      // La liste des types s'affiche un instant après « Continuer » : on l'attend (si le module en propose).
      await type.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
      if (await type.isVisible().catch(() => false)) {
        // Une vraie option (pas l'intitulé « Choisir parmi N types… », sans valeur).
        const valeur = await type.locator('option:not([disabled]):not([value=""])').first().getAttribute("value");
        if (valeur) await type.selectOption(valeur);
      }
      await field(view(), "Nom").fill(nom);
      await view().getByRole("button", { name: /^Créer/ }).last().click();
      await expect(activeTab()).toContainText(nom);
      // Chaque fiche du monde a aussi son aperçu (livre / crayon).
      const bouton = page.getByTestId("preview-toggle");
      await bouton.click();
      await expect(view().getByTestId("sheet-summary")).toBeVisible();
      await bouton.click();
      await expect(view().getByTestId("sheet-summary")).toHaveCount(0);
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
    await openFeature("Scénario", "Chemin de fer");
    await expectSegmentedHeight(view().getByRole("radio", { name: "Scénario et dessin" }));
  });

  test("continuité du manga : case par case et tableau des présences", async () => {
    await openFeature("Scénario", "Continuité");
    await view().getByRole("tab", { name: "Tableau des présences" }).click();
    await expect(view().getByLabel("Colonnes")).toBeVisible();
    await expect(page.getByText(/Une erreur (est survenue|d'affichage)/)).toHaveCount(0);
    await view().getByRole("tab", { name: "Case par case" }).click();
    await expect(view().getByLabel("Personnage")).toBeVisible();
    if (process.env.GANIS_E2E_SHOTS) await page.screenshot({ path: `${process.env.GANIS_E2E_SHOTS}/continuite-scenario.png` });
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
// Série : scénario d'une scène, fiche d'un épisode, lecture et suivi
// ---------------------------------------------------------------------------

test.describe("Série", () => {
  test("créer un projet série : le module Scénario remplace le Manuscrit", async () => {
    await go("/dashboard");
    await createProject(SERIE, "Série");
    await expect(modules().getByRole("button", { name: "Scénario" })).toBeVisible();
    await expect(modules().getByRole("button", { name: "Manuscrit" })).toHaveCount(0);
  });

  test("découpage : une saison, un épisode et une scène", async () => {
    await openFeature("Découpage", "Plan du récit");
    await view().getByRole("button", { name: "Ajouter : Saison" }).first().click();
    await expect(features().getByRole("treeitem", { name: "Saison 1" })).toBeVisible();
    // Chaque élément est créé dans la fiche de son parent : l'épisode dans la
    // saison, la scène dans l'épisode.
    for (const [parent, enfant] of [["Saison 1", "Épisode"], ["Épisode 1", "Scène"]]) {
      await features().getByRole("button", { name: parent }).click();
      await expect(activeTab()).toContainText(parent);
      await view().getByRole("button", { name: `Ajouter : ${enfant}` }).last().click();
      await expect(features().getByRole("treeitem", { name: `${enfant} 1` })).toBeVisible();
    }
  });

  test("scénario d'une scène : en-tête, action et réplique", async () => {
    await features().getByRole("button", { name: "Scène 1" }).click();
    await expect(activeTab()).toContainText("Scène 1");
    await view().getByLabel("Int. / Ext.").selectOption({ label: "Ext." });
    await view().getByLabel("Moment").selectOption({ label: "Nuit" });
    await expect(view().getByTestId("scene-heading")).toHaveText("EXT. — NUIT");

    await view().getByRole("button", { name: "Action", exact: true }).click();
    await view().getByLabel("Action", { exact: true }).last().fill("La pluie fouette le phare.");
    await page.keyboard.press("Control+Enter");
    await view().getByLabel("Action", { exact: true }).last().fill("Une silhouette approche.");
    await view().getByRole("button", { name: "Réplique", exact: true }).click();
    await view().getByLabel("Réplique", { exact: true }).last().fill("Qui va là ?");
    await save();
    await expect(view()).toContainText(/≈/);
  });

  test("fiche de l'épisode : logline et durée visée", async () => {
    await features().getByRole("button", { name: "Épisode 1" }).click();
    await expect(activeTab()).toContainText("Épisode 1");
    await view().getByLabel("Logline").fill("Le gardien du phare reçoit une visite.");
    await view().getByLabel("Durée visée (minutes)").fill("52");
    await view().getByLabel("Durée visée (minutes)").press("Enter");
    await view().getByRole("radio", { name: "1re version" }).click();
    await expect(view().getByRole("radio", { name: "1re version" })).toHaveAttribute("aria-checked", "true");
    await expect(view()).toContainText("1 scène écrite sur 1.");
  });

  test("lecture du scénario et suivi des épisodes", async () => {
    await openFeature("Scénario", "Lecture du scénario");
    const script = view().getByTestId("series-script");
    await expect(script).toContainText("EXT. — NUIT");
    await expect(script).toContainText("La pluie fouette le phare.");
    await expect(script).toContainText("Qui va là ?");
    await expect(view().getByRole("button", { name: "Exporter" })).toBeVisible();

    await openFeature("Scénario", "Continuité");
    await expect(view().getByRole("tab", { name: "Parcours d'un personnage" })).toBeVisible();
    await expect(page.getByText(/Une erreur (est survenue|d'affichage)/)).toHaveCount(0);

    await openFeature("Scénario", "Suivi des épisodes");
    await expect(view()).toContainText("Épisode 1");
    await expect(view()).toContainText("Le gardien du phare reçoit une visite.");
    await expect(view()).toContainText("1 / 1");
    await expect(page.getByText(/Une erreur (est survenue|d'affichage)/)).toHaveCount(0);
  });

  test("la recherche globale trouve le texte d'une scène", async () => {
    await page.getByRole("button", { name: "Rechercher dans le projet" }).click();
    const recherche = features().getByRole("searchbox", { name: /Rechercher dans le projet/ });
    await recherche.fill("silhouette");
    await expect(features()).toContainText("Scène 1");
    await recherche.fill("qui va la");
    await expect(features()).toContainText("Scène 1");
  });

  test("outils de la série : échéance, temps de parole, bible, tableau, dépouillement, import", async () => {
    await openFeature("Découpage", "Plan du récit");
    await features().getByRole("button", { name: "Épisode 1" }).click();
    await view().getByLabel("Échéance").fill("2020-01-15");
    await expect(view()).toContainText("Échéance dépassée");

    await openFeature("Scénario", "Suivi des épisodes");
    await expect(view()).toContainText("15/01/2020");
    await expect(view().getByTestId("speaking-stats")).toBeVisible();
    await expect(view().getByTestId("film-beats")).toHaveCount(0);
    await expect(view().getByRole("button", { name: "Exporter la bible" })).toBeVisible();

    await openFeature("Scénario", "Tableau de liège");
    await expect(view().getByTestId("scene-board")).toContainText("EXT. — NUIT");
    await openFeature("Scénario", "Dépouillement");
    await expect(view().getByTestId("breakdown-scenes")).toContainText("1.1");
    await openFeature("Scénario", "Importer un scénario");
    await expect(view().getByRole("button", { name: /Choisir un scénario/ })).toBeVisible();

    // Lecture : numéros épisode.scène, révisions comme pour un film.
    await openFeature("Scénario", "Lecture du scénario");
    await expect(view().getByTestId("series-script")).toContainText(/1\.1\s*EXT\. — NUIT/);
    await expect(view().getByRole("button", { name: "Révisions" })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Film : scénario des scènes, fiche du film, lecture et suivi du film
// ---------------------------------------------------------------------------

test.describe("Film", () => {
  test("créer un projet film : son module Scénario remplace la lecture générique", async () => {
    await go("/dashboard");
    await createProject(FILM, "Film");
    await expect(modules().getByRole("button", { name: "Scénario" })).toBeVisible();
    await openFeature("Découpage", "Plan du récit");
    await expect(features().getByRole("button", { name: /^Lecture complète/ })).toHaveCount(0);
  });

  test("découpage : un acte, une séquence et une scène", async () => {
    await view().getByRole("button", { name: "Ajouter : Acte" }).first().click();
    await expect(features().getByRole("treeitem", { name: "Acte 1" })).toBeVisible();
    for (const [parent, enfant] of [["Acte 1", "Séquence"], ["Séquence 1", "Scène"]]) {
      await features().getByRole("button", { name: parent }).click();
      await expect(activeTab()).toContainText(parent);
      await view().getByRole("button", { name: `Ajouter : ${enfant}` }).last().click();
      await expect(features().getByRole("treeitem", { name: `${enfant} 1` })).toBeVisible();
    }
  });

  test("scénario d'une scène et avancement de la séquence", async () => {
    await features().getByRole("button", { name: "Scène 1" }).click();
    await expect(activeTab()).toContainText("Scène 1");
    await view().getByLabel("Int. / Ext.").selectOption({ label: "Int." });
    await view().getByLabel("Moment").selectOption({ label: "Jour" });
    await expect(view().getByTestId("scene-heading")).toHaveText("INT. — JOUR");
    await view().getByRole("button", { name: "Action", exact: true }).click();
    await view().getByLabel("Action", { exact: true }).last().fill("La cuisine s'éveille avant l'aube.");
    await save();

    await features().getByRole("button", { name: "Séquence 1" }).click();
    await expect(activeTab()).toContainText("Séquence 1");
    await expect(view()).toContainText("Avancement de la séquence");
    // Logline et scénariste sont ceux du film entier, pas de la séquence.
    await expect(view().getByLabel("Logline")).toHaveCount(0);
    await view().getByRole("radio", { name: "1re version" }).click();
    await expect(view().getByRole("radio", { name: "1re version" })).toHaveAttribute("aria-checked", "true");
    await expect(view()).toContainText("1 scène écrite sur 1.");
  });

  test("suivi du film : fiche du film et durée par acte", async () => {
    await openFeature("Scénario", "Suivi du film");
    await expect(view()).toContainText("Fiche du film");
    await view().getByLabel("Logline").fill("Une cheffe doit sauver son restaurant en une nuit.");
    await view().getByLabel("Scénariste").fill("Auteur E2E");
    await view().getByLabel("Durée visée (minutes)").fill("100");
    await view().getByLabel("Durée visée (minutes)").press("Enter");
    await expect(view()).toContainText("Acte 1");
    await expect(view()).toContainText("% du film");
    await expect(view()).toContainText("1 séquence");
    await expect(page.getByText(/Une erreur (est survenue|d'affichage)/)).toHaveCount(0);
  });

  test("lecture du scénario : page de titre et scènes numérotées", async () => {
    await openFeature("Scénario", "Lecture du scénario");
    const titre = view().getByTestId("film-title");
    await expect(titre).toContainText(FILM);
    await expect(titre).toContainText("Écrit par Auteur E2E");
    await expect(titre).toContainText("Une cheffe doit sauver son restaurant en une nuit.");
    const script = view().getByTestId("series-script");
    // Numéro de scène des deux côtés de l'en-tête, comme sur la page imprimée.
    await expect(script).toContainText(/1\s*INT\. — JOUR\s*1/);
    await expect(script).toContainText("La cuisine s'éveille avant l'aube.");
    await expect(view().getByRole("button", { name: "Exporter" })).toBeVisible();

    await openFeature("Scénario", "Continuité");
    await expect(view().getByRole("tab", { name: "Parcours d'un personnage" })).toBeVisible();
    await expect(page.getByText(/Une erreur (est survenue|d'affichage)/)).toHaveCount(0);
  });

  test("la fiche du film est conservée", async () => {
    await openFeature("Détails", "Accueil du projet");
    await openFeature("Scénario", "Suivi du film");
    await expect(view().getByLabel("Logline")).toHaveValue("Une cheffe doit sauver son restaurant en une nuit.");
    await expect(view().getByLabel("Durée visée (minutes)")).toHaveValue("100");
    // Repères de structure et temps de parole.
    await expect(view().getByTestId("film-beats")).toBeVisible();
    await view().getByLabel("Premier pivot").selectOption({ index: 1 });
    await expect(view().getByTestId("film-beats")).toContainText(/Trop tôt|Bien placé|Trop tard/);
    await expect(view().getByTestId("speaking-stats")).toBeVisible();
  });

  test("dossier du film : pitch et note d'intention dans la fiche du film, export du dossier", async () => {
    await openFeature("Scénario", "Suivi du film");
    await view().getByLabel("Pitch").fill("Une nuit pour sauver un restaurant.");
    await view().getByLabel("Note d'intention").fill("Filmer une cuisine comme un champ de bataille.");
    await view().getByLabel("Note d'intention").blur();
    await expect(view().getByRole("button", { name: "Exporter le dossier" })).toBeVisible();
    await openFeature("Détails", "Accueil du projet");
    await openFeature("Scénario", "Suivi du film");
    await expect(view().getByLabel("Pitch")).toHaveValue("Une nuit pour sauver un restaurant.");
    // Plus d'onglet « Dossier du film » : il ferait doublon avec la fiche du film.
    await expect(features().getByRole("button", { name: /^Dossier du film/ })).toHaveCount(0);
  });

  test("dépouillement et plan de travail", async () => {
    await openFeature("Scénario", "Dépouillement");
    const scenes = view().getByTestId("breakdown-scenes");
    await scenes.getByRole("button", { name: /INT\. — JOUR/ }).click();
    await scenes.getByLabel("Figurants").fill("Vingt commis");
    await scenes.getByLabel("Figurants").blur();
    await expect(scenes).toContainText("1 champ");
    await view().getByRole("tab", { name: "Plan de travail" }).click();
    await expect(view().getByTestId("shooting-schedule")).toContainText("JOUR");
  });

  test("tableau de liège et révisions de tournage", async () => {
    await openFeature("Scénario", "Tableau de liège");
    await expect(view().getByTestId("scene-board")).toContainText("INT. — JOUR");

    await openFeature("Scénario", "Lecture du scénario");
    await expect(view().getByTestId("runtime-estimate")).toContainText("Durée estimée");
    await view().getByRole("button", { name: "Révisions" }).click();
    await page.getByRole("menuitem", { name: "Verrouiller les numéros de scène" }).click();
    await view().getByRole("button", { name: "Révisions" }).click();
    await page.getByRole("menuitem", { name: /Nouvelle révision/ }).click();
    await expect(view().getByTestId("revision-bar")).toContainText("Révision bleue");
    await expect(view().getByTestId("revision-bar")).toContainText("Numéros verrouillés");
  });

  test("importer un scénario Fountain", async () => {
    await openFeature("Scénario", "Importer un scénario");
    const fountain = "Title: Import E2E\n\nEXT. TERRASSE - NUIT\n\nLe service est fini.\n\nNINO\nOn ferme ?\n";
    await view().locator('input[type="file"]').setInputFiles({ name: "import.fountain", mimeType: "text/plain", buffer: Buffer.from(fountain) });
    await expect(view().getByTestId("import-preview")).toContainText("1 scène trouvée.");
    await expect(view().getByTestId("import-preview")).toContainText("Nino (nouveau)");
    await view().getByRole("button", { name: "Importer", exact: true }).click();
    await expect(view().getByRole("status")).toContainText("Import terminé");
    await view().getByRole("button", { name: "Lire le scénario" }).click();
    await expect(view().getByTestId("series-script")).toContainText("EXT. TERRASSE — NUIT");
    await expect(view().getByTestId("series-script")).toContainText("On ferme ?");
    // Ajoutée après le verrouillage : elle prend une lettre.
    await expect(view().getByTestId("series-script")).toContainText("1A");
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
    // Les paramètres s'ouvrent par-dessus l'espace de travail : son onglet
    // actif (une page avec sa propre zone principale) reste dessous.
    const main = page.getByRole("main").first();
    await expect(main).toContainText(/Compte|Apparence/);
    for (const section of ["Compte", "Apparence", "Enregistrement"]) {
      const lien = page.getByRole("button", { name: new RegExp(section) }).or(page.getByRole("tab", { name: new RegExp(section) })).first();
      if (await lien.isVisible().catch(() => false)) {
        await lien.click();
        await expect(main).toContainText(section);
      }
    }

    // Apparence : aperçu des fiches personnage pour toutes (par défaut) ou fiche par fiche.
    const apparence = page.getByRole("button", { name: /Apparence/ }).or(page.getByRole("tab", { name: /Apparence/ })).first();
    if (await apparence.isVisible().catch(() => false)) await apparence.click();
    const parFiche = page.getByRole("switch", { name: "Aperçu fiche par fiche" });
    await expect(parFiche).toHaveAttribute("aria-checked", "false");
    await parFiche.click();
    await expect(parFiche).toHaveAttribute("aria-checked", "true");
    await parFiche.click();
    await expect(parFiche).toHaveAttribute("aria-checked", "false");
  });

  test("compte : profil d'auteur enregistré et affiché", async () => {
    await go("/settings");
    const main = page.getByRole("main").first();
    const compte = page.getByRole("button", { name: /Compte/ }).or(page.getByRole("tab", { name: /Compte/ })).first();
    if (await compte.isVisible().catch(() => false)) await compte.click();

    await page.getByLabel("Nom d'auteur").fill("C. Durand");
    await page.getByLabel("Biographie").fill("Autrice de romans policiers.");
    await page.getByRole("button", { name: "Enregistrer" }).first().click();
    await expect(page.getByText("Profil d'auteur enregistré.")).toBeVisible();
    // Repris dans « Informations du compte ».
    await expect(main).toContainText("C. Durand");
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
    await page.getByLabel("Nom d'utilisateur").fill(FIRST.username);
    await page.getByLabel("Mot de passe", { exact: true }).fill("mauvais-mdp9");
    await page.locator("form").getByRole("button", { name: /Se connecter/ }).click();
    await expect(page.getByRole("alert").or(page.getByText(/incorrect|invalide/i)).first()).toBeVisible();
    await expect(page).toHaveURL(/#\/login/);
  });

  test("connexion du premier compte : ses projets privés sont là", async () => {
    await login();
    // Recherche : le tableau de bord n'affiche que les derniers projets ouverts
    // (le roman n'en fait plus partie depuis la série et le film).
    const recherche = page.getByRole("textbox", { name: "Rechercher un projet" });
    for (const nom of [ROMAN, MANGA]) {
      await recherche.fill(nom);
      await expect(page.getByRole("main").getByText(nom, { exact: true }).first()).toBeVisible();
    }
    await recherche.fill("");
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

  test("créer un second compte : il ne voit pas les projets du premier compte", async () => {
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
    await page.getByLabel("Nom d'utilisateur").fill(FIRST.username);
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
