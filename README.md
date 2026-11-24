<p align="center">
  <img src="ganis-icon.png" alt="GANIS logo" width="96" />
</p>

<h1 align="center">GANIS</h1>

<p align="center"><strong>A narrative design studio — local, offline, encrypted.</strong></p>

<p align="center">
  Tauri 2 · Rust · React 19 · TypeScript · SQLite / SQLCipher
</p>

---

GANIS is a desktop application for designing stories: novels, manga, films, TV series, video games, tabletop role-playing games and more. It brings everything a writer needs into a single workspace: characters, places, relationships, the story outline, parallel plotlines, notes and working documents.

Everything stays on the user's computer. GANIS works **without an internet connection** and **encrypts** every project with a key of its own.

The interface is available in **French and English**.

## Table of contents

- [Features](#features)
  - [Accounts and projects](#accounts-and-projects)
  - [The project workspace](#the-project-workspace)
  - [Tabs](#tabs)
  - [Novel tools](#novel-tools)
  - [Manga tools](#manga-tools)
  - [History and data safety](#history-and-data-safety)
  - [Customisation](#customisation)
- [Security and privacy](#security-and-privacy)
- [Quick start](#quick-start)
- [Available scripts](#available-scripts)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Data and files](#data-and-files)
- [The `.ganix` format](#the-ganix-format)
- [Tests](#tests)
- [Internationalisation](#internationalisation)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [Third-party licences](#third-party-licences)

---

## Features

### Accounts and projects

- **Welcome screen**: a short message, a miniature plot board (plotlines, scenes, characters, a place) drawn in the colours of the current theme, and two buttons: **Start** and **Sign in**.
- **Two spaces, never mixed**:
  - without signing in (**Start**), the dashboard shows the **public space** (public projects only);
  - once signed in, it shows the **private space** (that account's private projects only).

  There is no filter: the mode decides. New projects automatically take the visibility of the space they are created in.
- **Getting-started guide**: opens once, the first time the dashboard is reached (with or without an account), then stays available under *Help › Getting-started guide*. It has 16 steps, each with a short text and its key points: projects, public and private spaces, the workspace, the project home, characters, places, relationships, the outline, plotlines, notes, search, saving and versions, history and trash, `.ganix` export, customisation and keyboard shortcuts.
- **Tutorials**: the first time a project of each kind is opened (novel, manga or another type), a start-up mode explains where to begin. The Items, Flora and fauna and Factions modules have their own on first use. Every module also has an on-demand tutorial: the `?` button of the panel, *Help › Tutorial*, or the command palette. A step can open the feature it talks about, and the tutorial then resumes where it left off.
- **Changing visibility**: *Project settings › Status and organisation › Visibility*.
  - Public → private: immediate when signed in; otherwise GANIS asks you to sign in on the spot, then makes the project private. If signing in goes through account creation or the setup wizard, the change is applied on arrival at the dashboard.
  - Private → public: requires explicit confirmation (*Cancel* / *Make public*).
- **Local accounts**: there is no administrator: each account manages its own projects. The first account is created by the setup wizard; other accounts can then register. There are two roles: `user` and `developer` (anyone can turn developer mode on or off in *Settings*). Anyone can delete their own account (*Settings › Account*, password required): the account and its private projects are erased.
- **Automatic lock** (optional, *Settings › Account*): after 5 to 60 minutes of inactivity, the account key is wiped from memory and the password is required to continue. Open tabs and unsaved input are kept.
- **Recovery key**: handed over when the account is created; it restores access if the password is forgotten. It can be regenerated from the settings.
- **Dashboard**: create, duplicate, delete and favourite projects.
  - **Project trash**: a deleted project stays there for 30 days (restore it or delete it for good); after that it is erased at start-up. Several projects can be selected to restore or delete them together.
  - Project types: manga, novel, film, series, game, tabletop RPG, custom.
  - Statuses: in preparation, in progress, on hold, finished.
- **Work calendar**: shows your writing rhythm, based on actual activity in your projects.

### The project workspace

The workspace follows the layout of a code editor: an activity bar on the left, a side panel (the *middle panel*) and a tabbed central area.

| Module | What it contains |
|---|---|
| **Details** | Project home (logo, description, type, status, synopsis preview), synopsis, glossary, **gallery**, history, trash |
| **Characters** | Sheets with an adjustable level of detail, portrait, image gallery, custom fields, colour palette, linked places, an optional *Powers* card (powers and abilities, limits and weaknesses) |
| **Relationships** | Links between characters (typed and colour-coded), an interactive graph with remembered positions, and a **family tree** layout |
| **Places** | Nested sheets (a place can contain others), custom types, portrait, captioned gallery |
| **Items, Flora and fauna, Factions** | Optional modules, enabled in the project settings. Factions: guilds, orders, clans, armies, cults, secret societies… in 8 categories and 37 types, with branches and links (*leads*, *is part of*, *is allied with*, *is headquartered in*…) |
| **Peoples, cultures and religions; Magic and powers** | Two more optional modules. Peoples: peoples and races, cultures, traditions, languages, social classes, religions, pantheons, deities, mythologies, prophecies. Magic: systems (magic, inner energy, superpowers, divine power, psychic powers, alchemy), schools, elements, bloodlines, spells and techniques (source, cost, limits, power, range…). *Who belongs to it* and *Who masters it* cards; links such as *belongs to*, *practises*, *speaks*, *worships*, *masters*, *teaches*, *is a source of*, *forbids*. No duplication: organisations remain factions, and a character's own powers stay on their *Powers* card |
| **Outline** | The story plan in 1 to 5 levels (parts, chapters, scenes…), automatic or manual numbering, a colour per level. Each item's sheet gathers all its **links with the world** (characters, places, world entries) in a single card, sorted by kind |
| **Plot** | A board of parallel plotlines, with a reading view (by outline or by plotline) and a guided tour; a *narrative past* above the start of the story (flashbacks, memories, earlier events) |
| **Notes** | A rich editor (Tiptap): tables, callouts, diagrams, chains, mentions of characters and places, spell checking; folders, a sticky-note wall, and system notes kept in sync with the sheets (font, size and lists are kept in the note; the sheet stays plain text) |
| **Documents** | Files filed in the outline (PDF, Word, images, text, audio, video, manga pages…), built-in viewer, editing in the associated application with automatic pick-up of changes, 20 versions per document |
| **Search** | Global search that ignores case and accents, plus a command palette (`Ctrl+K`) |
| **Settings** | Project-specific settings (characters, places, outline, plot, notes) |

**Project logo and gallery.** *Details › Gallery* holds the project **logo**, shown on the project home next to its name, and up to 30 **world images** (posters, world maps, mood boards, sketches…). The logo keeps its shape, even a wide one. Images can be added by drag and drop, and clicking one opens it full screen, with ← → to browse. Images are stored, encrypted, in the project and are included in the `.ganix` export.

**Colour choice.** Wherever a colour is picked (outline levels, plotlines, sticky notes, callouts, diagram boxes, a character's palette), GANIS shows a single swatch with the current colour. Clicking it opens a small menu of suggested colours, *Other colour…* (the system colour picker) and, where it makes sense, *Default colour*.

**Maximising a tab.** Double-clicking a tab shows its content across the whole workspace (the activity bar and the middle panel are hidden). Another double-click, or the button at the right end of the tab bar, restores the layout. The tab keeps its state.

**Narrative past (Plot).** Moment 1 is the start of the main story. Above it, moments −1, −2… form the narrative past: scroll up to reach it, and create, move and link events there as anywhere else. The board always opens at the start of the story. In the data, these events simply have a negative moment (`row`), so existing projects are unaffected.

The suggested outline templates are:

| Template | Level 0 | Level 1 | Level 2 |
|---|---|---|---|
| Novel | Part | Chapter | Scene |
| Manga | Volume | Chapter | Page |
| Film | Act | Sequence | Scene |
| Series | Season | Episode | Scene |
| Game | Act | Quest | Mission |
| Tabletop RPG | Scenario | Session | Encounter |
| Generic | Part | Section | Item |

### Tabs

- **Scrolling tab bar**: all open tabs sit on a single line that scrolls like VS Code's: swipe left or right with two fingers on a touchpad, or use the mouse wheel. The ‹ › arrows appear only when tabs are hidden on that side and bring the next hidden tab into view. The active tab is always scrolled into view.
- **Preview tabs** (like VS Code): a single click on an item in the middle panel opens it in a temporary tab with an *italic* title. Opening another item the same way replaces that tab instead of adding a new one. The tab becomes permanent when you double-click the item or the tab, edit its content or pin it. This can be turned off in *Settings › Appearance › Preview tabs*.
- **Pinning, reordering, closing**: drag and drop to reorder; right-click a tab to pin it or to close it, the others, those to its left or right, or all of them. Pinned tabs stay at the start of the bar and are remembered per project.
- **Unsaved changes**: a dot ● replaces the close button; GANIS asks before closing a modified tab.

### Novel tools

Available for **Novel** projects only. A **Manuscript** module appears in the activity bar, and outline sheets gain two cards.

- **Text** (on a scene's sheet, or a chapter without scenes): the text is written in GANIS's editor and saved with the sheet (`Ctrl+S`, auto-save, versions). Its word count is computed by Rust.
- **Writing**: word goals (scene, chapter, part), the chapter's writing state (*To write*, *First draft*, *In revision*, *Proofread*, *Corrected*, separate from the project status), point of view (a linked character with the *Point of view* role), grammatical person and tense of the narration. These settings never change the text.
- **Manuscript**: the whole novel in one piece, assembled on demand in outline order. Nothing is copied: moving a scene moves it here too. A scene's text is the one on its sheet, or, failing that, the text of its documents (Word, Markdown, plain text). Exports to Word, PDF or plain text (title page, each chapter on a new page, page numbers).
- **Writing progress**: words and goals for the manuscript, parts, chapters and scenes; filter by writing state; scenes whose person or tense differs from the rest of the novel are flagged.
- **Editorial file**: a one-sentence pitch, a short summary and a long summary, independent of the synopsis (which can serve as a starting point), versioned and exportable separately (Word, PDF, plain text).

Data: migration `023_novel.sql` (columns of `structure_nodes`, the goal in `structure_settings`, the `editorial` table), `services/novel_service.rs`, `commands/novel.rs`, `src/lib/novel.ts`, `src/lib/novelExport.ts`, `src/components/novel/*`.

### Manga tools

Available for **Manga** projects only.

- **Flatplan** (*Script › Flatplan*): shows a volume's pages as spreads, right-to-left or left-to-right, with their thumbnail, the state of each page (empty, script written, artwork filed) and where chapters begin. The number of the first page decides which pages face each other. A reveal planned on a page turn that lands on an even page, and a page with too much text, are flagged. The reading direction and that first number are local preferences: they do not travel with the `.ganix` file.
- **Manga pages**: a chapter's sheet can create several pages at once. The artwork filed on a page's sheet is shown next to its panels, and reading a chapter chains its pages' artwork. Panels are found by search, and page versions keep them.
- **Page templates**: until a page has artwork, its sheet and the flatplan show a template layout based on its number of panels: diagonals, columns, bleeds, inset panels. Up to three templates per panel count, from 1 to 10 panels; beyond that, rows of slanted panels. They are built into the application (offline, no AI). The chosen template is a local preference and does not travel with the `.ganix` file.

### History and data safety

- **Activity log**: kept for 90 days.
- **Automatic versions**: a version is taken at the start of each editing session, at most one every 10 minutes and 50 per item. Manual versions are also possible. Restoring a version first saves the current state.
- **Trash**: deleted items are restored together with everything that depended on them (images, relationships, links).
- **Auto-save**: screens save themselves a few seconds after the last change (1, 3, 10 or 30 seconds, configurable in *Settings › Saving*, and can be turned off).
- **Unsaved-changes guard**: GANIS asks before quitting or closing a modified tab. A dialog in which text has been typed no longer closes on a click outside it: *Discard what you typed?* is asked first.
- **Recovery screen**: a rendering error replaces the tab (or the whole application) with a clear message, with *Try again* and *Save and reload GANIS*.

### Customisation

- **Themes**: light, dark and system themes.
- **Packages**: in developer mode, a theme editor lets you create your own themes. They are declarative (hexadecimal colours and corner radius only) and validated in Rust.
- **Language**: French and English.
- **Appearance options**: text size, middle-panel image size, right-click menu in the middle panel, preview tabs.
- **Keyboard shortcuts**:

  | Action | Shortcut |
  |---|---|
  | New | `Ctrl+N` |
  | Save | `Ctrl+S` |
  | Save all | `Ctrl+Alt+S` |
  | Close tab | `Ctrl+W` / `Ctrl+F4` |
  | Next / previous tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` (also `Ctrl+PgDn` / `Ctrl+PgUp`) |
  | Move the selected tab | `Alt+←` / `Alt+→` |
  | Command palette | `Ctrl+K` |
  | Help centre | `F1` |
  | List of shortcuts | `Ctrl+/` |

---

## Security and privacy

GANIS is designed so that a copy of its data folder reveals nothing about the content of private projects.

### Key hierarchy

```text
password ──(Argon2id)──┐
                       ├─► key slots ─► account key ─┬─► project A key ─► project.db (SQLCipher)
recovery key ──────────┘                             ├─► project B key ─► project.db (SQLCipher)
                                                     └─► e-mail, project names and descriptions
```

- **Account key**: 256 random bits, never written in clear. It is sealed in *key slots* (`user_key_slots`): one for the password, one for the recovery key. Changing either one only replaces its slot; no data is re-encrypted.
- **Project key**: one separate key per project, sealed with the account key. It encrypts the whole project database with **SQLCipher**.
- **Sensitive fields of `app.db`**: the e-mail address and the names and descriptions of projects are encrypted field by field with **XChaCha20-Poly1305**. Associated data (AAD) binds each value to its table, column and row.
- **In memory**: the account key only exists during the session and is wiped on sign-out (`zeroize`).
- **Public projects**: they belong to no account (`owner_id` empty, `visibility = 'public'`). Their database is still in SQLCipher format, but its key is stored in clear in `app.db` (`public_key`), and their name and description are not encrypted: that is what allows them to be opened without signing in. Making a project private seals that same key with the account key (the database is not rewritten); making it public does the opposite, after confirmation.

### What remains readable

The user name, the password hash (Argon2id, irreversible), the role, dates, the project type, status and favourite flag, and user-created themes remain readable. The content of **public projects** is readable by anyone with access to the data folder, by design. This information is either needed to sign in or of no value to a third party.

### Other protections

| Measure | Details |
|---|---|
| Passwords | Argon2id; parameters are stored with each key slot so they can be strengthened later |
| Recovery key | 6 groups of 6 characters (Crockford base 32, 180 bits), tolerant input, one randomly chosen group checked when it is displayed |
| Sign-in attempts | 5 failures tolerated, then a 30 s lock-out that doubles with each failure, up to 15 min; a separate counter for recovery; unknown user names are treated like the others |
| Interface | Strict CSP (`default-src 'self'`), no network access, note HTML sanitised |
| Permissions | The role is checked in Rust on every command; the interface only reflects it |
| Temporary files | Copies of documents opened externally are removed after use and at start-up; files are overwritten before deletion |
| Logs | Daily rotation, 14 days kept; never any password, token or story content |

For the details, see [`src-tauri/src/security/mod.rs`](src-tauri/src/security/mod.rs).

> ⚠️ **Without the password or the recovery key, the data cannot be recovered.** This is intentional: there is no back door.

---

## Quick start

### Prerequisites

| Tool | Version |
|---|---|
| [Node.js](https://nodejs.org) | 20 LTS or later |
| [Rust](https://rustup.rs) | stable (2021 edition) |
| Tauri 2 system dependencies | see [tauri.app/start/prerequisites](https://tauri.app/start/prerequisites/) |
| **Windows only**: [Strawberry Perl](https://strawberryperl.com) | needed to build OpenSSL (for SQLCipher) |

On Linux you need, among others, `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, `librsvg2-dev` and `libayatana-appindicator3-dev`. On macOS, the Xcode command-line tools are enough.

### Installation

```bash
git clone <repository-url> ganis
cd ganis
npm install
```

### Running in development

```bash
npm run tauri dev
```

This starts Vite (through `beforeDevCommand` in `src-tauri/tauri.conf.json`), compiles the Rust side and opens the GANIS window. The first run takes several minutes, because SQLCipher and OpenSSL are compiled with the application; later runs are incremental.

On first launch, GANIS opens the **Setup** screen to create the first account.

> `npm run dev` alone only serves the interface on `http://localhost:1420`, without the Rust commands: accounts, projects and the database do not work there. Use `npm run tauri dev` to run the real application.

### Building the application

```bash
npm run tauri build
```

Installers are written to `src-tauri/target/release/bundle/`: `.msi` and `.exe` on Windows, `.dmg` and `.app` on macOS, `.deb`, `.rpm` and `.AppImage` on Linux. The `release` profile enables LTO, `strip` and `panic = "abort"` for a small binary.

---

## Available scripts

| Command | Purpose |
|---|---|
| `npm run tauri dev` | Full application in development (Vite + Rust, hot reload) |
| `npm run tauri build` | Production build and installers |
| `npm run dev` | Interface only, on `http://localhost:1420` (no Rust commands) |
| `npm run build` | TypeScript check (`tsc`), then a Vite build into `dist/` |
| `npm run preview` | Preview of the interface build |
| `npm test` | Interface unit tests (Vitest, `src/` folder) |
| `npm run test:e2e` | End-to-end tests (see [Tests](#tests)) |
| `npm run seed:roman` / `npm run seed:manga` | Create a demo novel or manga project (Rust test marked `ignored`) |
| `cd src-tauri && cargo test --lib` | Rust tests (services, encryption, migrations) |

---

## Architecture

```text
┌──────────────────────────────── Tauri window (WebView) ─────────────────────────────────┐
│  React 19 + React Router                                                                 │
│  ├── pages/        screens (Welcome, Login, Dashboard, Workspace, Settings…)             │
│  ├── components/   workspace modules, UI (shadcn / Base UI, Tailwind 4)                  │
│  ├── stores/       state per domain (Zustand)                                            │
│  └── lib/api/      the single entry point to Rust commands (invoke)                      │
└───────────────────────────────────────────┬──────────────────────────────────────────────┘
                                            │ Tauri IPC (typed commands)
┌───────────────────────────────────────────▼──────────────────────────────────────────────┐
│  Rust (src-tauri/src)                                                                    │
│  ├── commands/     thin entry layer: session, permissions, then the service call         │
│  ├── services/     business logic (one service per domain)                               │
│  ├── security/     crypto primitives, recovery key, AAD contexts                         │
│  ├── db/           app.db, project databases, embedded migrations (sqlx::migrate!)       │
│  ├── models/       shared types (User, Project, Package…)                                │
│  └── state.rs      AppState: app.db pool, project pools, session, account key            │
└───────────────────────────────────────────┬──────────────────────────────────────────────┘
                                            │
                     app.db (SQLite)  +  projets/<uuid>/project.db (SQLCipher)
```

### Principles

- **Rust is the authority**: every validation (permissions, sizes, formats, theme colours…) happens in Rust. Checks in the interface are only for convenience.
- **One database per project**: each project is isolated in its own encrypted file. Only `services::project_storage` opens these databases, with a single pool per project.
- **Embedded migrations**: the SQL files in `src-tauri/migrations/` are compiled into the binary. `build.rs` forces a rebuild when a file is added.
- **Module registry**: `src/components/workspace/modules.ts` describes the workspace modules and features. The activity bar, the middle panel and the tabs all read it; adding a feature happens there.
- **Translatable errors**: `AppError` carries an i18n key (`with_key`) that the interface displays in the chosen language.
- **Pure tab model**: tab order, pinned tabs and the preview tab live in `src/lib/tabLayout.ts`, as pure functions covered by unit tests.

### Main dependencies

| Side | Libraries |
|---|---|
| Interface | React 19, React Router 7, Zustand, TanStack Query/Table, Tiptap 3, React Flow (`@xyflow/react`), dnd-kit, i18next, Zod, Tailwind CSS 4, shadcn, Lucide, mammoth (Word preview), hunspell-asm (spell checking) |
| Rust | Tauri 2 (+ `opener`, `dialog` and `clipboard-manager` plugins), sqlx 0.8 (SQLite), libsqlite3-sys (bundled SQLCipher + OpenSSL), tokio, argon2, chacha20poly1305, zeroize, sha2, zip, quick-xml, tracing |

---

## Repository layout

```text
GANIS/
├── src/                          React interface
│   ├── assets/                   Logo, Hunspell dictionaries (fr/en)
│   ├── components/
│   │   ├── auth/                 Recovery key
│   │   ├── characters/           Character sheets
│   │   ├── common/               Shared pieces (colour menu, info tips…)
│   │   ├── documents/            Outline documents, viewer, versions
│   │   ├── history/              Activity history, versions
│   │   ├── layout/               Title bar, activity bar, menus, help, unsaved-changes guard
│   │   ├── links/                "Links with the world" cards
│   │   ├── locations/            Place sheets
│   │   ├── manga/                Flatplan, pages, production
│   │   ├── notes/                Notes, Tiptap editor and extensions
│   │   ├── novel/                Manuscript, writing progress, editorial file
│   │   ├── packages/             Themes and theme editor
│   │   ├── plot/                 Plot board and reading view
│   │   ├── project-settings/     Project settings
│   │   ├── projects/             Dashboard, project cards, .ganix import
│   │   ├── relations/            Relationships, graph, family tree
│   │   ├── search/               Search, command palette
│   │   ├── settings/             Account and application settings
│   │   ├── structure/            Outline
│   │   ├── ui/                   Base components (shadcn)
│   │   ├── welcome/              Welcome screen
│   │   ├── workspace/            Workspace, tabs, views
│   │   └── world/                Items, flora and fauna, factions, peoples, magic
│   ├── i18n/locales/{fr,en}/     Translations, one file per domain
│   ├── lib/                      Pure logic, API, unit tests
│   ├── pages/                    Routed screens
│   ├── stores/                   Zustand stores
│   └── types/                    Shared types
├── src-tauri/                    Rust back end
│   ├── capabilities/             Tauri permissions
│   ├── migrations/
│   │   ├── app/                  Schema of app.db
│   │   └── project/              Schema of each project.db
│   ├── src/
│   │   ├── commands/             Commands exposed to the interface
│   │   ├── db/                   Connections and migrations
│   │   ├── models/               Models
│   │   ├── security/             Encryption
│   │   └── services/             Business logic
│   ├── Cargo.toml
│   └── tauri.conf.json
├── tests/                        End-to-end tests (Playwright on the Tauri application)
└── package.json
```

---

## Data and files

GANIS stores its data in the system's standard application-data folder, under the identifier `app.ganis.studio`:

| System | Data folder |
|---|---|
| Windows | `%APPDATA%\app.ganis.studio\` |
| macOS | `~/Library/Application Support/app.ganis.studio/` |
| Linux | `~/.local/share/app.ganis.studio/` |

```text
app.ganis.studio/
├── app.db                       accounts, key slots, project list, packages
├── projets/
│   └── <uuid>/project.db        a project's encrypted database (SQLCipher)


├── open-documents/              temporary copies of documents opened externally
├── staging/                     waiting area for .ganix imports
└── tmp/                         working files (exports in progress)
```

Folder names are in French on disk (`projets` = projects, `sauvegardes` = backups). Logs are written to the system's log folder (`app_log_dir`). The `GANIS_DATA_DIR` environment variable points GANIS at another data folder; the end-to-end tests use it.

### Migrations

- `migrations/app/`: schema of `app.db` (users, projects, packages, encryption).
- `migrations/project/`: schema of projects (synopsis, outline, characters, relationships, places, notes, trash, history, documents, plot, world modules, glossary, project images…).

A migration that has been released must **never be modified**: add a new numbered file instead (for example `038_….sql`). Existing projects are upgraded automatically when they are opened.

---

## The `.ganix` format

`.ganix` is the project exchange format. It is a ZIP archive that only contains XML and images, **never a database**:

```text
my-project.ganix
├── manifest.xml     identity, versions, content, compatibility
├── checksums.xml    SHA-256 hashes of the other files
├── project.xml      the project's data, table by table
└── assets/          images and large documents, named by their hash
```

- **Export**: the data is read as one consistent snapshot, then written to a `.ganix.part` file that is read back, checked and finally renamed. An interrupted export never leaves a half-written file behind. Every table of the project is exported, so new tables (such as the logo and gallery) are included automatically.
- **Import**: the database is rebuilt by GANIS's own migrations in a staging area, then rows are inserted column by column. The file only brings data (no SQL, no triggers). The archive is fully checked: paths, symbolic links, compression ratio, hashes, the real type of images, XML without DTD. A preview is shown before confirmation.
- No account data (password, key, identifier) is ever exported. A `.ganix` file is **not encrypted**: it is meant for sharing.

---

## Tests

| Suite | Command | Coverage |
|---|---|---|
| Rust | `cd src-tauri && cargo test --lib` | Services on an in-memory SQLite database, encryption (`encryption_tests.rs`), sign-in throttling, package validation, `.ganix` export and import |
| Interface | `npm test` | Logic in `src/lib/` (outline, notes, relationships, plot, tab layout, shortcuts, HTML sanitising, recovery key…) and some components |
| End-to-end | `npm run test:e2e` | The real application (Rust + interface): first launch, accounts and spaces, dashboard, every module, novel, manga, search, trash, history, settings, persistence after restart |

> The end-to-end tests (`tests/ganis.spec.ts`, Windows) drive the executable in `src-tauri/target/debug`: WebView2 opens a debugging port that Playwright connects to (`tests/ganis-app.ts`). Each run uses a temporary data folder (`GANIS_DATA_DIR`), so your own accounts and projects are not touched. Build first (`cd src-tauri && cargo build`); the Vite server is started, or reused, by `playwright.config.ts`. When a test fails, the report (`npx playwright show-report`) contains a screenshot and the window's accessibility tree.

---

## Internationalisation

Texts live in `src/i18n/locales/<language>/<domain>.json`, one file per domain: `characters.json`, `plot.json`, `errors.json`… Keys are typed through `src/i18n/i18next.d.ts`.

To add a text, add the key **in both languages** (`fr` and `en`).

To add a language:

1. Copy `locales/fr/` to `locales/<code>/` and translate the files.
2. Import each of these files in `src/i18n/index.ts` and add them to the resources, as for `fr` and `en`.
3. Add the language to the switcher (`components/layout/LanguageSwitcher.tsx`).

---

## Contributing

### Conventions

- **Language**: code comments and in-app documentation are written in French; code identifiers are in English.
- **TypeScript**: `strict` mode, no unused variables or parameters. Use the `@/` alias to import from `src/`.
- **Rust**: run `cargo fmt` and `cargo clippy` before each commit. Commands stay thin; logic goes into `services/`.
- **Security**: never log sensitive data, always validate in Rust, and never write a key in clear.
- **Database**: every schema change goes through a new migration.

### Adding a Rust command

1. Write the logic in `src-tauri/src/services/<domain>_service.rs`, with its tests.
2. Expose the command in `src-tauri/src/commands/<domain>.rs`.
3. Register it in `generate_handler!` (`src-tauri/src/lib.rs`).
4. Add the typed call in `src/lib/api/<domain>.ts`, and spread that object into `api` in `src/lib/api/index.ts` if it is a new file.

### Adding a feature to the workspace

1. Add its identifier to `ModuleId` / `FeatureId` and register it with `defineFeature` (`src/components/workspace/modules.ts`).
2. Add its texts to `modules.json` (fr and en).
3. Create the view in `components/workspace/views/` and wire it in `WorkspaceView.tsx`.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| OpenSSL fails to build on Windows | Install Strawberry Perl, reopen the terminal, then try again |
| `Port 1420 is already in use` | Another Vite server is running (often from an earlier `npm run tauri dev` or `npm run dev`). Stop it, then start again (`strictPort` is enabled) |
| `npm run dev` shows the interface but nothing works | That command serves the interface without Rust. Run `npm run tauri dev` instead |
| A new migration is not picked up | `cd src-tauri && cargo clean -p ganis`, then run again |
| "Project not found" at start-up | The project database was moved or deleted; GANIS deliberately refuses to recreate it empty |
| Sign-in temporarily blocked | Too many failures: wait for the indicated delay (15 min at most) |
| Forgotten password | Use the **Forgotten password** screen, then enter the recovery key |
| `src-tauri/target` takes a lot of disk space | Rust build caches grow over time. `cd src-tauri && cargo clean` frees them; the next build will take longer |

---

## Third-party licences

- French dictionary: Grammalecte / Olivier R., [MPL 2.0](src/assets/dictionaries/LICENSE-fr.txt).
- English dictionary: SCOWL / Kevin Atkinson and others, [licence](src/assets/dictionaries/LICENSE-en.txt).
- Other dependencies are under their respective licences (see `package-lock.json` and `Cargo.lock`).

The licence of GANIS itself is still to be decided.

---

<p align="center"><sub>GANIS 1.0.0</sub></p>
