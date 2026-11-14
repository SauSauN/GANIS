-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 028 : pouvoirs des personnages
-- ============================================================================
-- Carte « Pouvoirs » de la fiche d'un personnage (pouvoirs et capacités,
-- limites et faiblesses de ces pouvoirs), en dehors des trois niveaux de
-- 15 champs. Désactivée par défaut : l'auteur l'active pour le projet dans
-- Paramètres du projet › Personnages. Les champs eux-mêmes restent dans le
-- JSON `characters.fields` ; désactiver la carte ne les efface pas.
-- ============================================================================

ALTER TABLE character_settings ADD COLUMN powers_enabled INTEGER NOT NULL DEFAULT 0;
