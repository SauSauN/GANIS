-- ============================================================================
-- GANIS — Base de données de l'application
-- Migration 011 : plus de rôle administrateur
-- ============================================================================
-- Chaque compte administre ses propres projets : il n'y a plus de compte
-- administrateur. L'ancien administrateur garde les outils de développement
-- qu'il avait (rôle « developer ») ; il peut les quitter dans les paramètres.
--
-- La contrainte CHECK de 001 accepte encore 'admin' (SQLite ne permet pas de
-- la modifier sans recréer la table) : l'application n'écrit plus ce rôle.
-- ============================================================================

UPDATE users SET role = 'developer' WHERE role = 'admin';
