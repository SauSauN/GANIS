-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 015 : notes, dossiers de notes et mur de post-it
-- ============================================================================
-- note_folders : dossiers (et sous-dossiers) de notes. Supprimer un dossier
--   supprime ses sous-dossiers ; les notes qu'ils contenaient ne sont pas
--   supprimées, elles reviennent à la racine (« Sans dossier »).
-- notes : notes de l'auteur. `content` est le document de l'éditeur, en
--   JSON (jamais du HTML) ; `excerpt` en est un court extrait en texte brut,
--   pour la liste et la recherche.
-- sticky_notes : post-it du mur (texte court, couleur, position, taille,
--   ordre d'empilement).
-- ============================================================================

CREATE TABLE IF NOT EXISTS note_folders (
    id          TEXT PRIMARY KEY,
    parent_id   TEXT,
    name        TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,

    FOREIGN KEY (parent_id) REFERENCES note_folders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_note_folders_parent ON note_folders(parent_id, position);

CREATE TABLE IF NOT EXISTS notes (
    id          TEXT PRIMARY KEY,
    folder_id   TEXT,
    title       TEXT NOT NULL DEFAULT '',
    content     TEXT NOT NULL DEFAULT '',
    excerpt     TEXT NOT NULL DEFAULT '',
    pinned      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,

    FOREIGN KEY (folder_id) REFERENCES note_folders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);

CREATE TABLE IF NOT EXISTS sticky_notes (
    id          TEXT PRIMARY KEY,
    text        TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT 'yellow',
    x           REAL NOT NULL DEFAULT 0,
    y           REAL NOT NULL DEFAULT 0,
    width       REAL NOT NULL DEFAULT 220,
    height      REAL NOT NULL DEFAULT 180,
    z           INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
