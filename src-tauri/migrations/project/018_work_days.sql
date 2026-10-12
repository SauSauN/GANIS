-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 018 : volume de travail par jour
-- ============================================================================
-- Calendrier de travail du tableau de bord (comme les contributions de
-- GitHub). Une ligne par jour (heure locale de l'ordinateur), gardée sans
-- limite de durée (contrairement au journal, gardé 90 jours) :
-- - `actions` : enregistrements faits ce jour-là ;
-- - `minutes` : minutes différentes pendant lesquelles on a travaillé,
--   une estimation du temps passé ;
-- - `last_minute` : dernière minute comptée (« 2026-10-12T14:32 »).
-- ============================================================================

CREATE TABLE IF NOT EXISTS work_days (
    day          TEXT PRIMARY KEY,
    actions      INTEGER NOT NULL DEFAULT 0,
    minutes      INTEGER NOT NULL DEFAULT 0,
    last_minute  TEXT NOT NULL DEFAULT ''
);

-- Reprise du journal existant (90 derniers jours au plus).
INSERT OR IGNORE INTO work_days (day, actions, minutes, last_minute)
SELECT date(at, 'localtime'),
       COUNT(*),
       COUNT(DISTINCT strftime('%Y-%m-%dT%H:%M', at, 'localtime')),
       MAX(strftime('%Y-%m-%dT%H:%M', at, 'localtime'))
FROM activity
GROUP BY date(at, 'localtime');
