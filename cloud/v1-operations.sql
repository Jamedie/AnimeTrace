-- AnimeTrace V1 : journal d'opérations synchronisé entre ordinateurs (ARCHITECTURE.md §9).
-- À exécuter une fois dans le SQL Editor de Supabase. Réexécutable sans perte.
begin;

create table if not exists public.animetrace_operations (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- Numéro attribué par le serveur dans l'ordre d'arrivée : sert d'ordre commun à tous les ordinateurs.
  revision bigint generated always as identity,
  id uuid not null,
  device_id text not null,
  type text not null check (type in ('episode.opened', 'version.progress', 'domain.activated', 'catalog.linked', 'mal.answer', 'library.hidden', 'library.previous')),
  payload jsonb not null check (octet_length(payload::text) < 20000),
  created_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key (user_id, id)
);
-- Table déjà créée par une version précédente de ce script : la liste des types est remise à jour.
alter table public.animetrace_operations drop constraint if exists animetrace_operations_type_check;
alter table public.animetrace_operations add constraint animetrace_operations_type_check
  check (type in ('episode.opened', 'version.progress', 'domain.activated', 'catalog.linked', 'mal.answer', 'library.hidden', 'library.previous'));
create unique index if not exists animetrace_operations_revision on public.animetrace_operations (user_id, revision);

alter table public.animetrace_operations enable row level security;
revoke all on public.animetrace_operations from anon;
grant select, insert on public.animetrace_operations to authenticated;
-- Pas de modification ni de suppression : le journal ne fait que grandir.

drop policy if exists own_operations_read on public.animetrace_operations;
create policy own_operations_read on public.animetrace_operations for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists own_operations_write on public.animetrace_operations;
create policy own_operations_write on public.animetrace_operations for insert to authenticated
  with check ((select auth.uid()) = user_id);

commit;
