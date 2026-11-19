-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 038 : scénario de série
-- ============================================================================
-- Fonctions proposées aux projets de type « Série » (l'interface ne les
-- montre que pour ce type ; les données restent valides pour tous). Le
-- découpage du modèle est Saison › Épisode › Scène ; on y ajoute :
--
-- - pour un épisode : logline (une phrase), durée visée (minutes), statut
--   d'écriture (idea, outline, draft, revision, final ; NULL : idée) et
--   scénariste attribué (texte libre). Le résumé reste celui de l'élément ;
-- - pour une scène : l'en-tête du scénario — intérieur / extérieur
--   (int, ext, intExt), lieu (fiche existante, sans clé étrangère : un lieu
--   supprimé puis restauré retrouve ses scènes ; l'interface ignore un lieu
--   inconnu) et moment (day, night, morning, evening, dawn, dusk,
--   continuous, later) ;
-- - les éléments du scénario d'une scène (`series_scene_blocks`), dans
--   l'ordre, chacun de son type : action (description), dialogue (avec son
--   personnage et une didascalie facultative), transition (CUT TO…), shot
--   (indication de plan) et note (non imprimée).
--
-- Les éléments appartiennent à leur scène : supprimer la scène (corbeille)
-- les emporte et la restaurer les ramène ; le `.ganix` les exporte avec elle.
-- ============================================================================

ALTER TABLE structure_nodes ADD COLUMN logline TEXT NOT NULL DEFAULT '';
ALTER TABLE structure_nodes ADD COLUMN runtime_goal INTEGER;
ALTER TABLE structure_nodes ADD COLUMN episode_status TEXT;
ALTER TABLE structure_nodes ADD COLUMN writer TEXT NOT NULL DEFAULT '';
ALTER TABLE structure_nodes ADD COLUMN scene_place TEXT;
ALTER TABLE structure_nodes ADD COLUMN scene_location_id TEXT;
ALTER TABLE structure_nodes ADD COLUMN scene_time TEXT;

CREATE TABLE IF NOT EXISTS series_scene_blocks (
    id             TEXT PRIMARY KEY,
    scene_id       TEXT NOT NULL,
    position       INTEGER NOT NULL DEFAULT 0,
    kind           TEXT NOT NULL CHECK (kind IN ('action', 'dialogue', 'transition', 'shot', 'note')),
    character_id   TEXT,
    parenthetical  TEXT NOT NULL DEFAULT '',
    content        TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    FOREIGN KEY (scene_id) REFERENCES structure_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_series_scene_blocks_scene ON series_scene_blocks(scene_id, position);
