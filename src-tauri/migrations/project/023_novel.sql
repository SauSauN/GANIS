-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 023 : outils du romancier
-- ============================================================================
-- Fonctions proposées aux projets de type « Roman » (l'interface ne les
-- montre que pour ce type ; les données restent valides pour tous) :
--
-- - texte d'un élément du découpage (en pratique : une scène), écrit dans
--   l'éditeur de GANIS (HTML de l'éditeur, nettoyé à l'affichage), et son
--   nombre de mots, recalculé par Rust à chaque enregistrement. Le
--   manuscrit continu assemble ces textes dans l'ordre du plan : il n'en
--   existe aucune autre copie ;
-- - objectif de mots d'un élément (partie, chapitre, scène) et du
--   manuscrit entier (NULL : aucun objectif) ;
-- - état de rédaction d'un élément (chapitres) : todo, draft, revision,
--   proofread, corrected (NULL : à écrire) ;
-- - paramètres de narration d'une scène : personne grammaticale (first,
--   second, third) et temps verbal (present, past, future). Le point de vue
--   est le personnage lié avec le rôle « pov » (migration 012) ;
-- - dossier de présentation éditoriale : pitch en une phrase, résumé court
--   et résumé long, indépendants du synopsis (une seule ligne, 'default').
--
-- Le texte et les nouveaux champs font partie de la ligne de l'élément :
-- ils sont versionnés, mis à la corbeille et exportés dans le `.ganix` avec
-- lui, sans traitement particulier.
-- ============================================================================

ALTER TABLE structure_nodes ADD COLUMN content TEXT NOT NULL DEFAULT '';
ALTER TABLE structure_nodes ADD COLUMN content_words INTEGER NOT NULL DEFAULT 0;
ALTER TABLE structure_nodes ADD COLUMN word_goal INTEGER;
ALTER TABLE structure_nodes ADD COLUMN writing_status TEXT;
ALTER TABLE structure_nodes ADD COLUMN narrative_person TEXT;
ALTER TABLE structure_nodes ADD COLUMN narrative_tense TEXT;

ALTER TABLE structure_settings ADD COLUMN manuscript_goal INTEGER;

CREATE TABLE IF NOT EXISTS editorial (
    id             TEXT PRIMARY KEY CHECK (id = 'default'),
    pitch          TEXT NOT NULL DEFAULT '',
    summary_short  TEXT NOT NULL DEFAULT '',
    summary_long   TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);

INSERT OR IGNORE INTO editorial (id, created_at, updated_at)
VALUES ('default', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
