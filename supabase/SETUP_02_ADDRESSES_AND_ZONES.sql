-- ============================================================================
--  HomeCare — Supabase database setup, part 2 (M2: addresses + service zones)
-- ============================================================================
--
--  Run SETUP_01_PROFILES.sql first (once). Then:
--  1. Supabase dashboard → your project → left sidebar "SQL Editor" → "+ New query".
--  2. Copy ALL of this file (Ctrl+A, Ctrl+C), paste it into the editor (Ctrl+V).
--  3. Click "Run" (or Ctrl+Enter). If Supabase warns about a "destructive operation", confirm:
--     the only things dropped are rules and triggers this script re-creates right after.
--  4. The "Results" panel shows ONE row. Every column must be "true":
--
--       postgis_on | zones_ok | addresses_ok | waitlist_ok | map_functions_ok
--
--     Any "false", or a red error → send the Results row / error text to the team.
--
--  Safe to run again: it changes nothing and keeps all data (including zones an admin edited).
--
--  WHAT IT CREATES
--  - PostGIS (maps/distance extension).
--  - service_zones: the areas we serve. Seeded with APPROXIMATE pilot circles:
--      F-10/F-11, G-9/G-10/G-11, I-8, Satellite Town, Saddar, Bahria Town (Phase 1–8).
--    Your test location is outside these? Add a test zone with the snippet at the end of
--    docs/SUPABASE_SETUP.md.
--  - addresses: each user's saved places. A saved address must be inside a zone. Users only
--    ever see and edit their own.
--  - waitlist_requests: "tell me when you serve my area".
--
--  For developers: this mirrors supabase/migrations/20261113000000_addresses_zones.sql and is
--  covered by `npm run db:test`. Change both together.
-- ============================================================================

-- M2: service zones, saved addresses, waitlist
-- Written to be safe to re-run (the dashboard SQL Editor script is the same statements).

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- ===========================================================================
-- Service zones: the areas we serve. Admins edit these; apps only read them.
-- ===========================================================================
create table if not exists public.service_zones (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  city        text not null check (city in ('islamabad', 'rawalpindi')),
  area        extensions.geography(MultiPolygon, 4326) not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists service_zones_area_idx on public.service_zones using gist (area);

alter table public.service_zones enable row level security;
revoke all on public.service_zones from anon, authenticated;
grant select on public.service_zones to authenticated;

drop policy if exists "service_zones: read active" on public.service_zones;
create policy "service_zones: read active"
  on public.service_zones for select
  to authenticated
  using (is_active);

-- Pilot zones (decision D1 is still open): APPROXIMATE circles around each area.
-- Refine later by replacing `area` with a drawn polygon (e.g. from geojson.io).
insert into public.service_zones (slug, name, city, area)
select z.slug, z.name, z.city,
       extensions.st_multi(
         extensions.st_buffer(
           extensions.st_setsrid(extensions.st_makepoint(z.lng, z.lat), 4326)::extensions.geography,
           z.radius_m
         )::extensions.geometry
       )::extensions.geography
from (values
  ('isb-f10-f11',        'F-10 / F-11',               'islamabad',  33.6890, 73.0005, 3200),
  ('isb-g9-g10-g11',     'G-9 / G-10 / G-11',         'islamabad',  33.6760, 73.0150, 3500),
  ('isb-i8',             'I-8',                       'islamabad',  33.6680, 73.0760, 2200),
  ('rwp-satellite-town', 'Satellite Town',            'rawalpindi', 33.6370, 73.0680, 2500),
  ('rwp-saddar',         'Saddar',                    'rawalpindi', 33.5970, 73.0480, 2000),
  ('rwp-bahria',         'Bahria Town (Phase 1–8)',   'rawalpindi', 33.5250, 73.1050, 3500)
) as z(slug, name, city, lat, lng, radius_m)
on conflict (slug) do nothing;

-- Which active zone covers a point? When zones overlap, the one whose centre is closest wins.
create or replace function public.zone_at(lat double precision, lng double precision)
returns public.service_zones
language sql
stable
set search_path = ''
as $$
  with p as (
    select extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography as pt
  )
  select z.*
  from public.service_zones z, p
  where z.is_active
    and extensions.st_covers(z.area, p.pt)
  order by extensions.st_distance(extensions.st_centroid(z.area), p.pt)
  limit 1;
$$;

-- App call: { inside: true, zone_id, zone_name, city } or { inside: false }
create or replace function public.check_service_area(lat double precision, lng double precision)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('inside', true, 'zone_id', z.id, 'zone_name', z.name, 'city', z.city)
       from public.zone_at(lat, lng) z
      where z.id is not null),
    jsonb_build_object('inside', false));
