-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 030 : liens familiaux (arbre généalogique)
-- ============================================================================
-- Une relation de type « family » peut préciser son lien, pour dessiner
-- l'arbre généalogique génération par génération :
--
--   'parent'  : la source est le parent de la cible (relation orientée) ;
--   'partner' : couple (époux, compagnons) : même génération ;
--   'sibling' : frères et sœurs : même génération.
--
-- NULL : lien non précisé (relations existantes, ou autre lien familial :
-- cousin, oncle…). Les relations existantes ne changent pas.
-- ============================================================================

ALTER TABLE character_relations
    ADD COLUMN family_link TEXT CHECK (family_link IN ('parent', 'partner', 'sibling'));
