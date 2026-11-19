-- ============================================================================
-- GANIS — Base de données de l'application
-- Migration 010 : profil d'auteur
-- ============================================================================
-- Informations facultatives que l'auteur ajoute à son compte : nom d'auteur
-- (nom de plume), nom complet, site web et courte biographie.
--
-- Elles sont rangées ensemble, en JSON, chiffrées avec la clé du compte
-- (comme l'adresse e-mail) : jamais en clair dans la base.
--
-- `profile_sealed` NULL : aucun profil renseigné (tous les comptes existants).
-- ============================================================================

ALTER TABLE users ADD COLUMN profile_sealed TEXT;