$$;

-- App call: active zones as GeoJSON, to draw coverage on the map.
create or replace function public.service_zones_geojson()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'type', 'FeatureCollection',
    'features', coalesce(jsonb_agg(jsonb_build_object(
      'type', 'Feature',
      'id', z.slug,
      'properties', jsonb_build_object('name', z.name, 'city', z.city),
      'geometry', extensions.st_asgeojson(z.area, 5)::jsonb
    ) order by z.name), '[]'::jsonb))
  from public.service_zones z
  where z.is_active;
$$;

revoke execute on function public.zone_at(double precision, double precision) from public, anon;
revoke execute on function public.check_service_area(double precision, double precision) from public, anon;
revoke execute on function public.service_zones_geojson() from public, anon;
grant execute on function public.zone_at(double precision, double precision) to authenticated;
grant execute on function public.check_service_area(double precision, double precision) to authenticated;
grant execute on function public.service_zones_geojson() to authenticated;

-- ===========================================================================
-- Saved addresses (also used for "book for someone else": recipient_* fields)
-- ===========================================================================
do $$
begin
  create type public.address_label as enum ('home', 'work', 'parents', 'other');
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.addresses (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label              public.address_label not null default 'home',
  custom_label       text check (custom_label is null or char_length(btrim(custom_label)) between 1 and 30),
  latitude           double precision not null check (latitude between 23 and 38),
  longitude          double precision not null check (longitude between 60 and 78),
  location           extensions.geography(Point, 4326)
                       generated always as (
                         extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
                       ) stored,
  formatted_address  text not null check (char_length(btrim(formatted_address)) between 3 and 300),
  house              text check (house is null or char_length(house) <= 100),
  street             text check (street is null or char_length(street) <= 100),
  area               text check (area is null or char_length(area) <= 100),
  landmark           text check (landmark is null or char_length(landmark) <= 150),
  instructions       text check (instructions is null or char_length(instructions) <= 300),
  recipient_name     text check (recipient_name is null or char_length(btrim(recipient_name)) between 2 and 60),
  recipient_phone    text check (recipient_phone is null or recipient_phone ~ '^\+923[0-9]{9}$'),
  zone_id            uuid references public.service_zones (id) on delete set null,
  is_default         boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists addresses_user_idx on public.addresses (user_id);
create index if not exists addresses_location_idx on public.addresses using gist (location);
create unique index if not exists addresses_one_default_per_user on public.addresses (user_id) where is_default;

alter table public.addresses enable row level security;
revoke all on public.addresses from anon, authenticated;
grant select, delete on public.addresses to authenticated;
grant insert (label, custom_label, latitude, longitude, formatted_address, house, street, area,
              landmark, instructions, recipient_name, recipient_phone, is_default)
  on public.addresses to authenticated;
grant update (label, custom_label, latitude, longitude, formatted_address, house, street, area,
              landmark, instructions, recipient_name, recipient_phone, is_default)
  on public.addresses to authenticated;

drop policy if exists "addresses: read own" on public.addresses;
create policy "addresses: read own" on public.addresses for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "addresses: insert own" on public.addresses;
create policy "addresses: insert own" on public.addresses for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "addresses: update own" on public.addresses;
create policy "addresses: update own" on public.addresses for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "addresses: delete own" on public.addresses;
create policy "addresses: delete own" on public.addresses for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Rules enforced on every save:
--  * the point must be inside an active service zone (error: outside_service_area)
--  * at most 20 addresses per user (error: address_limit)
--  * the first address becomes the default; making one default clears the others
create or replace function public.addresses_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_zone uuid;
  v_count integer;
begin
  if tg_op = 'INSERT' then
    select count(*) into v_count from public.addresses where user_id = new.user_id;
    if v_count >= 20 then
      raise exception 'address_limit' using errcode = 'P0001', hint = 'A user can save up to 20 addresses.';
    end if;
    if v_count = 0 then
      new.is_default := true;
    end if;
  end if;

  if tg_op = 'INSERT'
     or new.latitude is distinct from old.latitude
     or new.longitude is distinct from old.longitude then
    select z.id into v_zone from public.zone_at(new.latitude, new.longitude) z;
    if v_zone is null then
      raise exception 'outside_service_area' using errcode = 'P0001', hint = 'This location is outside the areas we serve.';
    end if;
    new.zone_id := v_zone;
  end if;

  if new.is_default and (tg_op = 'INSERT' or not old.is_default) then
    update public.addresses
       set is_default = false
     where user_id = new.user_id and is_default and id <> new.id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists addresses_before_write on public.addresses;
create trigger addresses_before_write
  before insert or update on public.addresses
  for each row execute function public.addresses_before_write();

-- Deleting the default address makes the newest remaining one the default.
create or replace function public.addresses_after_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_default then
    update public.addresses
       set is_default = true
     where id = (select a.id from public.addresses a
                  where a.user_id = old.user_id
                  order by a.created_at desc
                  limit 1);
  end if;
  return old;
end;
$$;

drop trigger if exists addresses_after_delete on public.addresses;
create trigger addresses_after_delete
  after delete on public.addresses
  for each row execute function public.addresses_after_delete();

-- ===========================================================================
-- Waitlist: "notify me when you serve this area" (demand data for expansion)
-- ===========================================================================
create table if not exists public.waitlist_requests (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  latitude           double precision not null check (latitude between 23 and 38),
  longitude          double precision not null check (longitude between 60 and 78),
  formatted_address  text check (formatted_address is null or char_length(formatted_address) <= 300),
  created_at         timestamptz not null default now()
);

create index if not exists waitlist_user_idx on public.waitlist_requests (user_id);

alter table public.waitlist_requests enable row level security;
revoke all on public.waitlist_requests from anon, authenticated;
grant select on public.waitlist_requests to authenticated;
grant insert (latitude, longitude, formatted_address) on public.waitlist_requests to authenticated;

drop policy if exists "waitlist: read own" on public.waitlist_requests;
create policy "waitlist: read own" on public.waitlist_requests for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "waitlist: insert own" on public.waitlist_requests;
create policy "waitlist: insert own" on public.waitlist_requests for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- ----------------------------------------------------------------------------
-- CHECK: this is the row you see in "Results" — every column should be true
-- ----------------------------------------------------------------------------
select
  exists (select 1 from pg_extension where extname = 'postgis') as postgis_on,
  (select count(*) from public.service_zones where is_active) > 0 as zones_ok,
  (select relrowsecurity from pg_class where oid = 'public.addresses'::regclass)
    and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'addresses') = 4
    and exists (select 1 from pg_trigger where tgname = 'addresses_before_write') as addresses_ok,
  (select relrowsecurity from pg_class where oid = 'public.waitlist_requests'::regclass)
    and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'waitlist_requests') = 2 as waitlist_ok,
  (public.service_zones_geojson() ->> 'type') = 'FeatureCollection'
    and public.check_service_area(33.6760, 73.0150) ? 'inside' as map_functions_ok;
