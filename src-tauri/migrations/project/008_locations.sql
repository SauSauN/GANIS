-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 008 : lieux
-- ============================================================================
-- Un lieu a :
--   name       : son nom (« Valona », « Forêt d'Ébène ») ;
--   type       : un type par défaut (city, kingdom, forest… voir
--                src/lib/locationCatalog.json) ou un type ajouté par
--                l'auteur (identifiant « custom-… », décrit dans
--                location_settings.custom_types). La catégorie (les six
--                familles) se déduit du type : elle n'est pas enregistrée ;
--   parent_id  : le lieu qui le contient (NULL : tout en haut). Un lieu ne
--                peut pas être contenu dans lui-même ni dans un de ses
--                descendants (vérifié par Rust) ;
--   status     : existant, détruit, caché… (liste personnalisable) ;
--   fields     : tous les autres champs de la fiche, en JSON. Les champs
--                communs, ceux de la catégorie et ceux du type sont
--                mélangés : changer de type n'efface rien.
--
-- Supprimer un lieu : ses lieux contenus remontent d'un niveau (fait par
-- Rust juste avant la suppression). Par sécurité, la base remet leur
-- parent à NULL si elle supprime un lieu elle-même.
--
-- `location_settings` : réglages des lieux du projet (une seule ligne) :
--   custom_types : types ajoutés par l'auteur, [{id, name, category}] ;
--   lists        : listes personnalisées, ex. {"status": [...]}.
--
-- `location_portraits` : image principale ; `location_images` : galerie
-- (cartes, plans, références), avec une légende facultative.
--
-- La migration 001 avait créé une première table `locations` (nom et
-- description), jamais utilisée par l'interface. Elle est remplacée : ses
-- éventuelles lignes sont reprises (description dans `fields`, type
-- « région » faute de mieux, modifiable ensuite).
-- ============================================================================

ALTER TABLE locations RENAME TO locations_legacy;

CREATE TABLE locations (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    type        TEXT NOT NULL,
    parent_id   TEXT,
    status      TEXT NOT NULL DEFAULT 'existing',
    fields      TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,

    FOREIGN KEY (parent_id)
        REFERENCES locations(id)
        ON DELETE SET NULL
);

INSERT INTO locations (id, name, type, parent_id, status, fields, created_at, updated_at)
SELECT id,
       name,
       'region',
       NULL,
       'existing',
       CASE WHEN trim(coalesce(description, '')) = '' THEN '{}'
            ELSE json_object('description', trim(description)) END,
       created_at,
       updated_at
FROM locations_legacy;

DROP TABLE locations_legacy;

CREATE INDEX IF NOT EXISTS idx_locations_name ON locations(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(type);
CREATE INDEX IF NOT EXISTS idx_locations_parent ON locations(parent_id);

CREATE TABLE IF NOT EXISTS location_settings (
    id            TEXT PRIMARY KEY CHECK (id = 'default'),
    custom_types  TEXT NOT NULL DEFAULT '[]',
    lists         TEXT NOT NULL DEFAULT '{}',
    updated_at    TEXT NOT NULL
);

INSERT OR IGNORE INTO location_settings (id, custom_types, lists, updated_at)
VALUES ('default', '[]', '{}', datetime('now'));

CREATE TABLE IF NOT EXISTS location_portraits (
    location_id  TEXT PRIMARY KEY,
    mime         TEXT NOT NULL,
    data         BLOB NOT NULL,
    updated_at   TEXT NOT NULL,

    FOREIGN KEY (location_id)
        REFERENCES locations(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS location_images (
    id           TEXT PRIMARY KEY,
    location_id  TEXT NOT NULL,
    mime         TEXT NOT NULL,
    data         BLOB NOT NULL,
    caption      TEXT,
    position     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,

    FOREIGN KEY (location_id)
        REFERENCES locations(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_location_images_location
    ON location_images(location_id, position);
