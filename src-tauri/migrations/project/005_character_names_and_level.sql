-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 005 : prénom et nom, niveau de détail par projet
-- ============================================================================
-- 1. Le nom est séparé en prénom (`first_name`) et nom (`last_name`).
--    Les noms existants sont coupés au premier espace :
--    « Aldric Venn » → prénom « Aldric », nom « Venn ».
--
-- 2. Le niveau de détail des fiches n'est plus choisi personnage par
--    personnage : il vaut pour tout le projet (`character_settings`).
--    NULL tant qu'il n'a pas été choisi : l'interface le demande à la
--    création du premier personnage. Un projet qui a déjà des
--    personnages reprend le niveau le plus élevé parmi les leurs.
--    La colonne `characters.detail_level` n'est plus utilisée.
-- ============================================================================

ALTER TABLE characters RENAME COLUMN name TO last_name;
ALTER TABLE characters ADD COLUMN first_name TEXT NOT NULL DEFAULT '';

UPDATE characters
SET first_name = substr(trim(last_name), 1, instr(trim(last_name), ' ') - 1),
    last_name  = trim(substr(trim(last_name), instr(trim(last_name), ' ') + 1))
WHERE instr(trim(last_name), ' ') > 0;

CREATE INDEX IF NOT EXISTS idx_characters_first_name
    ON characters(first_name COLLATE NOCASE);

-- ----------------------------------------------------------------------------
-- Table : character_settings (une seule ligne, 'default')
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS character_settings (
    id            TEXT PRIMARY KEY CHECK (id = 'default'),
    detail_level  TEXT CHECK (detail_level IN ('basic', 'intermediate', 'advanced')),
    updated_at    TEXT NOT NULL
);

INSERT OR IGNORE INTO character_settings (id, detail_level, updated_at)
VALUES (
    'default',
    (
        SELECT detail_level FROM characters
        ORDER BY CASE detail_level
            WHEN 'advanced' THEN 3
            WHEN 'intermediate' THEN 2
            ELSE 1
        END DESC
        LIMIT 1
    ),
    datetime('now')
);
