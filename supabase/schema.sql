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

-- Tracker endpoint: one text argument so browsers can send a simple (no-preflight) request
create or replace function public.track(text) returns void
language plpgsql security invoker set search_path = '' as $$
declare j jsonb;
begin
  j := $1::jsonb;
  insert into public.events (site_id, type, visitor_id, source, campaign_id, path, label)
  values ((j->>'site_id')::uuid, j->>'type', left(coalesce(j->>'visitor_id','unknown'),64), left(j->>'source',40),
    case when (j->>'campaign_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (j->>'campaign_id')::uuid end,
    left(j->>'path',300), left(j->>'label',80));
end $$;
revoke all on function public.track(text) from public;
grant execute on function public.track(text) to anon, authenticated;

-- v0.01.2: device type + changes the founder is testing
alter table public.events add column if not exists device text check (device in ('mobile','tablet','desktop'));
-- (track() above is redefined in the live project to also store device)
create table if not exists public.fixes (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  tip_key text not null check (char_length(tip_key) <= 200),
  title text not null check (char_length(title) <= 300),
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists fixes_site on public.fixes (site_id);
alter table public.fixes enable row level security;
create policy "own fixes" on public.fixes for all to authenticated
  using (exists (select 1 from public.sites s where s.id = site_id and s.owner = (select auth.uid())))
  with check (exists (select 1 from public.sites s where s.id = site_id and s.owner = (select auth.uid())));
revoke all on public.fixes from anon;

-- v0.01.3: API keys (hashed; plaintext shown once). Used by the "api" edge function.
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  name text not null check (char_length(name) <= 60),
  prefix text not null, key_hash text not null unique,
  created_at timestamptz not null default now(), last_used_at timestamptz, revoked_at timestamptz
);
alter table public.api_keys enable row level security;
revoke all on public.api_keys from anon, authenticated;
grant select (id, site_id, name, prefix, created_at, last_used_at, revoked_at) on public.api_keys to authenticated;
create policy "owners see their keys" on public.api_keys for select to authenticated
  using (exists (select 1 from public.sites s where s.id = site_id and s.owner = (select auth.uid())));
-- create_api_key(p_site, p_name) and revoke_api_key(p_id): see migration "api_keys" (security definer, owner checked)

-- v0.01.4: users can delete their own account (cascades to all their data)
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- v0.01.5: free beta limits (3 websites/account, 10,000 events/website/month, 20 links/website)
-- see migration "beta_limits": usage_monthly table + triggers private.enforce_event_limit / enforce_site_limit / enforce_link_limit
