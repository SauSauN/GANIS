-- ============================================================================
-- GANIS — Base de données de l'application
-- Migration 003 : date de dernière ouverture des projets
-- ============================================================================
-- Permet d'afficher les projets récemment ouverts sur le tableau de bord,
-- indépendamment de la date de dernière modification.
-- ============================================================================

ALTER TABLE projects ADD COLUMN last_opened_at TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_owner_last_opened
    ON projects(owner_id, last_opened_at);