-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 042 : galerie du projet, description et albums
-- ============================================================================
-- Chaque image de la galerie (`project_images`) peut maintenant avoir :
--   - un nom          : la colonne `caption` existante ;
--   - une description : `description`, texte libre ;
--   - un album        : `album`, pour ranger les images par thème
--                       (cartes, ambiances, personnages…).
-- L'ordre des images (`position`) se change par glisser-déposer.
--
-- NULL : non renseigné (toutes les images existantes).
-- ============================================================================

ALTER TABLE project_images ADD COLUMN description TEXT;
ALTER TABLE project_images ADD COLUMN album TEXT;
