-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 012 : personnages et lieux liés aux éléments du découpage
-- ============================================================================
-- Fiche d'un élément du découpage (chapitre, scène…) : les personnages et
-- les lieux qui y figurent. Un personnage ou un lieu n'est lié qu'une fois
-- à un même élément, avec un rôle :
--   personnages : present (présent), pov (point de vue), mentioned (cité) ;
--   lieux       : setting (lieu de l'action), mentioned (cité).
-- Les liens apparaissent aussi sur les fiches des personnages et des lieux
-- (« Dans le récit »).
--
-- Supprimer l'élément, le personnage ou le lieu supprime ses liens.
-- ============================================================================

CREATE TABLE IF NOT EXISTS structure_node_characters (
    node_id       TEXT NOT NULL,
    character_id  TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'present',
    created_at    TEXT NOT NULL,

    PRIMARY KEY (node_id, character_id),
    FOREIGN KEY (node_id) REFERENCES structure_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_structure_node_characters_character
    ON structure_node_characters(character_id);

CREATE TABLE IF NOT EXISTS structure_node_locations (
    node_id      TEXT NOT NULL,
    location_id  TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'setting',
    created_at   TEXT NOT NULL,

    PRIMARY KEY (node_id, location_id),
    FOREIGN KEY (node_id) REFERENCES structure_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_structure_node_locations_location
    ON structure_node_locations(location_id);
