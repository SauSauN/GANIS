-- ============================================================================
-- GANIS — Base de données de l'application
-- Migration 008 : corbeille des projets
-- ============================================================================
-- Supprimer un projet le place d'abord dans la corbeille : `deleted_at`
-- reçoit la date de suppression. Le projet disparaît du tableau de bord mais
-- garde sa base et sa clé ; il peut être restauré pendant 30 jours.
--
-- Passé ce délai (ou par « Supprimer définitivement »), la ligne est effacée
-- avec sa clé et le dossier du projet est supprimé : la suppression est
-- alors définitive.
--
-- `deleted_at` NULL : projet actif.
-- ============================================================================

ALTER TABLE projects ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_deleted_at
    ON projects(deleted_at);
