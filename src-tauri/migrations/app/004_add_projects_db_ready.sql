-- ============================================================================
-- GANIS — Base de données de l'application
-- Migration 004 : état de la base de données propre à chaque projet
-- ============================================================================
-- `db_ready` vaut 1 lorsque la base du projet a été créée dans le dossier
-- de données de l'application. Si elle vaut 1 et que le fichier a disparu,
-- l'ouverture du projet échoue avec une erreur claire au lieu de recréer
-- une base vide en silence.
--
-- Les projets créés avant cette migration valent 0 : leur base est créée
-- (ou récupérée depuis l'ancien dossier temporaire) à la première ouverture.
-- ============================================================================

ALTER TABLE projects ADD COLUMN db_ready INTEGER NOT NULL DEFAULT 0;