<p align="center">
  <img src="ganis-icon.png" alt="Logo GANIS" width="96" />
</p>

<h1 align="center">GANIS</h1>

<p align="center"><strong>Studio de conception narrative — local, hors ligne, chiffré.</strong></p>

<p align="center">
  Tauri 2 · Rust · React 19 · TypeScript · SQLite / SQLCipher
</p>

---

GANIS est une application de bureau pour concevoir des récits : romans, mangas, films, séries, jeux vidéo, jeux de rôle… Elle réunit en un seul espace de travail les personnages, les lieux, les relations, le découpage du récit, la trame des intrigues, les notes et les documents de travail.

Tout reste sur l'ordinateur de l'utilisateur. GANIS fonctionne **sans connexion internet** et **chiffre** chaque projet avec une clé qui lui est propre.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Sécurité et confidentialité](#sécurité-et-confidentialité)
- [Démarrage rapide](#démarrage-rapide)
- [Scripts disponibles](#scripts-disponibles)
- [Architecture](#architecture)
- [Arborescence du dépôt](#arborescence-du-dépôt)
- [Données et fichiers](#données-et-fichiers)
- [Format `.ganix`](#format-ganix)
- [Tests](#tests)
- [Internationalisation](#internationalisation)
- [Contribuer](#contribuer)
- [Dépannage](#dépannage)
- [Licences tierces](#licences-tierces)

---

## Fonctionnalités

### Comptes et projets

- **Comptes locaux** : un administrateur est créé au premier lancement, puis d'autres comptes peuvent s'inscrire. Il existe trois rôles : `admin`, `developer` et `user`.
- **Clé de récupération** : elle est remise à la création du compte et permet de retrouver l'accès en cas de mot de passe oublié. Elle peut être régénérée depuis les paramètres.
- **Tableau de bord** : création, duplication, suppression et favoris de projets.
  - Types de projet : manga, roman, film, série, jeu, JDR, personnalisé.
  - Statuts : en préparation, en cours, en pause, terminé.
- **Calendrier de travail** : il retrace le rythme d'écriture à partir de l'activité réelle sur les projets.

### Espace de travail d'un projet

L'espace de travail reprend le modèle d'un éditeur de code : une barre d'activité à gauche, un panneau latéral et une zone centrale à onglets.

| Module | Contenu |
|---|---|
| **Détails** | Accueil du projet, synopsis, historique, corbeille |
| **Personnages** | Fiches à niveau de détail réglable, portrait, galerie, champs personnalisés, lieux associés |
| **Relations** | Liens entre personnages (types et couleurs), graphe interactif aux positions mémorisées |
| **Lieux** | Fiches hiérarchiques (un lieu peut en contenir d'autres), types personnalisés, portrait, galerie légendée |
| **Découpage** | Plan du récit en 1 à 5 niveaux (parties, chapitres, scènes…), numérotation automatique ou manuelle, couleurs par niveau, liens vers les personnages et les lieux |
| **Trame** | Plateau des intrigues parallèles avec vue de lecture et visite guidée |
| **Notes** | Éditeur riche (Tiptap) : tableaux, encadrés, diagrammes, chaînes, mentions de personnages et de lieux, correcteur orthographique ; dossiers, mur de post-it, notes système synchronisées avec les fiches |
| **Documents** | Fichiers rangés dans le découpage (PDF, Word, images, textes, sons, vidéos, pages de manga…), lecture intégrée, modification dans l'application associée avec reprise automatique, 20 versions par document |
| **Recherche** | Recherche globale insensible à la casse et aux accents, palette de commandes (`Ctrl+K`) |
| **Paramètres** | Réglages propres au projet (personnages, lieux, découpage, trame, notes) |

Les modèles de découpage proposés sont les suivants :

| Modèle | Niveau 0 | Niveau 1 | Niveau 2 |
|---|---|---|---|
| Roman | Partie | Chapitre | Scène |
| Manga | Tome | Chapitre | Page |
| Film | Acte | Séquence | Scène |
| Série | Saison | Épisode | Scène |
| Jeu | Acte | Quête | Mission |
| JDR | Scénario | Session | Rencontre |
| Générique | Partie | Section | Élément |

### Historique et sécurité des données

- **Journal d'activité** : il est conservé 90 jours.
- **Versions automatiques** : une version est prise au début de chaque séance de modification, au plus une toutes les 10 minutes et 50 par élément. Les versions manuelles sont aussi possibles. Restaurer une version garde d'abord l'état actuel.
- **Corbeille** : les éléments supprimés sont restaurés avec tout ce qui en dépendait (images, relations, liens).
- **Garde des modifications non enregistrées** : l'application pose la question avant de quitter ou de fermer un onglet modifié.

### Personnalisation

- **Thèmes** : clair, sombre et thèmes système.
- **Packages** : en mode développeur, un éditeur de thème permet de créer ses propres thèmes. Ils sont déclaratifs (couleurs hexadécimales et arrondi uniquement) et validés côté Rust.
- **Langue** : français et anglais.
- **Raccourcis clavier** :

  | Action | Raccourci |
  |---|---|
  | Nouveau | `Ctrl+N` |
  | Enregistrer | `Ctrl+S` |
  | Tout enregistrer | `Ctrl+Alt+S` |
  | Fermer l'onglet | `Ctrl+W` / `Ctrl+F4` |
  | Onglet suivant / précédent | `Ctrl+Tab` / `Ctrl+Maj+Tab` |
  | Palette de commandes | `Ctrl+K` |
  | Centre d'aide | `F1` |
  | Liste des raccourcis | `Ctrl+/` |

---

## Sécurité et confidentialité

GANIS a été pensé pour qu'une copie du dossier de données ne révèle rien du contenu des projets.

### Organisation des clés

```text
mot de passe ──(Argon2id)──┐
                           ├─► verrous ─► clé du compte ─┬─► clé du projet A ─► project.db (SQLCipher)
clé de récupération ───────┘                             ├─► clé du projet B ─► project.db (SQLCipher)
                                                         └─► e-mail, nom et description des projets
```

- **Clé du compte** : 256 bits aléatoires, jamais écrite en clair. Elle est enfermée dans des *verrous* (`user_key_slots`) : un pour le mot de passe, un pour la clé de récupération. Changer l'un des deux ne remplace qu'un verrou, sans rechiffrer les données.
- **Clé de projet** : une clé distincte par projet, enfermée par la clé du compte. Elle chiffre toute la base du projet avec **SQLCipher**.
- **Champs sensibles de `app.db`** : l'e-mail, ainsi que le nom et la description des projets, sont chiffrés champ par champ avec **XChaCha20-Poly1305**. Un contexte (AAD) lie chaque valeur à sa table, sa colonne et sa ligne.
- **En mémoire** : la clé du compte n'existe que pendant la session et est effacée à la déconnexion (`zeroize`).

### Ce qui reste lisible

Le nom d'utilisateur, l'empreinte du mot de passe (Argon2id, irréversible), le rôle, les dates, le type, le statut et le favori des projets, et les thèmes créés restent lisibles. Ces informations sont nécessaires à la connexion ou sans valeur pour un tiers.

### Autres protections

| Mesure | Détail |
|---|---|
| Mots de passe | Argon2id ; paramètres enregistrés avec chaque verrou pour pouvoir les renforcer plus tard |
| Clé de récupération | 6 groupes de 6 caractères (Crockford base 32, 180 bits), saisie tolérante, vérification d'un groupe tiré au hasard à l'affichage |
| Tentatives de connexion | 5 échecs tolérés, puis blocage de 30 s doublé à chaque échec, jusqu'à 15 min maximum ; compteur séparé pour la récupération ; noms inconnus traités comme les autres |
| Interface | CSP stricte (`default-src 'self'`), aucun accès réseau, HTML des notes nettoyé |
| Droits | Le rôle est vérifié par Rust à chaque commande ; l'interface ne fait que le refléter |
| Fichiers temporaires | Copies de documents ouvertes à l'extérieur supprimées en fin d'usage et au démarrage ; fichiers effacés par écrasement avant suppression |
| Journaux | Rotation quotidienne, 14 jours conservés ; jamais de mot de passe, de jeton ni de contenu narratif |

Pour le détail, voir [`src-tauri/src/security/mod.rs`](src-tauri/src/security/mod.rs) et [`LISEZ-MOI-chiffrement.md`](LISEZ-MOI-chiffrement.md).

> ⚠️ **Sans mot de passe ni clé de récupération, les données sont irrécupérables.** C'est voulu : il n'existe aucune porte dérobée.

---

## Démarrage rapide

### Prérequis

| Outil | Version |
|---|---|
| [Node.js](https://nodejs.org) | 20 LTS ou plus récent |
| [Rust](https://rustup.rs) | stable (édition 2021) |
| Dépendances système Tauri 2 | voir [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/) |
| **Windows uniquement** : [Strawberry Perl](https://strawberryperl.com) | nécessaire pour compiler OpenSSL (SQLCipher) |

Sous Linux, il faut notamment `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, `librsvg2-dev` et `libayatana-appindicator3-dev`. Sous macOS, les outils en ligne de commande Xcode suffisent.

### Installation

```bash
git clone <url-du-dépôt> ganis
cd ganis
npm install
```

### Lancer en développement

```bash
npm run tauri dev
```

Le premier lancement est long (plusieurs minutes), car SQLCipher et OpenSSL sont compilés avec l'application. Les suivants sont incrémentaux.

Au premier démarrage, GANIS ouvre l'écran **Configuration** pour créer le compte administrateur.

### Construire l'application

```bash
npm run tauri build
```

Les installateurs sont produits dans `src-tauri/target/release/bundle/` : `.msi` et `.exe` sous Windows, `.dmg` et `.app` sous macOS, `.deb`, `.rpm` et `.AppImage` sous Linux. Le profil `release` active LTO, `strip` et `panic = "abort"` pour un binaire léger.

---

## Scripts disponibles

| Commande | Rôle |
|---|---|
| `npm run tauri dev` | Application complète en développement (Vite + Rust, rechargement à chaud) |
| `npm run tauri build` | Build de production et installateurs |
| `npm run dev` | Front-end seul sur `http://localhost:1420` (sans les commandes Rust) |
| `npm run build` | Vérification TypeScript (`tsc`) puis build Vite dans `dist/` |
| `npm run preview` | Prévisualisation du build front-end |
| `npm test` | Tests unitaires front-end (Vitest, dossier `src/`) |
| `cd src-tauri && cargo test --lib` | Tests Rust (services, chiffrement, migrations) |
| `npx playwright test` | Tests de bout en bout (voir [Tests](#tests)) |

---

## Architecture

```text
┌──────────────────────────────── Fenêtre Tauri (WebView) ────────────────────────────────┐
│  React 19 + React Router                                                                 │
│  ├── pages/        écrans (Welcome, Login, Dashboard, Workspace, Settings…)              │
│  ├── components/   modules de l'espace de travail, UI (shadcn / Base UI, Tailwind 4)     │
│  ├── stores/       état par domaine (Zustand)                                            │
│  └── lib/api.ts    unique point d'appel des commandes Rust (invoke)                      │
└───────────────────────────────────────────┬──────────────────────────────────────────────┘
                                            │ IPC Tauri (commandes typées)
┌───────────────────────────────────────────▼──────────────────────────────────────────────┐
│  Rust (src-tauri/src)                                                                    │
│  ├── commands/     fines couches d'entrée : session, droits, puis appel du service       │
│  ├── services/     logique métier (un service par domaine)                               │
│  ├── security/     primitives crypto, clé de récupération, contextes AAD                 │
│  ├── db/           app.db, bases de projet, migrations embarquées (sqlx::migrate!)       │
│  ├── models/       types partagés (User, Project, Package…)                              │
│  └── state.rs      AppState : pool app.db, pools des projets, session, clé du compte     │
└───────────────────────────────────────────┬──────────────────────────────────────────────┘
                                            │
                     app.db (SQLite)  +  projets/<uuid>/project.db (SQLCipher)
```

### Principes

- **Rust fait autorité** : toute validation (droits, tailles, formats, couleurs de thème…) est faite côté Rust. Les vérifications de l'interface ne servent qu'au confort.
- **Une base par projet** : chaque projet est isolé dans son propre fichier chiffré. Seul `services::project_storage` ouvre ces bases, avec un pool unique par projet.
- **Migrations embarquées** : les fichiers SQL de `src-tauri/migrations/` sont compilés dans le binaire. `build.rs` force la recompilation quand un fichier est ajouté.
- **Registre de modules** : `src/components/workspace/modules.ts` décrit les modules et fonctionnalités de l'espace de travail. La barre d'activité, le panneau latéral et les onglets le lisent tous ; ajouter une fonctionnalité se fait à cet endroit.
- **Erreurs traduisibles** : `AppError` porte une clé i18n (`with_key`) que l'interface affiche dans la langue choisie.

### Principales dépendances

| Côté | Bibliothèques |
|---|---|
| Front-end | React 19, React Router 7, Zustand, TanStack Query/Table, Tiptap 3, React Flow (`@xyflow/react`), dnd-kit, i18next, Zod, Tailwind CSS 4, shadcn, Lucide, mammoth (aperçu Word), hunspell-asm (orthographe) |
| Rust | Tauri 2 (+ plugins `opener`, `dialog`), sqlx 0.8 (SQLite), libsqlite3-sys (SQLCipher + OpenSSL embarqués), tokio, argon2, chacha20poly1305, zeroize, sha2, zip, quick-xml, tracing |

---

## Arborescence du dépôt

```text
GANIS/
├── src/                          Front-end React
│   ├── assets/                   Logo, dictionnaires Hunspell fr/en
│   ├── components/
│   │   ├── auth/                 Clé de récupération
│   │   ├── characters/           Fiches personnages
│   │   ├── documents/            Documents du découpage, lecture, versions
│   │   ├── layout/               Barre de titre, barre d'activité, menus, garde des modifications
│   │   ├── locations/            Fiches lieux
│   │   ├── notes/                Notes, éditeur Tiptap et extensions
│   │   ├── packages/             Thèmes
│   │   ├── plot/                 Trame
│   │   ├── relations/            Relations et graphe
│   │   ├── search/               Recherche, palette de commandes
│   │   ├── settings/             Paramètres du compte et de l'application
│   │   ├── structure/            Découpage
│   │   ├── ui/                   Composants de base (shadcn)
│   │   └── workspace/            Espace de travail, onglets, vues
│   ├── i18n/locales/{fr,en}/     Traductions par domaine
│   ├── lib/                      Logique pure, API, tests unitaires
│   ├── pages/                    Écrans routés
│   ├── stores/                   Stores Zustand
│   └── types/                    Types partagés
├── src-tauri/                    Back-end Rust
│   ├── capabilities/             Permissions Tauri
│   ├── migrations/
│   │   ├── app/                  Schéma de app.db
│   │   └── project/              Schéma de chaque project.db
│   ├── src/
│   │   ├── commands/             Commandes exposées à l'interface
│   │   ├── db/                   Connexions et migrations
│   │   ├── models/               Modèles
│   │   ├── security/             Chiffrement
│   │   └── services/             Logique métier
│   ├── Cargo.toml
│   └── tauri.conf.json
├── tests/                        Tests Playwright
├── LISEZ-MOI-chiffrement.md      Notes sur le chiffrement
└── package.json
```

---

## Données et fichiers

GANIS range ses données dans le dossier de données standard du système, avec l'identifiant `app.ganis.studio` :

| Système | Dossier de données |
|---|---|
| Windows | `%APPDATA%\app.ganis.studio\` |
| macOS | `~/Library/Application Support/app.ganis.studio/` |
| Linux | `~/.local/share/app.ganis.studio/` |

```text
app.ganis.studio/
├── app.db                       comptes, verrous de clés, liste des projets, packages
├── projets/
│   └── <uuid>/project.db        base chiffrée d'un projet (SQLCipher)
├── sauvegardes/                 copie de l'ancien projet quand un import .ganix le remplace
├── open-documents/              copies temporaires des documents ouverts à l'extérieur
├── staging/                     zone d'attente des imports .ganix
└── tmp/                         fichiers de travail (exports en cours)
```

Les journaux se trouvent dans le dossier de journaux du système (`app_log_dir`).

### Migrations

- `migrations/app/` : schéma de `app.db` (utilisateurs, projets, packages, chiffrement).
- `migrations/project/` : schéma des projets (synopsis, découpage, personnages, relations, lieux, notes, corbeille, historique, documents, trame…).

Une migration déjà publiée ne doit **jamais être modifiée** : il faut ajouter un nouveau fichier numéroté (`023_…sql`). Les projets existants sont mis à jour automatiquement à leur ouverture.

---

## Format `.ganix`

Le `.ganix` est le format d'échange des projets. C'est une archive ZIP qui ne contient que du XML et des images, **jamais de base de données** :

```text
mon-projet.ganix
├── manifest.xml     identité, versions, contenu, compatibilité
├── checksums.xml    empreintes SHA-256 des autres fichiers
├── project.xml      données du projet, table par table
└── assets/          images et gros documents, nommés par leur empreinte
```

- **Export** : les données sont lues en un instantané cohérent, puis écrites dans un `.ganix.part` qui est relu, vérifié et enfin renommé. Un export interrompu ne laisse jamais de faux fichier.
- **Import** : la base est reconstruite par les migrations de GANIS dans une zone d'attente, puis les lignes sont insérées colonne par colonne. Le fichier n'apporte que des données (aucun SQL, aucun déclencheur). L'archive est entièrement contrôlée : chemins, liens symboliques, taux de compression, empreintes, type réel des images, XML sans DTD. Un aperçu est présenté avant confirmation.
- Aucune donnée de compte (mot de passe, clé, identifiant) n'est exportée. Le `.ganix` n'est **pas chiffré** : c'est un fichier de partage.

---

## Tests

| Suite | Commande | Contenu |
|---|---|---|
| Rust | `cd src-tauri && cargo test --lib` | Services sur base SQLite en mémoire, chiffrement (`encryption_tests.rs`), limitation des connexions, validation des packages |
| Front-end | `npm test` | Logique de `src/lib/` (structure, notes, relations, trame, raccourcis, nettoyage HTML, clé de récupération…) |
| Bout en bout | `npx playwright test` | Configuré pour Chromium, Firefox et WebKit |

> **À faire** : `tests/example.spec.ts` est encore l'exemple fourni par Playwright (il visite `playwright.dev`). Il doit être remplacé par de vrais scénarios GANIS, par exemple en lançant `npm run dev` via l'option `webServer` de `playwright.config.ts`, ou en pilotant l'application Tauri avec `tauri-driver`.

---

## Internationalisation

Les textes sont dans `src/i18n/locales/<langue>/<domaine>.json`, avec un fichier par domaine : `characters.json`, `plot.json`, `errors.json`… Le typage des clés est assuré par `src/i18n/i18next.d.ts`.

Pour ajouter un texte, il faut ajouter la clé **dans les deux langues** (`fr` et `en`).

Pour ajouter une langue :

1. Copier `locales/fr/` vers `locales/<code>/` et traduire les fichiers.
2. Importer chacun de ces fichiers dans `src/i18n/index.ts` et les ajouter aux ressources, comme pour `fr` et `en`.
3. L'ajouter au sélecteur (`components/layout/LanguageSwitcher.tsx`).

---

## Contribuer

### Conventions

- **Langue** : les commentaires, la documentation et les messages sont en français ; les identifiants de code sont en anglais.
- **TypeScript** : mode `strict`, sans variable ni paramètre inutilisé. Utiliser l'alias `@/` pour importer depuis `src/`.
- **Rust** : `cargo fmt` et `cargo clippy` avant chaque commit. Les commandes restent fines et la logique va dans `services/`.
- **Sécurité** : ne jamais journaliser de donnée sensible, toujours valider côté Rust, et ne jamais écrire une clé en clair.
- **Base de données** : toute évolution du schéma passe par une nouvelle migration.

### Ajouter une commande Rust

1. Écrire la logique dans `src-tauri/src/services/<domaine>_service.rs`, avec ses tests.
2. Exposer la commande dans `src-tauri/src/commands/<domaine>.rs`.
3. L'enregistrer dans `generate_handler!` (`src-tauri/src/lib.rs`).
4. Ajouter l'appel typé dans `src/lib/api.ts`.

### Ajouter un module à l'espace de travail

1. Ajouter l'identifiant dans `ModuleId` et `FeatureId` (`src/components/workspace/modules.ts`).
2. Ajouter ses textes dans `modules.json` (fr et en).
3. Créer la vue dans `components/workspace/views/` et la brancher dans `WorkspaceView.tsx`.

---

## Dépannage

| Problème | Solution |
|---|---|
| Échec de compilation d'OpenSSL sous Windows | Installer Strawberry Perl, rouvrir le terminal, puis relancer |
| Le port 1420 est déjà utilisé | Fermer l'autre instance de Vite (`strictPort` est activé) |
| Nouvelle migration non prise en compte | `cd src-tauri && cargo clean -p ganis`, puis relancer |
| « Projet non trouvé » au démarrage | La base du projet a été déplacée ou supprimée ; GANIS refuse volontairement de la recréer vide |
| Connexion bloquée temporairement | Trop d'échecs : attendre la fin du délai indiqué (15 min maximum) |
| Mot de passe oublié | Écran **Mot de passe oublié**, puis saisir la clé de récupération |

---

## Licences tierces

- Dictionnaire français : Grammalecte / Olivier R., [MPL 2.0](src/assets/dictionaries/LICENSE-fr.txt).
- Dictionnaire anglais : SCOWL / Kevin Atkinson et autres, [licence](src/assets/dictionaries/LICENSE-en.txt).
- Les autres dépendances sont sous leurs licences respectives (voir `package-lock.json` et `Cargo.lock`).

La licence de GANIS lui-même reste à définir.

---

<p align="center"><sub>GANIS 0.1.0</sub></p>
