-- Voice assistant: each customer names their assistant (e.g. "Jack") and talks to it to place a
-- Sauda Run order or book an ustaad. The speech and the AI run in the `assistant` Edge Function
-- (Groq); this script only stores the name and a daily limit per person, so the free AI quota
-- can't be used up by one account.
-- Written to be safe to re-run (the dashboard SQL Editor script is the same statements).

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
