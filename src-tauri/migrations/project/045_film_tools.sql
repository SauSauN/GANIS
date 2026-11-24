-- ============================================================================
-- GANIS — Base de données d'un projet narratif
-- Migration 045 : outils du scénariste de film
-- ============================================================================
-- Fiche du film (044) complétée :
--
-- - dossier du film : note d'intention, pitch, synopsis court et long
--   (texte brut) ; le séquencier et le traitement sont calculés à partir
--   du découpage ;
-- - repères de structure (`beats`, JSON) : moment clé → scène où il tombe
--   ({"inciting": "<id de scène>", "plot1": …}) ;
-- - révision de tournage en cours (`revision`, JSON ou NULL) : couleur et
--   date de début ({"color": "blue", "since": "<date UTC>"}) ; un élément
--   modifié après cette date est marqué d'un astérisque ;
-- - numéros de scène verrouillés (`locked_numbers`, JSON) : scène →
--   numéro (« 12 », « 12A ») ; une scène ajoutée ensuite prend le numéro
--   de la précédente suivi d'une lettre.
--
-- Dépouillement d'une scène (`scene_breakdowns`) : figurants, accessoires,
-- costumes, maquillage, véhicules, effets, son, notes de régie (JSON). La
-- ligne appartient à la scène : la corbeille l'emporte et la ramène avec
-- elle, le `.ganix` l'exporte.
--
-- Les éléments du scénario ne changent plus de date quand ils ne sont que
-- déplacés : leur date dit quand leur texte a changé (révisions).
-- ============================================================================

ALTER TABLE film_details ADD COLUMN intention TEXT NOT NULL DEFAULT '';
ALTER TABLE film_details ADD COLUMN pitch TEXT NOT NULL DEFAULT '';
ALTER TABLE film_details ADD COLUMN summary_short TEXT NOT NULL DEFAULT '';
ALTER TABLE film_details ADD COLUMN summary_long TEXT NOT NULL DEFAULT '';
ALTER TABLE film_details ADD COLUMN beats TEXT NOT NULL DEFAULT '{}';
ALTER TABLE film_details ADD COLUMN revision TEXT;
ALTER TABLE film_details ADD COLUMN locked_numbers TEXT NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS scene_breakdowns (
    scene_id    TEXT PRIMARY KEY,
    data        TEXT NOT NULL DEFAULT '{}',
    updated_at  TEXT NOT NULL,
    FOREIGN KEY (scene_id) REFERENCES structure_nodes(id) ON DELETE CASCADE
);
