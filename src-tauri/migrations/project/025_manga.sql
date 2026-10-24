-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 025 : scénario de manga / BD
-- ============================================================================
-- Fonctions proposées aux projets de type « Manga / BD » (l'interface ne les
-- montre que pour ce type ; les données restent valides pour tous). Le
-- découpage du modèle est Tome › Chapitre › Page ; on y ajoute :
--
-- - pour un chapitre : objectif narratif (texte), nombre de pages visé,
--   statut du scénario (todo, progress, review, final ; NULL : à préparer) ;
-- - pour une page : fonction narrative (rythme : action, reveal, pause,
--   transition, suspense) et « révélation après le tourné de page » ;
-- - les cases d'une page (`manga_panels`), dans l'ordre : action
--   représentée, cadrage, décor utile, indications au dessinateur, rythme,
--   lieu (fiche existante) et moment de l'action, références à ce qui
--   précède ;
-- - les personnages présents dans une case (`manga_panel_characters`),
--   avec leur état utile à la continuité (blessure, objet, tenue,
--   information connue) ;
-- - les textes d'une case (`manga_panel_texts`), chacun de son type :
--   dialogue, thought (pensée), narration (récitatif), sfx (onomatopée),
--   sign (texte du décor : panneau, lettre, écran…), avec son locuteur ;
-- - les seuils d'alerte de volume de texte (`manga_settings`).
--
-- Les cases appartiennent à leur page : supprimer la page (corbeille) les
-- emporte et la restaurer les ramène ; le `.ganix` les exporte avec elle.
-- ============================================================================

ALTER TABLE structure_nodes ADD COLUMN narrative_goal TEXT NOT NULL DEFAULT '';
ALTER TABLE structure_nodes ADD COLUMN page_goal INTEGER;
ALTER TABLE structure_nodes ADD COLUMN script_status TEXT;
ALTER TABLE structure_nodes ADD COLUMN rhythm TEXT;
ALTER TABLE structure_nodes ADD COLUMN page_turn INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS manga_panels (
    id            TEXT PRIMARY KEY,
    page_id       TEXT NOT NULL,
    position      INTEGER NOT NULL DEFAULT 0,
    action        TEXT NOT NULL DEFAULT '',
    framing       TEXT NOT NULL DEFAULT '',
    setting       TEXT NOT NULL DEFAULT '',
    artist_notes  TEXT NOT NULL DEFAULT '',
    rhythm        TEXT,
    location_id   TEXT,
    moment        TEXT NOT NULL DEFAULT '',
    continuity    TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    FOREIGN KEY (page_id) REFERENCES structure_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_manga_panels_page ON manga_panels(page_id, position);

CREATE TABLE IF NOT EXISTS manga_panel_characters (
    panel_id      TEXT NOT NULL,
    character_id  TEXT NOT NULL,
    position      INTEGER NOT NULL DEFAULT 0,
    state         TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (panel_id, character_id),
    FOREIGN KEY (panel_id) REFERENCES manga_panels(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_manga_panel_characters_character ON manga_panel_characters(character_id);

CREATE TABLE IF NOT EXISTS manga_panel_texts (
    id            TEXT PRIMARY KEY,
    panel_id      TEXT NOT NULL,
    position      INTEGER NOT NULL DEFAULT 0,
    kind          TEXT NOT NULL CHECK (kind IN ('dialogue', 'thought', 'narration', 'sfx', 'sign')),
    character_id  TEXT,
    content       TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    FOREIGN KEY (panel_id) REFERENCES manga_panels(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_manga_panel_texts_panel ON manga_panel_texts(panel_id, position);

CREATE TABLE IF NOT EXISTS manga_settings (
    id               TEXT PRIMARY KEY CHECK (id = 'default'),
    panel_words_max  INTEGER,
    page_words_max   INTEGER,
    updated_at       TEXT NOT NULL
);

INSERT OR IGNORE INTO manga_settings (id, panel_words_max, page_words_max, updated_at)
VALUES ('default', 35, 150, datetime('now'));
