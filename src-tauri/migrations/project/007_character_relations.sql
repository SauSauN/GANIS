-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 007 : relations entre personnages
-- ============================================================================
-- Une relation relie deux personnages :
--   type        : famille, amour, amitié, alliance, travail, mentor,
--                 politique, rivalité, inimitié, trahison, secret, autre ;
--   label       : nom libre (« Frère aîné », « Ancienne fiancée »…) ;
--   directed    : 1 = à sens unique (de source vers cible), 0 = réciproque ;
--   intensity   : 1 (faible) à 5 (très forte) ;
--   sentiment   : positive, neutral, negative ;
--   since / until : éléments du découpage du récit (partie, chapitre,
--                 scène…) où la relation commence et finit. NULL : depuis
--                 le début / jusqu'à la fin. Sert à afficher les relations
--                 à un moment précis de l'histoire.
--
-- Supprimer un personnage supprime ses relations. Supprimer un élément du
-- découpage remet la borne correspondante à NULL.
--
-- `character_graph_positions` : positions des personnages dans la
-- disposition libre du graphe (déplacés à la main).
-- ============================================================================

CREATE TABLE IF NOT EXISTS character_relations (
    id           TEXT PRIMARY KEY,
    source_id    TEXT NOT NULL,
    target_id    TEXT NOT NULL,
    type         TEXT NOT NULL,
    label        TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    directed     INTEGER NOT NULL DEFAULT 0 CHECK (directed IN (0, 1)),
    intensity    INTEGER NOT NULL DEFAULT 3 CHECK (intensity BETWEEN 1 AND 5),
    sentiment    TEXT NOT NULL DEFAULT 'neutral'
                 CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    since_node   TEXT,
    until_node   TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,

    CHECK (source_id <> target_id),
    FOREIGN KEY (source_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (since_node) REFERENCES structure_nodes(id) ON DELETE SET NULL,
    FOREIGN KEY (until_node) REFERENCES structure_nodes(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_character_relations_source ON character_relations(source_id);
CREATE INDEX IF NOT EXISTS idx_character_relations_target ON character_relations(target_id);

CREATE TABLE IF NOT EXISTS character_graph_positions (
    character_id  TEXT PRIMARY KEY,
    x             REAL NOT NULL,
    y             REAL NOT NULL,

    FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
);
