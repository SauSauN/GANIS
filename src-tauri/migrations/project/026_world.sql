-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 026 : objets, faune et flore, liens entre éléments
-- ============================================================================
-- Deux modules facultatifs, désactivés par défaut. L'auteur les active dans
-- Paramètres du projet, et choisit les catégories qu'il veut utiliser
-- (armes, véhicules, magie… ; faune, flore).
--
-- Les deux suivent le modèle des lieux (migration 008) :
--   name       : nom (« Excalibur », « Éclair », « Rose de lune ») ;
--   type       : type par défaut (sword, car, phone… voir
--                src/lib/itemCatalog.json et speciesCatalog.json) ou ajouté
--                par l'auteur (« custom-… », dans *_settings.custom_types).
--                La catégorie se déduit du type ;
--   parent_id  : objet qui contient celui-ci (un coffre, un vaisseau), ou
--                espèce à laquelle appartient un animal / une plante précis.
--                Pas de boucle (vérifié par Rust) ;
--   status     : intact, perdu, volé… ; commun, rare, vivant… (liste
--                personnalisable) ;
--   fields     : tous les autres champs de la fiche, en JSON.
--
-- species.nature :
--   'species'    : une espèce (« les loups des Montagnes Noires ») ;
--   'individual' : un animal ou une plante précis (« Éclair, le cheval du
--                  héros »).
-- species.character_id : cet animal est AUSSI un personnage (il a sa fiche
--   de personnage, ses relations…). NULL : un animal tout court. Un
--   personnage supprimé redevient un animal tout court.
--
-- *_settings (une seule ligne) :
--   enabled      : module affiché dans la barre de gauche (0 par défaut) ;
--   categories   : catégories choisies par l'auteur, ["weapon", "vehicle"…] ;
--   detail_level : niveau de détail des fiches (NULL : pas encore choisi) ;
--   custom_types : types ajoutés par l'auteur, [{id, name, category}] ;
--   lists        : listes personnalisées, ex. {"status": [...]}.
--
-- world_links : liens libres entre éléments (« Aldric possède Excalibur »,
--   « Le loup vit dans la Forêt d'Ébène »). Un des deux côtés au moins est
--   un objet ou une espèce : personnage ↔ lieu a déjà ses propres liens
--   (character_locations) et personnage ↔ personnage ses relations.
--   Les deux côtés peuvent être de n'importe quelle sorte : pas de clé
--   étrangère possible, Rust supprime les liens d'un élément supprimé (et
--   les met dans la corbeille avec lui).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Objets
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS items (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,
    parent_id   TEXT,
    status      TEXT NOT NULL DEFAULT 'intact',
    fields      TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,

    FOREIGN KEY (parent_id)
        REFERENCES items(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_items_name ON items(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
CREATE INDEX IF NOT EXISTS idx_items_parent ON items(parent_id);

CREATE TABLE IF NOT EXISTS item_settings (
    id            TEXT PRIMARY KEY CHECK (id = 'default'),
    enabled       INTEGER NOT NULL DEFAULT 0,
    categories    TEXT NOT NULL DEFAULT '[]',
    detail_level  TEXT CHECK (detail_level IN ('basic', 'intermediate', 'advanced')),
    custom_types  TEXT NOT NULL DEFAULT '[]',
    lists         TEXT NOT NULL DEFAULT '{}',
    updated_at    TEXT NOT NULL
);

INSERT OR IGNORE INTO item_settings (id, enabled, categories, custom_types, lists, updated_at)
VALUES ('default', 0, '[]', '[]', '{}', datetime('now'));

CREATE TABLE IF NOT EXISTS item_portraits (
    item_id     TEXT PRIMARY KEY,
    mime        TEXT NOT NULL,
    data        BLOB NOT NULL,
    updated_at  TEXT NOT NULL,

    FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS item_images (
    id          TEXT PRIMARY KEY,
    item_id     TEXT NOT NULL,
    mime        TEXT NOT NULL,
    data        BLOB NOT NULL,
    caption     TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,

    FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_item_images_item
    ON item_images(item_id, position);

-- ----------------------------------------------------------------------------
-- Faune et flore
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS species (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    type          TEXT NOT NULL,
    nature        TEXT NOT NULL DEFAULT 'species' CHECK (nature IN ('species', 'individual')),
    parent_id     TEXT,
    character_id  TEXT,
    status        TEXT NOT NULL DEFAULT 'common',
    fields        TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,

    FOREIGN KEY (parent_id)
        REFERENCES species(id)
        ON DELETE SET NULL,
    FOREIGN KEY (character_id)
        REFERENCES characters(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_species_name ON species(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_species_type ON species(type);
CREATE INDEX IF NOT EXISTS idx_species_parent ON species(parent_id);

-- Un personnage est au plus un animal (ou une plante).
CREATE UNIQUE INDEX IF NOT EXISTS idx_species_character
    ON species(character_id) WHERE character_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS species_settings (
    id            TEXT PRIMARY KEY CHECK (id = 'default'),
    enabled       INTEGER NOT NULL DEFAULT 0,
    categories    TEXT NOT NULL DEFAULT '[]',
    detail_level  TEXT CHECK (detail_level IN ('basic', 'intermediate', 'advanced')),
    custom_types  TEXT NOT NULL DEFAULT '[]',
    lists         TEXT NOT NULL DEFAULT '{}',
    updated_at    TEXT NOT NULL
);

INSERT OR IGNORE INTO species_settings (id, enabled, categories, custom_types, lists, updated_at)
VALUES ('default', 0, '[]', '[]', '{}', datetime('now'));

CREATE TABLE IF NOT EXISTS species_portraits (
    species_id  TEXT PRIMARY KEY,
    mime        TEXT NOT NULL,
    data        BLOB NOT NULL,
    updated_at  TEXT NOT NULL,

    FOREIGN KEY (species_id)
        REFERENCES species(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS species_images (
    id          TEXT PRIMARY KEY,
    species_id  TEXT NOT NULL,
    mime        TEXT NOT NULL,
    data        BLOB NOT NULL,
    caption     TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,

    FOREIGN KEY (species_id)
        REFERENCES species(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_species_images_species
    ON species_images(species_id, position);

-- ----------------------------------------------------------------------------
-- Liens entre éléments
-- ----------------------------------------------------------------------------
-- `type` : possède, utilise, a fabriqué, se trouve à, vit à… (voir
-- src/lib/worldLinkCatalog.json). Le lien a un sens : source → cible
-- (« Aldric possède Excalibur ») ; il apparaît sur les deux fiches.
-- since_node / until_node : période du récit (NULL : depuis le début /
-- jusqu'à la fin), pour un objet qui change de main par exemple.

CREATE TABLE IF NOT EXISTS world_links (
    id           TEXT PRIMARY KEY,
    source_kind  TEXT NOT NULL CHECK (source_kind IN ('character', 'location', 'item', 'species')),
    source_id    TEXT NOT NULL,
    target_kind  TEXT NOT NULL CHECK (target_kind IN ('character', 'location', 'item', 'species')),
    target_id    TEXT NOT NULL,
    type         TEXT NOT NULL,
    label        TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    since_node   TEXT,
    until_node   TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,

    CHECK (source_id <> target_id),
    CHECK (source_kind IN ('item', 'species') OR target_kind IN ('item', 'species')),

    FOREIGN KEY (since_node) REFERENCES structure_nodes(id) ON DELETE SET NULL,
    FOREIGN KEY (until_node) REFERENCES structure_nodes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_world_links_source ON world_links(source_id);
CREATE INDEX IF NOT EXISTS idx_world_links_target ON world_links(target_id);
