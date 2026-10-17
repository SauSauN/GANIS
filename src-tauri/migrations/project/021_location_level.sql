-- Niveau de détail des fiches de lieux (comme les personnages) :
-- basic (l'essentiel), intermediate (+ le décor), advanced (+ la profondeur).
-- NULL : pas encore choisi (le premier lieu créé le demande).
-- Un projet qui a déjà des lieux garde toutes ses fiches visibles (avancé).

ALTER TABLE location_settings
    ADD COLUMN detail_level TEXT CHECK (detail_level IN ('basic', 'intermediate', 'advanced'));

UPDATE location_settings
SET detail_level = 'advanced'
WHERE id = 'default' AND EXISTS (SELECT 1 FROM locations);
