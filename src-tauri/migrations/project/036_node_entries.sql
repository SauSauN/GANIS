-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 036 : objets, faune et flore, factions, peuples et magie liés
-- aux éléments du découpage
-- ============================================================================
-- Comme les personnages (012) et les lieux, une fiche du monde peut être
-- liée à un élément du découpage (chapitre, scène, page…), avec un rôle :
-- central (au cœur de l'élément), present (apparaît), mentioned (citée).
-- Ces liens remplissent la section « Récit » des fiches du monde.
--
--   kind      : item, species, faction, people, magic (vérifié par Rust).
--   entry_id  : la fiche, dans la table de son module. Pas de clé étrangère
--               (cinq tables possibles) : un lien vers une fiche supprimée
--               reste ici, ignoré par l'interface, et sert de nouveau si la
--               fiche revient de la corbeille.
--
-- Supprimer l'élément du découpage supprime ses liens (corbeille comprise).
-- ============================================================================

CREATE TABLE IF NOT EXISTS structure_node_entries (
    node_id     TEXT NOT NULL,
    kind        TEXT NOT NULL,
    entry_id    TEXT NOT NULL,
    role        TEXT NOT NULL,
    created_at  TEXT NOT NULL,

    PRIMARY KEY (node_id, kind, entry_id),
    FOREIGN KEY (node_id) REFERENCES structure_nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_structure_node_entries_entry
    ON structure_node_entries(kind, entry_id);
