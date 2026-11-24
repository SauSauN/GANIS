-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 047 : arcs des personnages, planches d'inspiration
-- ============================================================================
-- Arc d'un personnage : ce qu'il croit au départ et ce qu'il comprend à la
-- fin, son désir et son besoin, puis ses étapes chapitre par chapitre (état
-- intérieur de -5 à +5, choix, conséquence). Un document JSON par personnage
-- (voir `character_arc_service.rs`) ; les étapes désignent les éléments du
-- découpage par leur identifiant, un élément supprimé est simplement ignoré.
--
-- Planche d'inspiration : une surface libre où l'auteur dispose images (de
-- la galerie du projet, désignées par leur identifiant), palettes de
-- couleurs, citations, notes et titres. Ses éléments sont un document JSON
-- (voir `board_service.rs`).
-- ============================================================================

CREATE TABLE IF NOT EXISTS character_arcs (
    character_id  TEXT PRIMARY KEY,
    data          TEXT NOT NULL DEFAULT '',
    updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inspiration_boards (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    data        TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
