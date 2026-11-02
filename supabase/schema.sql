-- ClickSpring schema (already applied to your ClickSpring Supabase project). Run once in Supabase: SQL Editor → New query → paste → Run.
create extension if not exists pgcrypto;

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  url text not null,
  owner_name text,
  created_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  name text not null,
  platform text not null,
  slug text not null,
  views integer not null default 0 check (views >= 0),
  created_at timestamptz not null default now()
);

create table public.events (
  id bigint generated always as identity primary key,
  site_id uuid not null references public.sites(id) on delete cascade,
  type text not null check (type in ('pageview','click','signup')),
  visitor_id text not null check (char_length(visitor_id) <= 64),
  source text check (char_length(source) <= 40),
  campaign_id uuid,                       -- no FK on purpose: old links keep working after a campaign is deleted
  path text check (char_length(path) <= 300),
  label text check (char_length(label) <= 80),
  created_at timestamptz not null default now()
);
create index events_site_time on public.events (site_id, created_at);
create index campaigns_site on public.campaigns (site_id);

alter table public.sites enable row level security;
alter table public.campaigns enable row level security;
alter table public.events enable row level security;

-- Owners manage their own sites and campaigns
create policy "own sites" on public.sites for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
create policy "own campaigns" on public.campaigns for all to authenticated
  using (exists (select 1 from public.sites s where s.id = site_id and s.owner = auth.uid()))
  with check (exists (select 1 from public.sites s where s.id = site_id and s.owner = auth.uid()));

-- The tracking script (anonymous) may only INSERT events for a site that exists
create schema if not exists private;   -- not exposed through the API
grant usage on schema private to anon, authenticated;
create or replace function private.site_exists(sid uuid) returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.sites where id = sid) $$;
revoke all on function private.site_exists(uuid) from public;
grant execute on function private.site_exists(uuid) to anon, authenticated;

create policy "tracker inserts events" on public.events for insert to anon, authenticated
  with check (private.site_exists(site_id));
create policy "owners read events" on public.events for select to authenticated
  using (exists (select 1 from public.sites s where s.id = site_id and s.owner = auth.uid()));

-- Anonymous visitors (the tracking script) can only add events, nothing else
revoke all on public.sites from anon;
revoke all on public.campaigns from anon;
revoke all on public.events from anon;
grant insert on public.events to anon;
