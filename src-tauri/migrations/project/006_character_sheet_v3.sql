-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 006 : fiche en trois niveaux de 15 champs, listes, galerie
-- ============================================================================
-- Niveaux (réglés pour tout le projet) :
--   basic        : l'identité     (Identifier le personnage)
--   intermediate : l'apparence    (Visualiser et reconnaître le personnage)
--   advanced     : la personnalité (Construire un personnage crédible)
--
-- 1. Les champs de l'ancienne fiche sont renommés quand ils ont un
--    équivalent (summary → description, goals → mainGoal…). Les qualités
--    et défauts deviennent des listes d'étiquettes (JSON).
-- 2. Listes personnalisables du projet (genres, statuts, rôles,
--    corpulences) : `character_settings.lists`, objet JSON
--    { "gender": [...], ... }. Une liste absente : valeurs par défaut.
-- 3. Galerie de références visuelles : `character_images`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Champs renommés
-- ----------------------------------------------------------------------------
UPDATE characters SET fields = json_remove(json_set(fields, '$.description', json_extract(fields, '$.summary')), '$.summary')
WHERE json_extract(fields, '$.summary') IS NOT NULL;

UPDATE characters SET fields = json_remove(json_set(fields, '$.mainGoal', json_extract(fields, '$.goals')), '$.goals')
WHERE json_extract(fields, '$.goals') IS NOT NULL;

UPDATE characters SET fields = json_remove(json_set(fields, '$.psychology', json_extract(fields, '$.personality')), '$.personality')
WHERE json_extract(fields, '$.personality') IS NOT NULL;

UPDATE characters SET fields = json_remove(json_set(fields, '$.secret', json_extract(fields, '$.secrets')), '$.secrets')
WHERE json_extract(fields, '$.secrets') IS NOT NULL;

UPDATE characters SET fields = json_remove(json_set(fields, '$.plannedArc', json_extract(fields, '$.arc')), '$.arc')
WHERE json_extract(fields, '$.arc') IS NOT NULL;

UPDATE characters SET fields = json_remove(json_set(fields, '$.formativeEvent', json_extract(fields, '$.backstory')), '$.backstory')
WHERE json_extract(fields, '$.backstory') IS NOT NULL;

UPDATE characters SET fields = json_remove(json_set(fields, '$.silhouette', json_extract(fields, '$.appearance')), '$.appearance')
WHERE json_extract(fields, '$.appearance') IS NOT NULL;

-- Qualités et défauts : texte → liste d'une étiquette. La valeur reste une
-- chaîne (`'' ||` retire le marqueur JSON de json_array).
UPDATE characters SET fields = json_set(fields, '$.strengths', '' || json_array(json_extract(fields, '$.strengths')))
WHERE json_extract(fields, '$.strengths') IS NOT NULL;

UPDATE characters SET fields = json_set(fields, '$.flaws', '' || json_array(json_extract(fields, '$.flaws')))
WHERE json_extract(fields, '$.flaws') IS NOT NULL;

-- Sans équivalent : ajoutés aux notes de l'auteur pour ne rien perdre.
UPDATE characters
SET fields = json_remove(
        json_set(
            fields,
            '$.notes',
            trim(
                coalesce(json_extract(fields, '$.notes'), '')
                || CASE WHEN json_extract(fields, '$.species') IS NOT NULL
                        THEN char(10) || 'Espèce : ' || json_extract(fields, '$.species') ELSE '' END
                || CASE WHEN json_extract(fields, '$.skills') IS NOT NULL
                        THEN char(10) || 'Compétences : ' || json_extract(fields, '$.skills') ELSE '' END,
                char(10)
            )
        ),
        '$.species',
        '$.skills'
    )
WHERE json_extract(fields, '$.species') IS NOT NULL
   OR json_extract(fields, '$.skills') IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Listes personnalisables
-- ----------------------------------------------------------------------------
ALTER TABLE character_settings ADD COLUMN lists TEXT NOT NULL DEFAULT '{}';

-- ----------------------------------------------------------------------------
-- 3. Galerie de références visuelles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS character_images (
    id            TEXT PRIMARY KEY,
    character_id  TEXT NOT NULL,
    mime          TEXT NOT NULL,
    data          BLOB NOT NULL,
    position      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL,

    FOREIGN KEY (character_id)
        REFERENCES characters(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_character_images_character
    ON character_images(character_id, position);
