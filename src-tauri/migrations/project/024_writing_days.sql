-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 024 : mots écrits par jour (roman)
-- ============================================================================
-- - `work_days.words` : mots écrits ce jour-là dans le texte des éléments
--   du découpage, en solde net (mots ajoutés moins mots retirés). Compté par
--   Rust à chaque enregistrement d'un texte écrit dans GANIS ; un import de
--   manuscrit ne compte pas (ce n'est pas de l'écriture du jour) ;
-- - `structure_settings.daily_goal` : objectif de mots par jour (NULL :
--   aucun).
-- ============================================================================

ALTER TABLE work_days ADD COLUMN words INTEGER NOT NULL DEFAULT 0;
ALTER TABLE structure_settings ADD COLUMN daily_goal INTEGER;
