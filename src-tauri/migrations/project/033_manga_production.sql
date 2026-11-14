-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 033 : fabrication des pages et pages hors récit (manga / BD)
-- ============================================================================
-- Fabrication : chaque page avance par étapes. `production_stage` est la
-- dernière étape terminée :
--   storyboard (le « name »), pencils (crayonné), inks (encrage),
--   tones (trames), lettering (lettrage), done (page validée) ;
--   NULL : rien de commencé.
-- Les valeurs sont vérifiées par Rust (pas de CHECK : SQLite ne sait pas en
-- modifier un sans recréer la table). Une version restaurée ne change pas
-- l'étape (voir `history_service`).
--
-- Pages hors récit (`manga_extra_pages`) : les pages d'un tome qui ne sont
-- pas l'histoire (couverture, page de titre, sommaire, crédits, présentation
-- des personnages, préface, bonus, postface, annonce du tome suivant, page
-- blanche, autre).
--   volume_id  : tome (élément du découpage) ; NULL si le projet n'a pas de
--                tomes. Supprimer le tome les emporte (corbeille).
--   placement  : front (avant le récit) ou back (après).
--   position   : ordre dans son groupe (tome + placement).
--   kind       : sorte de page (liste vérifiée par Rust). Les couvertures
--                (cover, backCover) ne comptent pas dans les folios.
--   title      : titre libre (« Bonus : croquis de Sora »).
--   notes      : indications pour le dessinateur ou la mise en page.
-- ============================================================================

ALTER TABLE structure_nodes ADD COLUMN production_stage TEXT;

CREATE TABLE IF NOT EXISTS manga_extra_pages (
    id                TEXT PRIMARY KEY,
    volume_id         TEXT,
    placement         TEXT NOT NULL,
    position          INTEGER NOT NULL DEFAULT 0,
    kind              TEXT NOT NULL,
    title             TEXT NOT NULL DEFAULT '',
    notes             TEXT NOT NULL DEFAULT '',
    production_stage  TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,

    FOREIGN KEY (volume_id) REFERENCES structure_nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_manga_extra_pages_volume
    ON manga_extra_pages(volume_id, placement, position);
