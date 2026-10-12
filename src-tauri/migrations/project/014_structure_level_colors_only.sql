-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 014 : couleurs choisies par niveau seulement
-- ============================================================================
-- Les couleurs du découpage se règlent dans les paramètres du projet, une
-- par niveau (`structure_settings.levels`) : chaque élément prend la
-- couleur de son niveau. La couleur propre d'un élément (migration 013)
-- n'existe plus.
-- ============================================================================

ALTER TABLE structure_nodes DROP COLUMN color;
