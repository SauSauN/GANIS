-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 019 : documents rangés dans le découpage
-- ============================================================================
-- Chaque élément du découpage (partie, chapitre, scène…) peut contenir des
-- documents : PDF, Word, pages de manga, images, textes, sons… GANIS les
-- range (chiffrés avec le reste du projet), les affiche, et permet de les
-- modifier dans l'application de son choix.
--
-- document_blobs : contenu des fichiers. Table à part, sans clé étrangère :
--   la corbeille et les versions ne copient ainsi que des références, jamais
--   le contenu (qui peut peser des centaines de Mo). Un contenu qui n'est
--   plus utilisé par aucun document, aucune version ni aucune entrée de la
--   corbeille est supprimé (voir `document_service::clean_orphans`).
-- structure_documents : documents d'un élément du découpage (ordre, nom,
--   type, note libre). Supprimer l'élément supprime ses documents (et la
--   corbeille permet de tout faire revenir).
-- document_versions : contenus précédents d'un document (remplacé, modifié
--   dans une autre application, texte modifié dans GANIS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_blobs (
    id          TEXT PRIMARY KEY,
    data        BLOB NOT NULL,
    size        INTEGER NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS structure_documents (
    id          TEXT PRIMARY KEY,
    node_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    mime        TEXT NOT NULL DEFAULT 'application/octet-stream',
    size        INTEGER NOT NULL DEFAULT 0,
    blob_id     TEXT NOT NULL,
    note        TEXT NOT NULL DEFAULT '',
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,

    FOREIGN KEY (node_id) REFERENCES structure_nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_structure_documents_node ON structure_documents(node_id, position);

CREATE TABLE IF NOT EXISTS document_versions (
    id           TEXT PRIMARY KEY,
    document_id  TEXT NOT NULL,
    blob_id      TEXT NOT NULL,
    name         TEXT NOT NULL,
    mime         TEXT NOT NULL,
    size         INTEGER NOT NULL,
    created_at   TEXT NOT NULL,

    FOREIGN KEY (document_id) REFERENCES structure_documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_document_versions_document ON document_versions(document_id, created_at);
