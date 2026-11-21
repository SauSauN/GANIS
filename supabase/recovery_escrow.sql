-- ============================================================================
-- GANIS — Récupération du mot de passe par code e-mail
-- ============================================================================
--
-- À exécuter une fois dans Supabase › SQL Editor.
--
-- Chaque ligne garde le secret du verrou « email » d'un compte GANIS local
-- (voir src-tauri/src/services/keyring_service.rs). Ce secret, seul, n'ouvre
-- rien : les projets chiffrés restent sur l'ordinateur de l'utilisateur.
--
-- Une même adresse peut servir à plusieurs comptes GANIS (plusieurs
-- ordinateurs, plusieurs comptes sur un même ordinateur) : une ligne par
-- compte local.

create table if not exists public.recovery_escrow (
    user_id        uuid        not null references auth.users (id) on delete cascade,
    local_user_id  text        not null check (char_length(local_user_id) between 1 and 64),
    secret         text        not null check (char_length(secret) between 40 and 64),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),

    primary key (user_id, local_user_id)
);

-- Seul le titulaire de l'adresse (session ouverte par le code reçu) peut
-- lire, créer, remplacer ou supprimer ses propres lignes.
alter table public.recovery_escrow enable row level security;

drop policy if exists "recovery_escrow_select_own" on public.recovery_escrow;
drop policy if exists "recovery_escrow_insert_own" on public.recovery_escrow;
drop policy if exists "recovery_escrow_update_own" on public.recovery_escrow;
drop policy if exists "recovery_escrow_delete_own" on public.recovery_escrow;

create policy "recovery_escrow_select_own" on public.recovery_escrow
    for select to authenticated using ((select auth.uid()) = user_id);

create policy "recovery_escrow_insert_own" on public.recovery_escrow
    for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "recovery_escrow_update_own" on public.recovery_escrow
    for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

create policy "recovery_escrow_delete_own" on public.recovery_escrow
    for delete to authenticated using ((select auth.uid()) = user_id);

-- Aucun accès anonyme.
revoke all on public.recovery_escrow from anon;
grant select, insert, update, delete on public.recovery_escrow to authenticated;
