-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 039 : état d'un personnage dans un élément du découpage
-- ============================================================================
-- Pour la vue Continuité de tous les types de projet (le manga garde la
-- sienne, case par case) : ce qu'il faut savoir d'un personnage lié à une
-- scène, un chapitre, un épisode… — blessure, tenue, objet porté, ce qu'il
-- sait. Texte libre ; vide : rien de particulier. Un état qui change d'un
-- élément au suivant est signalé par la vue.
-- ============================================================================

ALTER TABLE structure_node_characters ADD COLUMN state TEXT NOT NULL DEFAULT '';
