-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 041 : arborescence dans le panneau du milieu
-- ============================================================================
-- Modules dont les fiches peuvent en contenir d'autres (lieux, objets, faune
-- et flore, factions, peuples, magie) : le panneau du milieu les montre en
-- arborescence (1, par défaut) ou en simple liste, comme les personnages (0).
-- Réglage du projet ; il ne change que l'affichage du panneau. La vue
-- « Liste » garde toujours son arborescence.
-- ============================================================================

ALTER TABLE sheet_display ADD COLUMN panel_tree INTEGER NOT NULL DEFAULT 1;
