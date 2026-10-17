-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 020 : trame (plan des intrigues parallèles)
-- ============================================================================
-- La trame est un plateau vertical : une colonne par intrigue (« trame
-- parallèle »), une ligne par moment de l'histoire, des événements dans les
-- cases et des liens de cause à effet entre eux, plus les actes, la courbe
-- de tension, l'ordre de lecture, les questions à régler et les mystères.
--
-- Elle est enregistrée d'un bloc (document JSON, voir `plot_service.rs`) :
-- c'est ce qui permet d'annuler et de rétablir chaque geste sur le plateau,
-- et de garder des versions de toute la trame. Les événements y désignent
-- les personnages, lieux, éléments du découpage et notes du projet par leur
-- identifiant ; un élément supprimé (puis éventuellement restauré depuis la
-- corbeille) est simplement ignoré tant qu'il n'existe pas.
-- ============================================================================

CREATE TABLE IF NOT EXISTS plot (
    id          TEXT PRIMARY KEY CHECK (id = 'default'),
    data        TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

INSERT OR IGNORE INTO plot (id, data, created_at, updated_at)
VALUES ('default', '', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
