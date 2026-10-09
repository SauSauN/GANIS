-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 001 : initialisation du schéma
-- ============================================================================
-- Chaque projet a sa propre base SQLite pour garantir l'isolation et la
-- portabilité. Les identifiants sont des UUID v4 stockés en texte.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table : characters (Personnages)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS characters (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    role        TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name);

-- ----------------------------------------------------------------------------
-- Table : locations (Lieux)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(name);

-- ----------------------------------------------------------------------------
-- Table : chapters (Chapitres)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chapters (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    synopsis    TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chapters_order ON chapters(order_index);

-- ----------------------------------------------------------------------------
-- Table : scenes (Scènes)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scenes (
    id          TEXT PRIMARY KEY,
    chapter_id  TEXT NOT NULL,
    title       TEXT NOT NULL,
    content     TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scenes_chapter ON scenes(chapter_id);
CREATE INDEX IF NOT EXISTS idx_scenes_order ON scenes(chapter_id, order_index);

-- ----------------------------------------------------------------------------
-- Table de liaison : scene_characters
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scene_characters (
    scene_id     TEXT NOT NULL,
    character_id TEXT NOT NULL,
    PRIMARY KEY (scene_id, character_id),
    FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scene_characters_char ON scene_characters(character_id);

-- ----------------------------------------------------------------------------
-- Table de liaison : scene_locations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scene_locations (
    scene_id    TEXT NOT NULL,
    location_id TEXT NOT NULL,
    PRIMARY KEY (scene_id, location_id),
    FOREIGN KEY (scene_id) REFERENCES scenes(id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scene_locations_loc ON scene_locations(location_id);