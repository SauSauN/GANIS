-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 034 : affichage des sections « Récit » et « Trame » des fiches
-- ============================================================================
-- Réglage du projet, par module (character, location : les fiches qui ont
-- ces sections, liste vérifiée par Rust). Seul l'affichage change : les
-- liens avec le plan et les événements de la trame restent enregistrés et
-- utilisés partout ailleurs (plan, plateau, lecture, recherche).
--
--   show_story : section « Récit » visible (1) ou masquée (0).
--   show_plot  : section « Trame » visible (1) ou masquée (0).
--
-- Un module sans ligne montre les deux sections.
-- ============================================================================

CREATE TABLE IF NOT EXISTS sheet_display (
    module      TEXT PRIMARY KEY,
    show_story  INTEGER NOT NULL DEFAULT 1,
    show_plot   INTEGER NOT NULL DEFAULT 1,
    updated_at  TEXT NOT NULL
);
