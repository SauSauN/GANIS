-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 011 : numéros du découpage enregistrés, mise à jour automatique
-- facultative
-- ============================================================================
-- - `structure_settings.auto_numbering` : 1 = les numéros suivent l'ordre du
--   plan (ils changent à chaque ajout, déplacement ou suppression) ;
--   0 (par défaut) = chaque élément garde le numéro reçu à sa création ;
--   « Renuméroter » remet les numéros dans l'ordre à la demande.
-- - `structure_nodes.number` : numéro enregistré (mode non automatique).
--   NULL : pas encore attribué ; GANIS l'attribue à la première lecture
--   (numéro qu'aurait donné la numérotation automatique).
-- ============================================================================

ALTER TABLE structure_nodes ADD COLUMN number INTEGER;

ALTER TABLE structure_settings ADD COLUMN auto_numbering INTEGER NOT NULL DEFAULT 0;
