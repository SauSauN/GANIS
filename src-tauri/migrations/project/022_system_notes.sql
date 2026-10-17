-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 022 : notes système
-- ============================================================================
-- Option du projet (désactivée par défaut) : un dossier « Notes système »
-- reprend, sous forme de notes modifiables, la description et les notes de
-- l'auteur de chaque personnage et lieu, et le résumé de chaque élément du
-- découpage. Les titres sont fixes ; modifier le texte d'une note modifie la
-- fiche, et inversement (voir `system_note_service`).
--
-- system_notes_settings : l'option et la langue des titres.
-- system_note_folders : dossiers créés par GANIS (racine et un par sorte).
-- system_notes : quelle note reprend quel élément.
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_notes_settings (
    id          TEXT PRIMARY KEY CHECK (id = 'default'),
    enabled     INTEGER NOT NULL DEFAULT 0,
    language    TEXT NOT NULL DEFAULT 'fr',
    updated_at  TEXT NOT NULL
);

INSERT OR IGNORE INTO system_notes_settings (id, enabled, language, updated_at)
VALUES ('default', 0, 'fr', datetime('now'));

CREATE TABLE IF NOT EXISTS system_note_folders (
    folder_id  TEXT PRIMARY KEY,
    role       TEXT NOT NULL UNIQUE CHECK (role IN ('root', 'character', 'location', 'node')),

    FOREIGN KEY (folder_id) REFERENCES note_folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS system_notes (
    note_id    TEXT PRIMARY KEY,
    kind       TEXT NOT NULL CHECK (kind IN ('character', 'location', 'node')),
    entity_id  TEXT NOT NULL,

    UNIQUE (kind, entity_id),
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);
