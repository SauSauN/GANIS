-- ============================================================================
-- GANIS — Base de données de l'application
-- Migration 005 : packages créés par les utilisateurs
-- ============================================================================
-- Un package créé localement (pour l'instant : un thème) appartient à son
-- auteur et s'utilise directement, sans téléchargement ni installation.
--
-- Les packages système (fournis avec GANIS) ne sont pas stockés ici : ils
-- sont intégrés à l'application.
--
-- `package_id` est l'identifiant public du package (`auteur.nom`, §21.2).
-- Il reste stable quand le nom affiché change : il servira aux mises à jour
-- et au partage (.ganixpkg), prévus plus tard.
--
-- `data` contient les données propres au type, en JSON validé par Rust
-- (pour un thème : couleurs claires, couleurs sombres, arrondi).
-- ============================================================================

CREATE TABLE IF NOT EXISTS packages (
    id              TEXT PRIMARY KEY,
    owner_id        TEXT NOT NULL,
    package_id      TEXT NOT NULL UNIQUE,
    package_type    TEXT NOT NULL
                    CHECK (package_type IN ('theme')),
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    version         TEXT NOT NULL DEFAULT '1.0.0',
    data            TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,

    FOREIGN KEY (owner_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_packages_owner_id
    ON packages(owner_id);
