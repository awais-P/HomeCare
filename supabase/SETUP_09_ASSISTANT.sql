-- ============================================================================
--  HomeCare — Supabase database setup, part 9 (voice assistant)
-- ============================================================================
--
--  Run SETUP_01 … SETUP_08 first (once). Then:
--  1. Supabase dashboard → your project → left sidebar "SQL Editor" → "+ New query".
--  2. Copy ALL of this file (Ctrl+A, Ctrl+C), paste it into the editor (Ctrl+V).
--  3. Click "Run" (or Ctrl+Enter).
--  4. The "Results" panel shows ONE row. Every column must be "true":
--
--       name_ok | limit_ok | quota_ok
--
--  Safe to run again: it changes nothing and keeps all data.
--
--  WHAT IT ADDS
--  - profiles.assistant_name: the name each customer gives their assistant (e.g. "Jack").
--  - A daily limit per person on assistant requests (setting assistant_daily_limit, 40), so the
--    free AI quota can't be used up by one account.
--  The assistant itself is the Supabase Edge Function in supabase/functions/assistant — see
--  docs/VOICE_ASSISTANT.md for deploying it and adding the Groq key.
--
--  For developers: this mirrors supabase/migrations/20261122000000_assistant.sql and is covered by
--  `npm run db:test`. Change both together (regenerate this file from the migration).
-- ============================================================================

alter table public.profiles add column if not exists assistant_name text
  check (assistant_name is null or char_length(btrim(assistant_name)) between 2 and 20);
grant update (assistant_name) on public.profiles to authenticated;

insert into public.app_settings (key, value, description) values
  ('assistant_daily_limit', '40',
   'How many voice-assistant requests one person can make per day (keeps the free AI quota for everyone).')
on conflict (key) do nothing;

create table if not exists public.assistant_usage (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null,
  count    integer not null default 0,
  primary key (user_id, day)
);

alter table public.assistant_usage enable row level security;
revoke all on public.assistant_usage from anon, authenticated;
-- No client policies: only assistant_take_quota() touches it.

-- Called by the Edge Function (as the signed-in user) before each request. Returns how many
-- requests are left today; raises 'assistant_limit' when the day's limit is used up.
create or replace function public.assistant_take_quota()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone 'Asia/Karachi')::date;
  lim integer := coalesce((public.setting('assistant_daily_limit'))::text::integer, 40);
  used integer;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  insert into public.assistant_usage (user_id, day, count) values (me, today, 1)
  on conflict (user_id, day) do update set count = public.assistant_usage.count + 1
  returning count into used;
  if used > lim then
    raise exception 'assistant_limit' using errcode = 'P0001', detail = lim::text;
  end if;
  return lim - used;
end;
$$;

revoke execute on function public.assistant_take_quota() from public, anon;
grant execute on function public.assistant_take_quota() to authenticated;

-- ----------------------------------------------------------------------------
-- CHECK: this is the row you see in "Results" — every column should be true
-- ----------------------------------------------------------------------------
select
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'profiles' and column_name = 'assistant_name') as name_ok,
  exists (select 1 from public.app_settings where key = 'assistant_daily_limit')
    and exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'assistant_usage' and rowsecurity) as limit_ok,
  exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'assistant_take_quota') as quota_ok;
