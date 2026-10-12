-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 009 : liens entre personnages et lieux
-- ============================================================================
-- Un lien relie un personnage et un lieu, et apparaît sur les deux fiches :
--   type        : naissance, habite, a grandi, règne, possède, travaille,
--                 fréquente, garde, emprisonné, se cache, exilé, mort, autre ;
--   label       : précision libre (« Maison familiale », « Capitaine de la
--                 garde ») ;
--   description : texte libre ;
--   since / until : éléments du découpage du récit où le lien commence et
--                 finit (NULL : depuis le début / jusqu'à la fin).
--
-- Supprimer le personnage ou le lieu supprime ses liens. Supprimer un
-- élément du découpage remet la borne correspondante à NULL.
--
-- Le champ « Origine » des personnages devient un lien vers un lieu : il
-- contient soit l'identifiant d'un lieu, soit un texte libre (lieu qui
-- n'existe pas encore dans le projet). Les origines déjà saisies qui
-- portent exactement le nom d'un lieu (un seul) y sont rattachées.
-- ============================================================================

CREATE TABLE IF NOT EXISTS character_locations (
    id            TEXT PRIMARY KEY,
    character_id  TEXT NOT NULL,
    location_id   TEXT NOT NULL,
    type          TEXT NOT NULL,
    label         TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    since_node    TEXT,
    until_node    TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,

    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
    FOREIGN KEY (since_node) REFERENCES structure_nodes(id) ON DELETE SET NULL,
    FOREIGN KEY (until_node) REFERENCES structure_nodes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_character_locations_character
    ON character_locations(character_id);
CREATE INDEX IF NOT EXISTS idx_character_locations_location
    ON character_locations(location_id);

UPDATE characters
SET fields = json_set(
        fields,
        '$.origin',
        (
            SELECT l.id FROM locations l
            WHERE lower(trim(l.name)) = lower(trim(json_extract(characters.fields, '$.origin')))
        )
    )
WHERE json_extract(fields, '$.origin') IS NOT NULL
  AND (
        SELECT COUNT(*) FROM locations l
        WHERE lower(trim(l.name)) = lower(trim(json_extract(characters.fields, '$.origin')))
      ) = 1;
