-- ============================================================================
-- GANIS — Base de données de l'application
-- Migration 012 : documents reçus
-- ============================================================================
-- Documents arrivés avec un projet importé (.ganix) : leur première
-- ouverture dans une autre application demande une confirmation.
--
-- La liste est gardée ici, et non dans la base du projet : un fichier .ganix
-- fabriqué ne peut donc pas l'effacer (lignes, corbeille…).
-- ============================================================================

CREATE TABLE IF NOT EXISTS received_documents (
    project_id   TEXT NOT NULL,
    document_id  TEXT NOT NULL,
    received_at  TEXT NOT NULL,
    PRIMARY KEY (project_id, document_id)
);
