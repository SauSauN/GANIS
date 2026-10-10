-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 004 : personnages
-- ============================================================================
-- L'ancienne table `characters` (migration 001, jamais utilisée) est
-- remplacée.
--
-- Fiche à trois niveaux de détail (`detail_level`) :
--   basic        : l'essentiel (identité, apparence, personnalité) ;
--   intermediate : + parcours, objectifs, qualités, défauts… ;
--   advanced     : + secrets, peurs, arc, façon de parler…
-- La liste des champs de chaque niveau est définie par Rust
-- (`character_service::FIELDS`) et par l'interface (`lib/characters.ts`).
--
-- Les champs descriptifs sont rangés dans `fields` (objet JSON
-- { "clé": "texte" }) : ajouter un champ, ou laisser un package en
-- ajouter, ne demande pas de migration. Passer à un niveau inférieur
-- masque des champs mais ne les efface pas.
--
-- Le rôle et le statut ont leur colonne : ils servent au classement.
--
-- La photo est dans une table à part : la liste des personnages ne
-- charge pas les images. Elle est dans la base du projet, donc chiffrée
-- avec elle (SQLCipher) et emportée dans un export .ganix.
-- ============================================================================

DROP TABLE IF EXISTS characters;

-- ----------------------------------------------------------------------------
-- Table : characters
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS characters (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'main',
    status        TEXT NOT NULL DEFAULT 'alive',
    detail_level  TEXT NOT NULL DEFAULT 'basic'
                  CHECK (detail_level IN ('basic', 'intermediate', 'advanced')),
    fields        TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_characters_name ON characters(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_characters_role ON characters(role);

-- ----------------------------------------------------------------------------
-- Table : character_portraits (photo d'un personnage, au plus une)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS character_portraits (
    character_id  TEXT PRIMARY KEY,
    mime          TEXT NOT NULL,
    data          BLOB NOT NULL,
    updated_at    TEXT NOT NULL,

    FOREIGN KEY (character_id)
        REFERENCES characters(id)
        ON DELETE CASCADE
);
