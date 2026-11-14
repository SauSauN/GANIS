-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 029 : peuples, cultures et religions ; systèmes de magie
-- ============================================================================
-- Deux nouveaux modules facultatifs du monde, désactivés par défaut, sur le
-- modèle des factions (migration 027) :
--
--   peoples        : peuples et races, cultures et traditions, langues,
--                    religions, panthéons, divinités, mythologies…
--                    (voir src/lib/peopleCatalog.json) ;
--   magic_systems  : systèmes de magie ou de pouvoirs, écoles et éléments,
--                    sorts et techniques (voir src/lib/magicCatalog.json).
--
-- Pas de doublon avec l'existant : les organisations (tribus, clans,
-- églises, cultes) restent des factions, et les pouvoirs propres à un
-- personnage restent sur sa carte « Pouvoirs ». Les deux se relient aux
-- nouvelles fiches par des liens du monde (« pratique », « maîtrise »…).
--
--   parent_id : un sous-peuple, une branche d'une religion, une divinité
--               d'un panthéon ; une école d'un système, une technique
--               d'une école. Pas de boucle (vérifié par Rust).
--
-- La table world_links est recréée pour accepter les deux nouvelles sortes
-- (SQLite ne sait pas modifier une contrainte CHECK). Les liens existants
-- sont recopiés tels quels.
-- ============================================================================

CREATE TABLE IF NOT EXISTS peoples (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,
    parent_id   TEXT,
    status      TEXT NOT NULL DEFAULT 'living',
    fields      TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,

    FOREIGN KEY (parent_id)
        REFERENCES peoples(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_peoples_name ON peoples(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_peoples_type ON peoples(type);
CREATE INDEX IF NOT EXISTS idx_peoples_parent ON peoples(parent_id);

CREATE TABLE IF NOT EXISTS people_settings (
    id            TEXT PRIMARY KEY CHECK (id = 'default'),
    enabled       INTEGER NOT NULL DEFAULT 0,
    categories    TEXT NOT NULL DEFAULT '[]',
    detail_level  TEXT CHECK (detail_level IN ('basic', 'intermediate', 'advanced')),
    custom_types  TEXT NOT NULL DEFAULT '[]',
    lists         TEXT NOT NULL DEFAULT '{}',
    updated_at    TEXT NOT NULL
);

INSERT OR IGNORE INTO people_settings (id, enabled, categories, custom_types, lists, updated_at)
VALUES ('default', 0, '[]', '[]', '{}', datetime('now'));

CREATE TABLE IF NOT EXISTS people_portraits (
    people_id  TEXT PRIMARY KEY,
    mime        TEXT NOT NULL,
    data        BLOB NOT NULL,
    updated_at  TEXT NOT NULL,

    FOREIGN KEY (people_id)
        REFERENCES peoples(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS people_images (
    id          TEXT PRIMARY KEY,
    people_id  TEXT NOT NULL,
    mime        TEXT NOT NULL,
    data        BLOB NOT NULL,
    caption     TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,

    FOREIGN KEY (people_id)
        REFERENCES peoples(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_people_images_owner
    ON people_images(people_id, position);

CREATE TABLE IF NOT EXISTS magic_systems (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,
    parent_id   TEXT,
    status      TEXT NOT NULL DEFAULT 'active',
    fields      TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,

    FOREIGN KEY (parent_id)
        REFERENCES magic_systems(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_magic_systems_name ON magic_systems(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_magic_systems_type ON magic_systems(type);
CREATE INDEX IF NOT EXISTS idx_magic_systems_parent ON magic_systems(parent_id);

CREATE TABLE IF NOT EXISTS magic_settings (
    id            TEXT PRIMARY KEY CHECK (id = 'default'),
    enabled       INTEGER NOT NULL DEFAULT 0,
    categories    TEXT NOT NULL DEFAULT '[]',
    detail_level  TEXT CHECK (detail_level IN ('basic', 'intermediate', 'advanced')),
    custom_types  TEXT NOT NULL DEFAULT '[]',
    lists         TEXT NOT NULL DEFAULT '{}',
    updated_at    TEXT NOT NULL
);

INSERT OR IGNORE INTO magic_settings (id, enabled, categories, custom_types, lists, updated_at)
VALUES ('default', 0, '[]', '[]', '{}', datetime('now'));

CREATE TABLE IF NOT EXISTS magic_portraits (
    magic_id  TEXT PRIMARY KEY,
    mime        TEXT NOT NULL,
    data        BLOB NOT NULL,
    updated_at  TEXT NOT NULL,

    FOREIGN KEY (magic_id)
        REFERENCES magic_systems(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS magic_images (
    id          TEXT PRIMARY KEY,
    magic_id  TEXT NOT NULL,
    mime        TEXT NOT NULL,
    data        BLOB NOT NULL,
    caption     TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,

    FOREIGN KEY (magic_id)
        REFERENCES magic_systems(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_magic_images_owner
    ON magic_images(magic_id, position);

-- ----------------------------------------------------------------------------
-- Liens entre éléments : les peuples et la magie rejoignent les sortes acceptées
-- ----------------------------------------------------------------------------

CREATE TABLE world_links_new (
    id           TEXT PRIMARY KEY,
    source_kind  TEXT NOT NULL CHECK (source_kind IN ('character', 'location', 'item', 'species', 'faction', 'people', 'magic')),
    source_id    TEXT NOT NULL,
    target_kind  TEXT NOT NULL CHECK (target_kind IN ('character', 'location', 'item', 'species', 'faction', 'people', 'magic')),
    target_id    TEXT NOT NULL,
    type         TEXT NOT NULL,
    label        TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    since_node   TEXT,
    until_node   TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,

    CHECK (source_id <> target_id),
    CHECK (source_kind IN ('item', 'species', 'faction', 'people', 'magic') OR target_kind IN ('item', 'species', 'faction', 'people', 'magic')),

    FOREIGN KEY (since_node) REFERENCES structure_nodes(id) ON DELETE SET NULL,
    FOREIGN KEY (until_node) REFERENCES structure_nodes(id) ON DELETE SET NULL
);

INSERT INTO world_links_new (
    id, source_kind, source_id, target_kind, target_id, type, label, description,
    since_node, until_node, created_at, updated_at
)
SELECT
    id, source_kind, source_id, target_kind, target_id, type, label, description,
    since_node, until_node, created_at, updated_at
FROM world_links;

DROP TABLE world_links;
ALTER TABLE world_links_new RENAME TO world_links;

CREATE INDEX IF NOT EXISTS idx_world_links_source ON world_links(source_id);
CREATE INDEX IF NOT EXISTS idx_world_links_target ON world_links(target_id);
