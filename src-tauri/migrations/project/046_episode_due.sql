-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 046 : échéance d'un épisode
-- ============================================================================
-- Date de remise d'un épisode de série (AAAA-MM-JJ ; NULL : aucune), suivie
-- dans le Suivi des épisodes avec son statut et son scénariste.
-- ============================================================================

ALTER TABLE structure_nodes ADD COLUMN due_date TEXT;
