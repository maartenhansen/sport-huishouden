-- =====================================================================
-- Pushmeldingen: dagoverzicht om 17:30 en 19:00 (Europe/Brussels)
--
-- Uitvoeren in Supabase → SQL Editor, in deze volgorde:
--   STAP 1: dit volledige bestand → Run
--   STAP 2: de regel  select vault.create_secret('...', 'cron_secret');
--           uit je bestand push-sleutels.txt (die bevat de echte geheime waarde)
-- =====================================================================

-- ---------- Toestellen die meldingen willen ontvangen ----------
create table if not exists public.push_subscriptions (
  endpoint    text primary key,                 -- uniek adres van het toestel bij Google/Mozilla/…
  user_id     uuid not null default auth.uid()
              references auth.users (id) on delete cascade,
  p256dh      text not null,                    -- publieke sleutel van het toestel
  auth        text not null,                    -- geheim van het toestel
  created_at  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Eigen toestellen" on public.push_subscriptions;
create policy "Eigen toestellen" on public.push_subscriptions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ---------- Tijdschema ----------
-- pg_cron start de functie elk half uur; de functie zelf beslist of het
-- 17:30 of 19:00 is in Belgische tijd. Zo blijft het kloppen bij zomer- en wintertijd.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('dagoverzicht')
where exists (select 1 from cron.job where jobname = 'dagoverzicht');

select cron.schedule(
  'dagoverzicht',
  '0,30 * * * *',
  $$
  select net.http_post(
    url     := 'https://cyvuznstxbqjlflyjrgd.supabase.co/functions/v1/daily-summary',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);
