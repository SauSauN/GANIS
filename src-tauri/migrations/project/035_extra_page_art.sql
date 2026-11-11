-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 035 : dessin d'une page hors récit (manga / BD)
-- ============================================================================
-- Une page hors récit (couverture, page de titre, bonus…) peut recevoir son
-- dessin, une image affichée dans le chemin de fer. Rangé avec la page :
-- il part avec elle à la corbeille et revient avec elle.
--
--   art             : contenu de l'image (PNG, JPEG, GIF, WebP) ; NULL : aucun.
--   art_mime        : type de l'image.
--   art_updated_at  : date du dernier changement (sert à rafraîchir la vignette).
-- ============================================================================

ALTER TABLE manga_extra_pages ADD COLUMN art BLOB;
ALTER TABLE manga_extra_pages ADD COLUMN art_mime TEXT;
ALTER TABLE manga_extra_pages ADD COLUMN art_updated_at TEXT;
