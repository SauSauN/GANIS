-- ============================================================================
-- GANIS — Base de données de l'application
-- Migration 006 : chiffrement des données (voir `src/security/mod.rs`)
-- ============================================================================
-- Chaque compte possède une clé de compte, jamais stockée en clair : elle
-- est enfermée dans des « verrous », un par façon de l'ouvrir (mot de passe,
-- clé de récupération, et plus tard d'autres méthodes).
--
-- Les données personnelles passent dans des colonnes chiffrées
-- (`*_sealed`). Les anciennes colonnes en clair sont vidées au premier
-- passage de chaque compte et de chaque projet dans la nouvelle version.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table : user_key_slots (verrous de la clé de compte)
-- ----------------------------------------------------------------------------
-- `kind` n'a volontairement pas de contrainte CHECK : SQLite ne permet pas
-- de la modifier, et de nouveaux types de verrous viendront (serveur…).
-- Le type est validé par Rust.
--
-- `kdf_*` : paramètres Argon2id utilisés pour ce verrou. Ils sont gardés
-- pour pouvoir renforcer la dérivation plus tard sans casser les comptes.
CREATE TABLE IF NOT EXISTS user_key_slots (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL,
    kind                TEXT NOT NULL,
    kdf_salt            TEXT NOT NULL,
    kdf_memory_kib      INTEGER NOT NULL,
    kdf_iterations      INTEGER NOT NULL,
    kdf_parallelism     INTEGER NOT NULL,
    wrapped_key         TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL,

    UNIQUE (user_id, kind),

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_key_slots_user_id
    ON user_key_slots(user_id);

-- ----------------------------------------------------------------------------
-- Utilisateurs : e-mail chiffré
-- ----------------------------------------------------------------------------
-- `email` (en clair) reste NULL pour les comptes chiffrés. Il ne sert plus
-- qu'aux comptes pas encore passés à la nouvelle version, ou créés par un
-- administrateur et jamais connectés.
ALTER TABLE users ADD COLUMN email_sealed TEXT;

-- ----------------------------------------------------------------------------
-- Projets : nom et description chiffrés, clé du projet
-- ----------------------------------------------------------------------------
-- `wrapped_key` : clé du projet enfermée par la clé du compte. NULL signifie
-- que le projet date d'avant le chiffrement : il est chiffré au prochain
-- passage de son propriétaire (connexion ou ouverture).
ALTER TABLE projects ADD COLUMN name_sealed TEXT;
ALTER TABLE projects ADD COLUMN description_sealed TEXT;
ALTER TABLE projects ADD COLUMN wrapped_key TEXT;
