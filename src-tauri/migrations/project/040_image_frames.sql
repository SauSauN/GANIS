-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 040 : cadrage des images
-- ============================================================================
-- Toute image ajoutée (photo d'un personnage, image d'un lieu, d'un objet,
-- de la faune et flore…, images des galeries) peut être cadrée : on choisit
-- la zone affichée sans toucher à l'image elle-même, qui reste entière et
-- peut être recadrée à tout moment.
--
-- `key` : l'image cadrée — « character:<id> », « location:<id> »,
-- « item:<id> »… pour l'image principale d'une fiche, « image:<id> » pour
-- une image de galerie. `x`, `y` : point de l'image (en % de sa largeur et
-- de sa hauteur) gardé à la même place dans le cadre ; `zoom` : 1 (toute
-- l'image tient dans le cadre) à 5. Pas de ligne : image centrée, sans zoom.
-- ============================================================================

CREATE TABLE IF NOT EXISTS image_frames (
    key         TEXT PRIMARY KEY,
    x           REAL NOT NULL DEFAULT 50,
    y           REAL NOT NULL DEFAULT 50,
    zoom        REAL NOT NULL DEFAULT 1,
    updated_at  TEXT NOT NULL
);
