-- M1: customer profiles
-- One row per signed-up user, created automatically when Supabase Auth creates the user.
-- Users can read and edit only their own row, and only name / email / language.

create type public.app_language as enum ('en', 'ur');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  phone       text,  -- E.164, e.g. +923001234567 (copied from auth.users)
  full_name   text check (full_name is null or char_length(btrim(full_name)) between 2 and 60),
  email       text check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  language    public.app_language not null default 'en',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Customer profile, 1:1 with auth.users. Created by trigger on signup.';

-- ---------------------------------------------------------------------------
-- Privileges + Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Supabase grants everything on new public tables to anon/authenticated by default; be explicit instead.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, email, language) on public.profiles to authenticated;
-- No insert/delete for clients: rows are created by the trigger below and removed with the auth user.

create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Keep profiles in sync with auth.users
-- ---------------------------------------------------------------------------
create function public.to_e164(raw text)
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

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, public.to_e164(new.phone));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.handle_user_phone_change()
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

create trigger on_auth_user_phone_changed
  after update of phone on auth.users
  for each row
  when (old.phone is distinct from new.phone)
  execute function public.handle_user_phone_change();

-- Trigger functions are not meant to be called directly by clients.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_phone_change() from public, anon, authenticated;
