# Données des projets d'exemple

Ce dossier contient le **contenu** des deux projets d'exemple de GANIS. Le
code qui les construit est dans `src/services/demo_service/` ; il ne contient
aucun texte d'exemple.

| Dossier | Projet | Fichiers |
|---|---|---|
| `roman/` | *Les Plaques de verre* (roman) | `projet.json`, `manuscrit.md`, `notes.md`, `documents.md` |
| `manga/` | *Kazemusubi* (manga) | `projet.json`, `scenario.md`, `notes.md`, `documents.md` |

Les fichiers sont intégrés au binaire à la compilation (`include_str!`) : une
modification est prise en compte au prochain `cargo build`. Pour ajouter un
exemple, créer son dossier et l'ajouter à `SOURCES` dans
`demo_service/mod.rs`.

Tout le contenu est original (textes, noms, univers). Les images sont
dessinées par le code (`demo_service/images.rs`) : aucun fichier d'image ni
aucune ressource externe n'est embarqué.

## Comment un exemple est construit

Le moteur lit `projet.json` et les fichiers de texte, puis crée le projet **par
les services de l'application**, dans l'ordre où un auteur le ferait :
projet, synopsis, réglages, découpage (et pages du scénario), lieux,
personnages, objets et faune, liens, textes des scènes, scénario des pages,
objectifs, documents, notes, trame, versions nommées.

Chaque valeur passe donc par les mêmes contrôles que dans l'interface. Une
erreur dans les données (clé inconnue, valeur hors liste, référence vers une
fiche absente, section de texte jamais utilisée) fait échouer la construction,
qui est alors entièrement annulée. Les tests (`cargo test --lib demo`)
construisent les deux exemples : une donnée invalide est vue avant publication.

## `projet.json`

Objet JSON, clés en camelCase. Toute clé inconnue est refusée.

| Clé | Contenu |
|---|---|
| `format` | Toujours `1` |
| `project` | `name`, `description`, `type` (`novel`, `manga`…), `status` (statut final du projet) |
| `card` | Présentation de l'exemple : `pitch`, `highlights` (lignes courtes) |
| `synopsis` | `text` (clé de la section du synopsis), `genres`, `subgenres`, `tones` |
| `characterSettings`, `locationSettings` | `detailLevel`, `customTypes` (`key`, `name`, `category`), `lists` |
| `world` | Par module (`item`, `species`) : `enabled`, `categories`, `detailLevel`, `customTypes`, `lists` |
| `mangaSettings` | Seuils d'alerte : `panelWordsMax`, `pageWordsMax` |
| `structure` | `levels` (facultatif : niveaux personnalisés), `autoNumbering`, `nodes` (arbre) |
| `locations`, `characters`, `items`, `species` | Fiches (voir ci-dessous) |
| `relations`, `graph` | Relations entre personnages ; positions dans le graphe |
| `characterLocations`, `worldLinks` | Liens personnage-lieu ; liens entre fiches de l'univers |
| `nodeLinks` | Personnages et lieux d'un élément du découpage (`node`, `characters`, `locations` : clé → rôle) |
| `manuscript` | Roman : `goal` (mots du manuscrit), `dailyGoal` |
| `editorial` | Roman : `pitch`, `summaryShort`, `summaryLong` (clés de sections) |
| `documents` | Documents rangés dans le découpage (voir ci-dessous) |
| `notes` | `folders`, `notes` (`key`, `title`, `folder`, `pinned`), `stickies` (post-it), `systemNotes` |
| `plot` | Trame, au format enregistré par l'application (voir `src/lib/plot.ts`) |
| `versions` | Versions nommées (voir ci-dessous) |

### Clés et références

Chaque élément a une **clé** lisible (`"key": "jeanne"`). Ailleurs, on le
désigne par `@sorte:clé` ; le moteur remplace la référence par l'identifiant
créé :

| Référence | Désigne |
|---|---|
| `@char:clé` | Un personnage |
| `@loc:clé` | Un lieu |
| `@item:clé`, `@species:clé` | Un objet, un animal ou une plante |
| `@node:clé` | Un élément du découpage (partie, chapitre, scène, page…) |
| `@note:clé`, `@folder:clé` | Une note, un dossier de notes |
| `@ltype:clé`, `@itype:clé`, `@stype:clé` | Un type de lieu, d'objet, d'espèce ajouté par l'auteur |

Dans `nodeLinks`, les clés de personnages et de lieux s'écrivent sans `@`.

### Fiches

Une fiche reprend les champs du service correspondant, plus :

- `key` : sa clé ;
- `portrait` (facultatif) : image dessinée par le code ;
- `gallery` (facultatif) : liste de `{ "image": …, "caption": … }` (pas de légende pour les personnages).

