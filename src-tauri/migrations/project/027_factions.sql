-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 027 : factions
-- ============================================================================
-- Troisième module facultatif du monde, désactivé par défaut, sur le modèle
-- des objets (migration 026) : guildes, ordres, clans, armées, cultes,
-- sociétés secrètes… (voir src/lib/factionCatalog.json).
--
--   parent_id : faction dont celle-ci est une branche (une section, une
--               cellule). Pas de boucle (vérifié par Rust).
--
-- Les membres, le chef, les alliés, les ennemis et le siège se notent par
-- des liens du monde (« Aldric dirige l'Ordre d'Aval »). La table
-- world_links est recréée pour accepter les factions : SQLite ne sait pas
-- modifier une contrainte CHECK. Les liens existants sont recopiés tels
-- quels.
-- ============================================================================

CREATE TABLE IF NOT EXISTS factions (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,
    parent_id   TEXT,
    status      TEXT NOT NULL DEFAULT 'active',
    fields      TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,

    FOREIGN KEY (parent_id)
        REFERENCES factions(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_factions_name ON factions(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_factions_type ON factions(type);
CREATE INDEX IF NOT EXISTS idx_factions_parent ON factions(parent_id);

CREATE TABLE IF NOT EXISTS faction_settings (
    id            TEXT PRIMARY KEY CHECK (id = 'default'),
    enabled       INTEGER NOT NULL DEFAULT 0,
    categories    TEXT NOT NULL DEFAULT '[]',
    detail_level  TEXT CHECK (detail_level IN ('basic', 'intermediate', 'advanced')),
    custom_types  TEXT NOT NULL DEFAULT '[]',
    lists         TEXT NOT NULL DEFAULT '{}',
    updated_at    TEXT NOT NULL
);

INSERT OR IGNORE INTO faction_settings (id, enabled, categories, custom_types, lists, updated_at)
VALUES ('default', 0, '[]', '[]', '{}', datetime('now'));

CREATE TABLE IF NOT EXISTS faction_portraits (
    faction_id  TEXT PRIMARY KEY,
    mime        TEXT NOT NULL,
    data        BLOB NOT NULL,
    updated_at  TEXT NOT NULL,

    FOREIGN KEY (faction_id)
        REFERENCES factions(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS faction_images (
    id          TEXT PRIMARY KEY,
    faction_id  TEXT NOT NULL,
    mime        TEXT NOT NULL,
    data        BLOB NOT NULL,
    caption     TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,

    FOREIGN KEY (faction_id)
        REFERENCES factions(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_faction_images_faction
    ON faction_images(faction_id, position);

-- ----------------------------------------------------------------------------
-- Liens entre éléments : les factions rejoignent les sortes acceptées
-- ----------------------------------------------------------------------------

CREATE TABLE world_links_new (
    id           TEXT PRIMARY KEY,
    source_kind  TEXT NOT NULL CHECK (source_kind IN ('character', 'location', 'item', 'species', 'faction')),
    source_id    TEXT NOT NULL,
    target_kind  TEXT NOT NULL CHECK (target_kind IN ('character', 'location', 'item', 'species', 'faction')),
    target_id    TEXT NOT NULL,
    type         TEXT NOT NULL,
    label        TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    since_node   TEXT,
    until_node   TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,

    CHECK (source_id <> target_id),
    CHECK (source_kind IN ('item', 'species', 'faction') OR target_kind IN ('item', 'species', 'faction')),

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
