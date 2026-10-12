-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 013 : couleur propre d'un élément du découpage
-- ============================================================================
-- Chaque niveau du découpage a une couleur (par défaut, ou choisie dans les
-- niveaux : `structure_settings.levels`). Un élément prend la couleur de son
-- niveau, sauf s'il a la sienne :
--   color : « #rrggbb », ou NULL (couleur du niveau).
-- ============================================================================

ALTER TABLE structure_nodes ADD COLUMN color TEXT;
