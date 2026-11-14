-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 037 : logo du projet et galerie de l'univers
-- ============================================================================
-- `project_logo`   : le logo (ou l'emblème) du projet, affiché en tête de
--                    l'accueil du projet. Une seule ligne au plus (id = 1).
-- `project_images` : galerie de l'univers et de l'histoire (affiches, cartes
--                    du monde, ambiances, croquis…), dans l'ordre d'ajout.
--
-- Comme les autres images, elles sont exportées dans le `.ganix` (table par
-- table) et ne passent pas par la corbeille.
-- ============================================================================

CREATE TABLE IF NOT EXISTS project_logo (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    mime        TEXT NOT NULL,
    data        BLOB NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_images (
    id          TEXT PRIMARY KEY,
    mime        TEXT NOT NULL,
    data        BLOB NOT NULL,
    caption     TEXT,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_images_position
    ON project_images(position, created_at);
