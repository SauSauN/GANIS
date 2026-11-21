-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 043 : dossiers de la galerie du projet
-- ============================================================================
-- La galerie se range en dossiers et sous-dossiers, comme les notes :
--
-- gallery_folders : dossiers de la galerie. Supprimer un dossier supprime
--   ses sous-dossiers ; les images qu'ils contenaient ne sont pas
--   supprimées, elles reviennent à la racine de la galerie.
-- project_images.folder_id : dossier de l'image (NULL : à la racine).
--
-- Les albums de la migration 042 deviennent des dossiers (un par nom
-- d'album, à la racine) ; la colonne `album` n'est plus utilisée.
-- ============================================================================

CREATE TABLE IF NOT EXISTS gallery_folders (
    id          TEXT PRIMARY KEY,
    parent_id   TEXT,
    name        TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,

    FOREIGN KEY (parent_id) REFERENCES gallery_folders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gallery_folders_parent ON gallery_folders(parent_id, position);

ALTER TABLE project_images ADD COLUMN folder_id TEXT REFERENCES gallery_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_images_folder ON project_images(folder_id);

-- Albums existants → dossiers.
INSERT INTO gallery_folders (id, parent_id, name, position, created_at, updated_at)
SELECT
    lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' ||
          substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
    NULL,
    album,
    ROW_NUMBER() OVER (ORDER BY album) - 1,
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM (SELECT DISTINCT album FROM project_images WHERE album IS NOT NULL);

UPDATE project_images
SET folder_id = (SELECT f.id FROM gallery_folders f WHERE f.name = project_images.album AND f.parent_id IS NULL)
WHERE album IS NOT NULL;

UPDATE project_images SET album = NULL;
