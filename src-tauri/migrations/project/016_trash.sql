-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 016 : corbeille
-- ============================================================================
-- Un élément supprimé (personnage, lieu, élément du découpage, note,
-- dossier, post-it, relation, lien personnage ↔ lieu) n'est plus perdu :
-- avant la suppression, ses lignes — et tout ce qui disparaît avec lui —
-- sont copiées ici (`payload`, JSON). Il peut ainsi être restauré tel
-- quel, jusqu'à ce que la corbeille soit vidée (ou après 30 jours).
--
-- - `kind`    : type d'élément (character, location, structureNode…) ;
-- - `item_id` : identifiant de l'élément supprimé ;
-- - `label`   : nom affiché dans la corbeille ;
-- - `payload` : lignes copiées et modifications à défaire.
-- ============================================================================

CREATE TABLE IF NOT EXISTS trash (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,
    item_id     TEXT NOT NULL,
    label       TEXT NOT NULL DEFAULT '',
    payload     TEXT NOT NULL,
    deleted_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trash_deleted_at ON trash(deleted_at);
