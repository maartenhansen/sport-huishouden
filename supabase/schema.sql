-- =====================================================================
-- Sport & Huishouden: databaseschema voor Supabase (PostgreSQL)
--
-- Uitvoeren: Supabase-dashboard → SQL Editor → New query → plak dit
-- volledige bestand → Run. Het script mag je gerust opnieuw uitvoeren.
--
-- Beveiliging: elke tabel heeft Row Level Security (RLS). Een ingelogde
-- gebruiker kan alleen rijen lezen/schrijven waarvan user_id = zijn eigen id.
-- Niet-ingelogde bezoekers (rol 'anon') krijgen geen enkele toegang.
-- =====================================================================

-- ---------- Sportactiviteiten ----------
create table if not exists public.activities (
  id          text primary key,                 -- door de app aangemaakt
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  category    text not null,                    -- Padel, Tennis, Squash, ...
  date        date not null,
  time        time,                             -- optioneel (geplande tijd)
  duration    integer check (duration between 1 and 1440),   -- minuten
  hr          integer check (hr between 30 and 230),          -- gem. hartslag
  intensity   smallint check (intensity between 1 and 5),     -- 1 = heel licht … 5 = maximaal
  note        text not null default '',
  status      text not null check (status in ('gepland', 'gedaan', 'overgeslagen')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Huishoudtaken (één rij per taak, met de volgende datum) ----------
create table if not exists public.tasks (
  id          text primary key,
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  name        text not null check (length(name) between 1 and 80),
  icon        text,
  every       integer not null default 1 check (every >= 1),
  unit        text not null check (unit in ('dagen', 'weken', 'maanden', 'eenmalig')),
  next_date   date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Takenlogboek (gedaan / overgeslagen / automatisch gemist) ----------
-- Geen foreign key naar tasks: de geschiedenis blijft bewaard als je een taak verwijdert.
-- Daarom ook een kopie van naam en icoon.
create table if not exists public.task_log (
  id          text primary key,
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  task_id     text not null,
  name        text not null,
  icon        text,
  date        date not null,
  status      text not null check (status in ('gedaan', 'overgeslagen', 'gemist')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- Indexen voor snelle filters per gebruiker en datum ----------
create index if not exists activities_user_date_idx on public.activities (user_id, date);
create index if not exists tasks_user_idx           on public.tasks (user_id);
create index if not exists task_log_user_date_idx   on public.task_log (user_id, date);

-- ---------- updated_at automatisch bijwerken ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists activities_updated_at on public.activities;
create trigger activities_updated_at before update on public.activities
  for each row execute function public.set_updated_at();

drop trigger if exists tasks_updated_at on public.tasks;
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

drop trigger if exists task_log_updated_at on public.task_log;
create trigger task_log_updated_at before update on public.task_log
  for each row execute function public.set_updated_at();

-- ---------- Row Level Security ----------
alter table public.activities enable row level security;
alter table public.tasks      enable row level security;
alter table public.task_log   enable row level security;

drop policy if exists "Eigen rijen" on public.activities;
create policy "Eigen rijen" on public.activities
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Eigen rijen" on public.tasks;
create policy "Eigen rijen" on public.tasks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Eigen rijen" on public.task_log;
create policy "Eigen rijen" on public.task_log
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------- Rechten: alleen ingelogde gebruikers, niets voor anoniemen ----------
revoke all on public.activities, public.tasks, public.task_log from anon;
grant select, insert, update, delete on public.activities, public.tasks, public.task_log to authenticated;
