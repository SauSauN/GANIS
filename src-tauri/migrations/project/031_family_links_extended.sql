-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 031 : liens familiaux sans intermédiaire
-- ============================================================================
-- Le lien familial d'une relation « family » (migration 030) accepte trois
-- liens de plus, pour relier deux personnes sans créer celles d'entre elles :
--
--   'grandparent' : la source est le grand-parent de la cible (orienté) ;
--   'auntUncle'   : la source est l'oncle ou la tante de la cible (orienté) ;
--   'cousin'      : cousins, cousines : même génération.
--
-- SQLite ne sait pas modifier une contrainte CHECK : la table est recréée
-- à l'identique et les relations existantes sont recopiées telles quelles.
-- ============================================================================

CREATE TABLE character_relations_new (
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
    family_link  TEXT CHECK (family_link IN ('parent', 'partner', 'sibling', 'grandparent', 'auntUncle', 'cousin')),

    CHECK (source_id <> target_id),
    FOREIGN KEY (source_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES characters(id) ON DELETE CASCADE,
    FOREIGN KEY (since_node) REFERENCES structure_nodes(id) ON DELETE SET NULL,
    FOREIGN KEY (until_node) REFERENCES structure_nodes(id) ON DELETE SET NULL
);

INSERT INTO character_relations_new (
    id, source_id, target_id, type, label, description, directed, intensity,
    sentiment, since_node, until_node, created_at, updated_at, family_link
)
SELECT
    id, source_id, target_id, type, label, description, directed, intensity,
    sentiment, since_node, until_node, created_at, updated_at, family_link
FROM character_relations;

DROP TABLE character_relations;
ALTER TABLE character_relations_new RENAME TO character_relations;

CREATE INDEX IF NOT EXISTS idx_character_relations_source ON character_relations(source_id);
CREATE INDEX IF NOT EXISTS idx_character_relations_target ON character_relations(target_id);
