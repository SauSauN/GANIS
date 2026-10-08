-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 002 : table du synopsis
-- ============================================================================
-- Un projet ne possède qu'un seul synopsis. Cette table ne contiendra
-- donc qu'une seule ligne, identifiée par l'ID fixe 'default'.
--
-- Le synopsis contient :
--   - content   : texte libre décrivant l'histoire (éditeur riche)
--   - genres    : liste JSON de genres (ex. ["Fantasy", "Aventure"])
--   - subgenres : liste JSON de sous-genres (ex. ["Dark Fantasy"])
--   - tone      : liste JSON de tons (ex. ["Sombre", "Épique"])
--
-- Les listes sont stockées en JSON (TEXT) pour rester simples et
-- portables : SQLite ne dispose pas de type tableau natif.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table : synopsis
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS synopsis (
    id          TEXT PRIMARY KEY,
    content     TEXT NOT NULL DEFAULT '',
    genres      TEXT NOT NULL DEFAULT '[]',
    subgenres   TEXT NOT NULL DEFAULT '[]',
    tone        TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- ----------------------------------------------------------------------------
-- Ligne unique du synopsis
-- ----------------------------------------------------------------------------
-- Insère la ligne par défaut si elle n'existe pas.
-- L'ID 'default' garantit qu'il n'y aura jamais qu'une seule ligne
-- dans cette table, quel que soit le nombre d'appels à la migration.
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO synopsis (
    id,
    content,
    genres,
    subgenres,
    tone,
    created_at,
    updated_at
)
VALUES (
    'default',
    '',
    '[]',
    '[]',
    '[]',
    datetime('now'),
    datetime('now')
);