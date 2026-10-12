-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 017 : historique des actions et versions
-- ============================================================================
-- `activity` : journal du projet (créé, modifié, supprimé, restauré…),
-- conservé 90 jours.
--
-- `versions` : état d'un élément (note, synopsis, personnage, lieu, élément
-- du découpage) avant une modification enregistrée. Une version est prise
-- au début d'une séance de modification (au plus une toutes les 10 minutes
-- par élément), ou à la main avec un nom (« Avant réécriture »). Au plus
-- 50 versions automatiques par élément ; les versions nommées sont gardées.
-- `data` : colonnes de la ligne, en JSON, avec leur type exact.
-- ============================================================================

CREATE TABLE IF NOT EXISTS activity (
    id       TEXT PRIMARY KEY,
    at       TEXT NOT NULL,
    action   TEXT NOT NULL,
    kind     TEXT NOT NULL,
    item_id  TEXT NOT NULL,
    label    TEXT NOT NULL DEFAULT '',
    detail   TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_activity_at ON activity(at);
CREATE INDEX IF NOT EXISTS idx_activity_item ON activity(kind, item_id);

CREATE TABLE IF NOT EXISTS versions (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,
    item_id     TEXT NOT NULL,
    name        TEXT NOT NULL DEFAULT '',
    data        TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_versions_item ON versions(kind, item_id, created_at);
