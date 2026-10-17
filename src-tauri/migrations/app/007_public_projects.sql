-- ============================================================================
-- GANIS — Base de données de l'application
-- Migration 007 : projets publics (utilisables sans connexion)
-- ============================================================================
-- Un projet est désormais soit :
--
-- - « private » : il appartient à un compte (`owner_id`), son nom et sa
--   description sont chiffrés avec la clé du compte, sa clé est enfermée
--   par la clé du compte (`wrapped_key`). Fonctionnement inchangé.
--
-- - « public » : créé sans connexion (bouton « Commencer » de l'accueil),
--   ou rendu public par son propriétaire. Il n'appartient à personne
--   (`owner_id` NULL) : toute personne qui utilise GANIS sur cet appareil
--   peut l'ouvrir. Nom et description restent en clair, et la clé de sa
--   base est conservée telle quelle dans `public_key`.
--
-- `owner_id` doit pouvoir valoir NULL : SQLite ne permet pas de retirer une
-- contrainte NOT NULL, la table est donc reconstruite. Aucune autre table
-- ne référence `projects`.
-- ============================================================================

CREATE TABLE projects_new (
    id                  TEXT PRIMARY KEY,
    owner_id            TEXT,
    name                TEXT NOT NULL,
    description         TEXT NOT NULL DEFAULT '',
    project_type        TEXT NOT NULL
                        CHECK (
                            project_type IN (
                                'manga',
                                'novel',
                                'film',
                                'series',
                                'game',
                                'rpg',
                                'custom'
                            )
                        ),
    status              TEXT NOT NULL DEFAULT 'preparing'
                        CHECK (
                            status IN (
                                'preparing',
                                'in_progress',
                                'paused',
                                'done'
                            )
                        ),
    is_favorite         INTEGER NOT NULL DEFAULT 0
                        CHECK (is_favorite IN (0, 1)),
    is_archived         INTEGER NOT NULL DEFAULT 0
                        CHECK (is_archived IN (0, 1)),
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,
    last_opened_at      TEXT,
    db_ready            INTEGER NOT NULL DEFAULT 0,
    name_sealed         TEXT,
    description_sealed  TEXT,
    wrapped_key         TEXT,
    visibility          TEXT NOT NULL DEFAULT 'private'
                        CHECK (visibility IN ('private', 'public')),
    public_key          TEXT,

    -- Un projet privé a un propriétaire ; un projet public n'en a pas et
    -- garde sa clé en clair.
    CHECK (
        (visibility = 'private' AND owner_id IS NOT NULL AND public_key IS NULL)
        OR
        (visibility = 'public' AND owner_id IS NULL AND public_key IS NOT NULL)
    ),

    FOREIGN KEY (owner_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

INSERT INTO projects_new (
    id, owner_id, name, description, project_type, status,
    is_favorite, is_archived, created_at, updated_at, last_opened_at,
    db_ready, name_sealed, description_sealed, wrapped_key,
    visibility, public_key
)
SELECT
    id, owner_id, name, description, project_type, status,
    is_favorite, is_archived, created_at, updated_at, last_opened_at,
    db_ready, name_sealed, description_sealed, wrapped_key,
    'private', NULL
FROM projects;

DROP TABLE projects;

ALTER TABLE projects_new RENAME TO projects;

CREATE INDEX IF NOT EXISTS idx_projects_owner_id
    ON projects(owner_id);

CREATE INDEX IF NOT EXISTS idx_projects_updated_at
    ON projects(updated_at);

CREATE INDEX IF NOT EXISTS idx_projects_owner_updated
    ON projects(owner_id, updated_at);

CREATE INDEX IF NOT EXISTS idx_projects_owner_last_opened
    ON projects(owner_id, last_opened_at);

CREATE INDEX IF NOT EXISTS idx_projects_visibility
    ON projects(visibility);
