-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 044 : fiche du film
-- ============================================================================
-- Un film s'écrit comme une série (en-tête et éléments de chaque scène, dans
-- `series_scene_blocks`, voir 038), mais sa logline, sa durée visée et son
-- scénariste valent pour le film entier, pas pour un épisode. Ils tiennent
-- dans une seule ligne (`default`), comme le synopsis :
--
-- - logline : le film en une phrase ;
-- - runtime_goal : durée visée en minutes (NULL : pas de durée visée) ;
-- - writer : scénariste, imprimé sur la page de titre de l'export.
--
-- L'interface ne propose cette fiche qu'aux projets de type « Film » ; le
-- `.ganix` l'exporte comme toute autre table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS film_details (
    id            TEXT PRIMARY KEY,
    logline       TEXT NOT NULL DEFAULT '',
    runtime_goal  INTEGER,
    writer        TEXT NOT NULL DEFAULT '',
    updated_at    TEXT NOT NULL
);

INSERT OR IGNORE INTO film_details (id, logline, runtime_goal, writer, updated_at)
VALUES ('default', '', NULL, '', datetime('now'));
