-- ============================================================================
-- GANIS — Base de données de l'application
-- Migration 009 : projets d'exemple
-- ============================================================================
-- Un projet créé à partir d'un exemple intégré (roman, manga) garde
-- l'identifiant de cet exemple dans `demo_id`. Cela sert seulement à ne pas
-- le créer deux fois dans le même espace (public, ou privé d'un compte) : le
-- tableau de bord propose alors de l'ouvrir.
--
-- Une copie (dupliquer, importer un .ganix) n'est pas un exemple : elle n'a
-- pas de `demo_id`. Mettre l'exemple à la corbeille permet de le recréer.
--
-- `demo_id` NULL : projet ordinaire (tous les projets existants).
-- ============================================================================

ALTER TABLE projects ADD COLUMN demo_id TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_demo_id
    ON projects(demo_id);
