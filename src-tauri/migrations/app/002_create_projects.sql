-- ============================================================================
-- GANIS — Base de données de l'application
-- Migration 002 : métadonnées des projets
-- ============================================================================

CREATE TABLE IF NOT EXISTS projects (
    id              TEXT PRIMARY KEY,
    owner_id        TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    project_type    TEXT NOT NULL
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
    status          TEXT NOT NULL DEFAULT 'preparing'
                    CHECK (
                        status IN (
                            'preparing',
                            'in_progress',
                            'paused',
                            'done'
                        )
                    ),
    is_favorite     INTEGER NOT NULL DEFAULT 0
                    CHECK (is_favorite IN (0, 1)),
    is_archived     INTEGER NOT NULL DEFAULT 0
                    CHECK (is_archived IN (0, 1)),
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,

    FOREIGN KEY (owner_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_projects_owner_id
    ON projects(owner_id);

CREATE INDEX IF NOT EXISTS idx_projects_updated_at
    ON projects(updated_at);

CREATE INDEX IF NOT EXISTS idx_projects_owner_updated
    ON projects(owner_id, updated_at);