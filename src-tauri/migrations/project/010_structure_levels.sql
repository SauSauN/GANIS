-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 010 : niveaux du découpage personnalisables, numérotation calculée
-- ============================================================================
-- Avant : trois niveaux nommés par le modèle, et un numéro écrit dans le
-- titre à la création (« Chapitre 3 ») — faux dès qu'on déplaçait ou
-- supprimait un élément.
--
-- Maintenant :
-- - `structure_settings.levels` : niveaux choisis par l'utilisateur (JSON :
--   nom, pluriel, numérotation, premier numéro, nombre de chiffres), de 1 à
--   5. NULL : les trois niveaux du modèle, avec sa numérotation par défaut ;
-- - le numéro est calculé par l'interface à partir de l'ordre du plan ;
-- - `structure_nodes.numbered` : 0 pour un élément hors numérotation
--   (prologue, interlude…) ;
-- - le titre devient facultatif : « Chapitre 3 » seul, ou
--   « Chapitre 3 — Le départ ».
-- ============================================================================

ALTER TABLE structure_settings ADD COLUMN levels TEXT;

ALTER TABLE structure_nodes ADD COLUMN numbered INTEGER NOT NULL DEFAULT 1;

-- Titres créés automatiquement (« Chapitre 3 », « Scene 12 »…) : le numéro
-- est désormais calculé, le titre seul s'afficherait en double.
WITH names(name) AS (
    VALUES
        ('Partie'), ('Chapitre'), ('Scène'), ('Tome'), ('Page'), ('Acte'),
        ('Séquence'), ('Saison'), ('Épisode'), ('Quête'), ('Mission'),
        ('Scénario'), ('Session'), ('Rencontre'), ('Section'), ('Élément'),
        ('Part'), ('Chapter'), ('Scene'), ('Volume'), ('Act'), ('Sequence'),
        ('Season'), ('Episode'), ('Quest'), ('Scenario'), ('Encounter'), ('Item')
)
UPDATE structure_nodes
SET title = ''
WHERE EXISTS (
    SELECT 1
    FROM names
    WHERE substr(structure_nodes.title, 1, length(names.name) + 1) = names.name || ' '
      AND length(structure_nodes.title) > length(names.name) + 1
      AND substr(structure_nodes.title, length(names.name) + 2) NOT GLOB '*[^0-9]*'
);