Lieux : `name`, `type`, `parentId` (lieu parent, `@loc:…`), `status`, `fields`.
Personnages : `firstName`, `lastName`, `role`, `status`, `fields`. Objets et
faune : `name`, `type`, `nature`, `parentId`, `status`, `fields`.

Les champs « étiquettes » et « couleurs » s'écrivent en listes JSON. Un champ
de lieu qui désigne un personnage (`ruler`…) est rempli une fois les
personnages créés.

### Images

```json
{ "kind": "portrait", "background": [215, 220, 228], "figure": [61, 74, 92] }
{ "kind": "landscape", "sky": [60, 90, 150], "ground": [240, 240, 245], "width": 240, "height": 160 }
{ "kind": "swatches", "colors": [[30, 38, 58], [181, 82, 59]], "width": 400, "height": 120 }
```

### Documents

`{ "node": "@node:…", "name": "Fichier.ext", … }` avec :

- `image` : une image (fichier `.png`) ;
- ou `text` : clé d'une section de `documents.md`. L'extension décide du format : `.docx` (document Word généré), `.md`, `.txt` ;
- `earlier` (facultatif) : section d'une version précédente, gardée dans l'historique du document ;
- `note` (facultatif) : note affichée avec le document.

### Versions nommées

`{ "kind": "structureNode" | "synopsis" | "plot" | …, "item": "@node:…" | "default", "name": "…", "then": "section" }`

L'état présent reçoit le nom donné. Avec `then`, le texte est ensuite remplacé
par la section indiquée (texte d'une scène, ou synopsis) : la version nommée
garde l'ancien texte, comparable dans l'historique.

## Fichiers de texte (`.md`)

Les longs textes sont découpés en sections :

```text
=== clé-de-la-section ===
Premier paragraphe, qui peut tenir
sur plusieurs lignes.

Deuxième paragraphe.
```

Ce qui précède la première section (présentation du fichier) est ignoré.
Toutes les sections doivent servir.

| Section | Rôle |
|---|---|
| `scène:<clé>` | Texte d'un élément du découpage (roman) |
| `révision:<clé>`, ou toute autre clé | Texte appelé par une version nommée (`then`) |
| `note:<clé>` | Contenu d'une note |
| `doc:<clé>` | Contenu d'un document |
| `synopsis`, `éditorial:…` | Synopsis, résumés du dossier éditorial |

Balisage en ligne : `*italique*`, `**gras**`, mention d'une fiche
`[[char:clé|Libellé]]`, `[[loc:clé|Libellé]]`, `[[node:clé|Libellé]]`. Une
ligne finie par `\` force un retour à la ligne.

Dans les notes, en plus : titres (`#`, `##`, `###`), listes (`- `, `1. `),
cases à cocher (`- [ ]`, `- [x]`), citations (`> `), tableaux (`| … |`) et blocs :

```text
:::encadré blue
Texte de l'encadré (couleurs des post-it : yellow, pink, green, blue, purple, orange).
:::

:::enchaînement
- Première étape
- Deuxième étape
:::
```

## Scénario du manga (`scenario.md`)

Une page par bloc, une case par `--- case` :

```text
=== page c1p04 | chapitre: ch1 | rythme: action | tourne | pdv: kai
résumé: Ce que la page raconte.

--- case
plan: medium
rythme: action
lieu: quai
moment: Jour 1 — midi
persos: kai = Veste bleue, bandeau rouge ; daigo = Manteau noir
action: Ce qui se passe dans la case.
décor: Ce qu'on voit autour.
dessin: Indications au dessinateur.
continuité: Ce qu'il faut garder d'une case à l'autre.
> récit: Récitatif.
> kai: Réplique de Kai.
> kai (pensée): Pensée de Kai.
> sfx: VLAN
> écrit: Texte du décor (panneau, lettre…).
> voix: Réplique d'un figurant sans fiche.
```

- La page est créée sous son chapitre (`chapitre:` = clé d'un nœud de `projet.json`), dans l'ordre du fichier.
- `rythme` : `action`, `reveal`, `pause`, `transition`, `suspense` ; `tourne` : la page finit sur un tourné de page ; `pdv` : personnage du point de vue.
- `plan` : un cadrage de `manga_service::FRAMINGS` (`extremeWide`, `wide`, `full`, `american`, `medium`, `closeUp`, `extremeCloseUp`, `insert`, `pov`, `overShoulder`, `lowAngle`, `highAngle`).
- `lieu`, `persos` et les interlocuteurs sont des clés de fiches. Les personnages et lieux d'une page sont reliés à la page automatiquement.
- Une ligne qui commence par deux espaces continue la ligne précédente ; `//` commence un commentaire.
- Une page sans case existe dans le découpage avec son résumé, prête à être scénarisée.
