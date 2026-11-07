-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 032 : glossaire
-- ============================================================================
-- Termes propres à l'histoire (mots inventés, lieux, concepts, titres…),
-- rangés par ordre alphabétique dans Détails › Glossaire.
--
--   term        : le terme tel qu'il s'écrit dans l'histoire.
--   definition  : sa définition (texte simple, sauts de ligne compris).
--   category    : catégorie libre et facultative (« Lieu », « Titre »…).
--   links       : fiches liées, en JSON :
--                 [{"kind": "character", "id": "…"}, …]
--                 sortes : character, location, item, species, faction,
--                 people, magic (vérifiées par Rust). Une fiche supprimée
--                 depuis est simplement ignorée par l'interface.
-- ============================================================================

CREATE TABLE IF NOT EXISTS glossary_terms (
    id          TEXT PRIMARY KEY,
    term        TEXT NOT NULL,
    definition  TEXT NOT NULL DEFAULT '',
    category    TEXT NOT NULL DEFAULT '',
    links       TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_glossary_terms_term ON glossary_terms(term COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_glossary_terms_category ON glossary_terms(category COLLATE NOCASE);
