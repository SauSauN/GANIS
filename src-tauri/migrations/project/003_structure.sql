-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 003 : découpage du récit
-- ============================================================================
-- Les tables `chapters` et `scenes` (jamais utilisées) sont remplacées par
-- une seule table générique : les éléments du découpage.
--
-- Chaque élément a un niveau (0, 1 ou 2). Le nom des niveaux dépend du
-- modèle de découpage du projet, pas de la base :
--   Roman       : Partie   › Chapitre › Scène
--   Manga / BD  : Tome     › Chapitre › Page
--   Film        : Acte     › Séquence › Scène
--   Série       : Saison   › Épisode  › Scène
--   Jeu vidéo   : Acte     › Quête    › Mission
--   Jeu de rôle : Scénario › Session  › Rencontre
-- Changer de modèle ne touche donc à aucune donnée.
--
-- Un élément peut être à la racine, ou sous un élément de niveau
-- inférieur (un chapitre peut être directement à la racine si le roman
-- n'a pas de parties). Ces règles sont vérifiées par Rust.
-- ============================================================================

DROP TABLE IF EXISTS scene_locations;
DROP TABLE IF EXISTS scene_characters;
DROP TABLE IF EXISTS scenes;
DROP TABLE IF EXISTS chapters;

-- ----------------------------------------------------------------------------
-- Table : structure_nodes (éléments du découpage)
-- ----------------------------------------------------------------------------
-- `position` : ordre parmi les éléments de même parent.
-- Supprimer un élément supprime aussi tout ce qu'il contient.
CREATE TABLE IF NOT EXISTS structure_nodes (
    id          TEXT PRIMARY KEY,
    parent_id   TEXT,
    level       INTEGER NOT NULL CHECK (level >= 0),
    title       TEXT NOT NULL,
    summary     TEXT NOT NULL DEFAULT '',
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,

    FOREIGN KEY (parent_id)
        REFERENCES structure_nodes(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_structure_nodes_parent
    ON structure_nodes(parent_id, position);

-- ----------------------------------------------------------------------------
-- Table : structure_settings (une seule ligne, 'default')
-- ----------------------------------------------------------------------------
-- `template` : modèle choisi par l'utilisateur. NULL : le modèle suit le
-- type du projet (et change avec lui).
CREATE TABLE IF NOT EXISTS structure_settings (
    id          TEXT PRIMARY KEY CHECK (id = 'default'),
    template    TEXT,
    updated_at  TEXT NOT NULL
);

INSERT OR IGNORE INTO structure_settings (id, template, updated_at)
VALUES ('default', NULL, datetime('now'));
