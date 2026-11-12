-- ============================================================================
--  HomeCare — Supabase database setup (M1: phone sign-in + customer profiles)
-- ============================================================================
--
--  HOW TO RUN
--  1. Open https://supabase.com/dashboard and select the "homecare" project.
--  2. Left sidebar → "SQL Editor" → click "+ New query" (top left).
--  3. Select everything in THIS file (Ctrl+A), copy it (Ctrl+C), paste it into the editor (Ctrl+V).
--  4. Click "Run" (bottom right), or press Ctrl+Enter.
--     If Supabase warns about a "destructive operation", click "Run this query" — the only things
--     dropped are the rules and triggers this script re-creates a few lines later.
--  5. Look at the "Results" panel at the bottom. You should see ONE row, all "true":
--
--       profiles_table | security_on | rules_ok | signup_trigger | users_without_profile_ok
--       true           | true        | true     | true           | true
--
--     Any "false" → copy the whole Results row and any red error message and send it to the team.
--
--  Safe to run again: running it twice changes nothing and does not delete any data.
--
--  WHAT IT CREATES
--  - profiles: one row per signed-up user (phone, name, email, app language).
--    A row is created automatically the moment someone signs up with their phone.
--  - Security (Row Level Security): each user can read and edit ONLY their own row, and only their
--    name, email and language. Nobody can change their phone number or see other users from the app.
--
--  For developers: this mirrors supabase/migrations/20261112000000_profiles.sql and is covered by
--  `npm run db:test`. Change both together.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 1. Language type (English / Urdu)
-- ----------------------------------------------------------------------------
do $$
begin
  create type public.app_language as enum ('en', 'ur');
exception
  when duplicate_object then null;  -- already exists from an earlier run
end;
$$;


-- ----------------------------------------------------------------------------
-- STEP 2. Profiles table
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  phone       text,  -- E.164, e.g. +923001234567 (copied from the sign-in account)
  full_name   text check (full_name is null or char_length(btrim(full_name)) between 2 and 60),
  email       text check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  language    public.app_language not null default 'en',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Customer profile, 1:1 with auth.users. Created by trigger on signup.';


-- ----------------------------------------------------------------------------
-- STEP 3. Security: who may read and change profiles
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Start from "nothing allowed", then allow exactly what the app needs.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, email, language) on public.profiles to authenticated;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);


-- ----------------------------------------------------------------------------
-- STEP 4. Keep "updated_at" current on every change
-- ----------------------------------------------------------------------------
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

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();


-- ----------------------------------------------------------------------------
-- STEP 5. Create a profile automatically when someone signs up,
--         and keep the phone number in sync if it ever changes
-- ----------------------------------------------------------------------------
create or replace function public.to_e164(raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when raw is null or btrim(raw) = '' then null
    when left(raw, 1) = '+' then raw
    else '+' || raw
  end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, public.to_e164(new.phone))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_phone_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set phone = public.to_e164(new.phone)
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_phone_changed on auth.users;
create trigger on_auth_user_phone_changed
  after update of phone on auth.users
  for each row
  when (old.phone is distinct from new.phone)
  execute function public.handle_user_phone_change();

-- These run automatically; the app must not be able to call them directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_phone_change() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- STEP 6. Give a profile to anyone who signed in BEFORE this script was run
--         (otherwise the app shows "Couldn't load your account" for them)
-- ----------------------------------------------------------------------------
insert into public.profiles (id, phone)
select u.id, public.to_e164(u.phone)
from auth.users u
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- STEP 7. Check that everything worked (this is the row you see in "Results")
-- ----------------------------------------------------------------------------
select
  exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'profiles'
  ) as profiles_table,
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) as security_on,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'profiles') = 2 as rules_ok,
  exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created' and tgrelid = 'auth.users'::regclass
  ) as signup_trigger,
  not exists (
    select 1 from auth.users u left join public.profiles p on p.id = u.id where p.id is null
  ) as users_without_profile_ok;
