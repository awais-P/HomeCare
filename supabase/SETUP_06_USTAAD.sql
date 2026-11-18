-- ============================================================================
--  HomeCare — Supabase database setup, part 6 (P5: Ustaad bookings)
-- ============================================================================
--
--  Run SETUP_01 … SETUP_05 first (once). Then:
--  1. Supabase dashboard → your project → left sidebar "SQL Editor" → "+ New query".
--  2. Copy ALL of this file (Ctrl+A, Ctrl+C), paste it into the editor (Ctrl+V).
--  3. Click "Run" (or Ctrl+Enter). If Supabase warns about a "destructive operation", confirm:
--     the only things dropped are rules and triggers this script re-creates right after.
--  4. The "Results" panel shows ONE row. Every column must be "true":
--
--       settings_ok | jobs_ok | offers_ok | favourites_ok | media_ok | actions_ok
--
--     Any "false", or a red error → send the Results row / error text to the team.
--
--  Safe to run again: it changes nothing and keeps all data.
--
--  WHAT IT ADDS
--  - ustaad_jobs + job_events: plumber / electrician / AC technician / mechanic bookings, "come now"
--    (visit fee + surge) or a time slot, and a log of every status change.
--  - Automatic offers to the nearest free ustaad with that trade (45 s each, 3 ustaads; a favourite
--    ustaad is asked first). Three new settings: ustaad_dispatch_radius_km, ustaad_offer_seconds,
--    ustaad_max_auto_offers.
--  - Quotes: the ustaad sends labour + parts at the home; the customer approves (work) or declines
--    (visit fee only). Warranty: "problem came back" within warranty_days = free revisit.
--  - Favourite ustaads (only someone who has worked for you), ratings, contact while active.
--  - Account deletion also covers jobs.
--
--  For developers: this mirrors supabase/migrations/20261119000000_ustaad.sql and is covered by
--  `npm run db:test`. Change both together (regenerate this file from the migration).
-- ============================================================================

-- ===========================================================================
-- Settings
-- ===========================================================================
insert into public.app_settings (key, value, description) values
  ('ustaad_dispatch_radius_km', '8',
   'Ustaads see and are offered jobs within this distance of them.'),
  ('ustaad_offer_seconds', '45',
   'Seconds an ustaad has to accept an automatic job offer before it goes to the next one.'),
  ('ustaad_max_auto_offers', '3',
   'How many ustaads a job is offered to automatically before it waits for an admin.')
on conflict (key) do nothing;

-- ===========================================================================
-- Jobs
-- ===========================================================================
do $$
begin
  create type public.job_status as enum
    ('requested', 'accepted', 'on_the_way', 'arrived', 'quoted', 'in_progress', 'completed', 'visit_only', 'cancelled');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.job_timing as enum ('now', 'scheduled');
exception when duplicate_object then null;
end;
$$;

create table if not exists public.ustaad_jobs (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique default ('UJ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  customer_id          uuid references public.profiles (id) on delete set null,
  ustaad_id            uuid references public.partners (id) on delete set null,
  preferred_ustaad_id  uuid references public.partners (id) on delete set null,
  parent_job_id        uuid references public.ustaad_jobs (id) on delete set null,
  is_warranty          boolean not null default false,
  status               public.job_status not null default 'requested',
  trade                public.ustaad_trade not null,
  problem_text         text not null check (char_length(btrim(problem_text)) between 2 and 1000),
  photo_paths          text[] not null default '{}' check (cardinality(photo_paths) <= 4),
  timing               public.job_timing not null default 'now',
  scheduled_for        timestamptz,
  -- Address, copied from the saved address when booked.
  address_id           uuid references public.addresses (id) on delete set null,
  address_text         text not null,
  latitude             double precision not null,
  longitude            double precision not null,
  location             extensions.geography(Point, 4326)
                         generated always as (
                           extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography
                         ) stored,
  recipient_name       text,
  recipient_phone      text,
  instructions         text check (instructions is null or char_length(instructions) <= 300),
  zone_id              uuid references public.service_zones (id) on delete set null,
  -- Money (PKR, cash)
  visit_fee            integer not null check (visit_fee >= 0),
  surge_percent        integer not null default 0,
  labour_cost          integer check (labour_cost is null or labour_cost between 0 and 200000),
  parts_cost           integer check (parts_cost is null or parts_cost between 0 and 200000),
  quote_note           text check (quote_note is null or char_length(quote_note) <= 500),
  amount_due           integer,
  cash_collected       boolean not null default false,
  cancellation_fee     integer not null default 0,
  cancelled_by         public.order_actor,
  cancel_reason        text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  rating               smallint check (rating is null or rating between 1 and 5),
  rating_comment       text check (rating_comment is null or char_length(rating_comment) <= 300),
  warranty_until       timestamptz,
  dispatch_gave_up_at  timestamptz,
  created_at           timestamptz not null default now(),
  accepted_at          timestamptz,
  on_the_way_at        timestamptz,
  arrived_at           timestamptz,
  quoted_at            timestamptz,
  approved_at          timestamptz,
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  updated_at           timestamptz not null default now(),
  constraint ustaad_jobs_schedule_check check ((timing = 'scheduled') = (scheduled_for is not null))
);

create index if not exists ustaad_jobs_customer_idx on public.ustaad_jobs (customer_id, created_at desc);
create index if not exists ustaad_jobs_ustaad_idx on public.ustaad_jobs (ustaad_id, created_at desc);
create index if not exists ustaad_jobs_open_location_idx on public.ustaad_jobs using gist (location) where status = 'requested';

alter table public.ustaad_jobs enable row level security;
revoke all on public.ustaad_jobs from anon, authenticated;
grant select on public.ustaad_jobs to authenticated;
-- No direct writes: every change goes through the functions below.

drop policy if exists "jobs: customer, ustaad or admin reads" on public.ustaad_jobs;
create policy "jobs: customer, ustaad or admin reads" on public.ustaad_jobs for select to authenticated
  using ((select auth.uid()) = customer_id or (select auth.uid()) = ustaad_id or (select public.is_admin()));

drop trigger if exists ustaad_jobs_set_updated_at on public.ustaad_jobs;
create trigger ustaad_jobs_set_updated_at before update on public.ustaad_jobs
  for each row execute function public.set_updated_at();

-- Every status change is logged.
create table if not exists public.job_events (
  id           bigint generated always as identity primary key,
  job_id       uuid not null references public.ustaad_jobs (id) on delete cascade,
  actor_id     uuid,
  from_status  public.job_status,
  to_status    public.job_status not null,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists job_events_job_idx on public.job_events (job_id, created_at);
alter table public.job_events enable row level security;
revoke all on public.job_events from anon, authenticated;
grant select on public.job_events to authenticated;

drop policy if exists "job events: same people as the job" on public.job_events;
create policy "job events: same people as the job" on public.job_events for select to authenticated
  using (exists (select 1 from public.ustaad_jobs j where j.id = job_id));

create or replace function public.log_job_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.job_events (job_id, actor_id, from_status, to_status, note)
    values (new.id, auth.uid(), case when tg_op = 'UPDATE' then old.status end, new.status,
            case when new.status = 'cancelled' then new.cancel_reason end);
  end if;
  return new;
end;
$$;

drop trigger if exists ustaad_jobs_log_status on public.ustaad_jobs;
create trigger ustaad_jobs_log_status after insert or update of status on public.ustaad_jobs
  for each row execute function public.log_job_status();

-- ===========================================================================
-- Automatic offers to ustaads
-- ===========================================================================
create table if not exists public.job_offers (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.ustaad_jobs (id) on delete cascade,
  ustaad_id    uuid not null references public.partners (id) on delete cascade,
  status       public.offer_status not null default 'offered',
  distance_km  numeric(6, 2),
  offered_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  answered_at  timestamptz,
  unique (job_id, ustaad_id)
);

create unique index if not exists job_offers_one_open_per_job on public.job_offers (job_id) where status = 'offered';
create unique index if not exists job_offers_one_open_per_ustaad on public.job_offers (ustaad_id) where status = 'offered';

alter table public.job_offers enable row level security;
revoke all on public.job_offers from anon, authenticated;
grant select on public.job_offers to authenticated;

drop policy if exists "job offers: own ustaad or admin" on public.job_offers;
create policy "job offers: own ustaad or admin" on public.job_offers for select to authenticated
  using ((select auth.uid()) = ustaad_id or (select public.is_admin()));

-- ===========================================================================
-- Favourite ustaads (only someone who has done a job for you)
-- ===========================================================================
create table if not exists public.favourite_ustaads (
  customer_id  uuid not null references public.profiles (id) on delete cascade,
  ustaad_id    uuid not null references public.partners (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (customer_id, ustaad_id)
);

alter table public.favourite_ustaads enable row level security;
revoke all on public.favourite_ustaads from anon, authenticated;
grant select, delete on public.favourite_ustaads to authenticated;
grant insert (ustaad_id) on public.favourite_ustaads to authenticated;
alter table public.favourite_ustaads alter column customer_id set default auth.uid();

create or replace function public.has_worked_with(p_ustaad uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ustaad_jobs
    where customer_id = auth.uid() and ustaad_id = p_ustaad and status in ('completed', 'visit_only')
  );
$$;

drop policy if exists "favourites: own" on public.favourite_ustaads;
create policy "favourites: own" on public.favourite_ustaads for select to authenticated
  using ((select auth.uid()) = customer_id);
drop policy if exists "favourites: add someone who worked for you" on public.favourite_ustaads;
create policy "favourites: add someone who worked for you" on public.favourite_ustaads for insert to authenticated
  with check ((select auth.uid()) = customer_id and public.has_worked_with(ustaad_id));
drop policy if exists "favourites: remove own" on public.favourite_ustaads;
create policy "favourites: remove own" on public.favourite_ustaads for delete to authenticated
  using ((select auth.uid()) = customer_id);

-- ===========================================================================
-- Helpers
-- ===========================================================================

-- Is this ustaad tied up? A job in progress, a "come now" job they accepted, or a scheduled job starting within 2 hours.
create or replace function public.ustaad_busy(p_ustaad uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ustaad_jobs
    where ustaad_id = p_ustaad
      and (status in ('on_the_way', 'arrived', 'quoted', 'in_progress')
           or (status = 'accepted' and (timing = 'now' or scheduled_for < now() + interval '2 hours')))
  );
$$;

create or replace function public.is_online_ustaad(p_ustaad uuid, p_trade public.ustaad_trade)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.partners
    where id = p_ustaad and role = 'ustaad' and status = 'approved' and is_online and p_trade = any (trades)
  );
$$;

-- ===========================================================================
-- Dispatch
-- ===========================================================================

-- Offer a waiting job to the preferred (favourite) ustaad first, then the nearest free online ustaad
-- with that trade who hasn't had it. Returns the offer id or null.
create or replace function public.offer_job_to_next_ustaad(p_job uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.ustaad_jobs;
  pick_id uuid;
  pick_km double precision;
  new_offer uuid;
  radius double precision := coalesce((public.setting('ustaad_dispatch_radius_km'))::text::double precision, 8);
  max_offers integer := coalesce((public.setting('ustaad_max_auto_offers'))::text::integer, 3);
  secs integer := coalesce((public.setting('ustaad_offer_seconds'))::text::integer, 45);
begin
  select * into j from public.ustaad_jobs where id = p_job for update;
  if not found or j.status <> 'requested' or j.dispatch_gave_up_at is not null then
    return null;
  end if;
  if exists (select 1 from public.job_offers where job_id = j.id and status = 'offered') then
    return null;
  end if;
  if (select count(*) from public.job_offers where job_id = j.id) >= max_offers then
    update public.ustaad_jobs set dispatch_gave_up_at = now() where id = j.id;
    return null;
  end if;

  -- The customer's chosen ustaad first (any distance), if free and online.
  if j.preferred_ustaad_id is not null
     and not exists (select 1 from public.job_offers where job_id = j.id and ustaad_id = j.preferred_ustaad_id) then
    select p.id, extensions.st_distance(p.last_location, j.location) / 1000 into pick_id, pick_km
      from public.partners p
     where p.id = j.preferred_ustaad_id and p.role = 'ustaad' and p.status = 'approved' and p.is_online
       and j.trade = any (p.trades)
       and p.last_seen_at > now() - interval '2 minutes'
       and not public.ustaad_busy(p.id)
       and not exists (select 1 from public.job_offers f where f.ustaad_id = p.id and f.status = 'offered');
  end if;

  if pick_id is null then
    select p.id, extensions.st_distance(p.last_location, j.location) / 1000 into pick_id, pick_km
      from public.partners p
     where p.role = 'ustaad' and p.status = 'approved' and p.is_online
       and j.trade = any (p.trades)
       and p.last_location is not null
       and p.last_seen_at > now() - interval '2 minutes'
       and extensions.st_dwithin(p.last_location, j.location, radius * 1000)
       and not public.ustaad_busy(p.id)
       and not exists (select 1 from public.job_offers f
                        where f.ustaad_id = p.id and (f.job_id = j.id or f.status = 'offered'))
     order by extensions.st_distance(p.last_location, j.location)
     limit 1;
  end if;
  if pick_id is null then
    return null;
  end if;

  begin
    insert into public.job_offers (job_id, ustaad_id, distance_km, expires_at)
    values (j.id, pick_id, round(coalesce(pick_km, 0)::numeric, 2), now() + make_interval(secs => secs))
    returning id into new_offer;
  exception when unique_violation then
    return null;
  end;
  perform public.enqueue_notification(pick_id, 'partner', 'new_job_offer', null,
    jsonb_build_object('code', j.code, 'trade', j.trade, 'job_id', j.id, 'timing', j.timing,
                       'km', round(coalesce(pick_km, 0)::numeric, 1)));
  return new_offer;
end;
$$;

create or replace function public.dispatch_pending_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  update public.job_offers set status = 'expired', answered_at = now()
   where status = 'offered' and expires_at <= now();
  for r in
    select j.id from public.ustaad_jobs j
     where j.status = 'requested' and j.dispatch_gave_up_at is null
       and not exists (select 1 from public.job_offers f where f.job_id = j.id and f.status = 'offered')
     order by j.created_at
     limit 50
  loop
    if public.offer_job_to_next_ustaad(r.id) is not null then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- ===========================================================================
-- Customer actions
-- ===========================================================================

-- Book an ustaad. "now" adds the come-now surge to the visit fee; "scheduled" needs a time
-- 1 hour to 14 days ahead, between 8 am and 9 pm (Pakistan time).
create or replace function public.create_ustaad_job(
  p_address_id uuid,
  p_trade public.ustaad_trade,
  p_problem_text text,
  p_timing public.job_timing default 'now',
  p_scheduled_for timestamptz default null,
  p_photo_paths text[] default '{}',
  p_preferred_ustaad uuid default null,
  p_instructions text default null
)
returns public.ustaad_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.addresses;
  j public.ustaad_jobs;
  path text;
  base integer := coalesce((public.setting('ustaad_visit_fee'))::text::integer, 500);
  surge integer := case when p_timing = 'now' then coalesce((public.setting('come_now_surge_percent'))::text::integer, 0) else 0 end;
  local_hour integer;
begin
  select * into a from public.addresses where id = p_address_id and user_id = auth.uid();
  if not found then
    raise exception 'address_not_found' using errcode = 'P0001';
  end if;
  if (select z.id from public.zone_at(a.latitude, a.longitude) z) is null then
    raise exception 'outside_service_area' using errcode = 'P0001';
  end if;
  if (select count(*) from public.ustaad_jobs
      where customer_id = auth.uid() and status in ('requested', 'accepted', 'on_the_way', 'arrived', 'quoted', 'in_progress')) >= 3 then
    raise exception 'too_many_active_jobs' using errcode = 'P0001';
  end if;
  if p_timing = 'scheduled' then
    if p_scheduled_for is null or p_scheduled_for < now() + interval '1 hour' or p_scheduled_for > now() + interval '14 days' then
      raise exception 'invalid_slot' using errcode = 'P0001';
    end if;
    local_hour := extract(hour from p_scheduled_for at time zone 'Asia/Karachi');
    if local_hour < 8 or local_hour > 20 then
      raise exception 'invalid_slot' using errcode = 'P0001';
    end if;
  end if;
  foreach path in array coalesce(p_photo_paths, '{}') loop
    if split_part(path, '/', 1) <> auth.uid()::text then
      raise exception 'invalid_photo' using errcode = 'P0001';
    end if;
  end loop;
  if p_preferred_ustaad is not null and not exists (
    select 1 from public.partners where id = p_preferred_ustaad and role = 'ustaad' and status = 'approved' and p_trade = any (trades)
  ) then
    raise exception 'ustaad_not_available' using errcode = 'P0001';
  end if;

  insert into public.ustaad_jobs (
    customer_id, preferred_ustaad_id, trade, problem_text, photo_paths, timing, scheduled_for,
    address_id, address_text, latitude, longitude, recipient_name, recipient_phone, instructions, zone_id,
    visit_fee, surge_percent
  ) values (
    auth.uid(), p_preferred_ustaad, p_trade, btrim(p_problem_text), coalesce(p_photo_paths, '{}'), p_timing,
    case when p_timing = 'scheduled' then p_scheduled_for end,
    a.id, concat_ws(', ', a.house, a.street, a.area, a.formatted_address), a.latitude, a.longitude,
    a.recipient_name, a.recipient_phone, coalesce(nullif(btrim(p_instructions), ''), a.instructions), a.zone_id,
    round(base * (100 + surge) / 100.0)::integer, surge
  )
  returning * into j;
  return j;
end;
$$;

-- Customer: approve the quote (work starts) or decline it (only the visit fee is due).
create or replace function public.answer_quote(p_job uuid, p_approve boolean)
returns public.ustaad_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.ustaad_jobs;
begin
  select * into j from public.ustaad_jobs where id = p_job and customer_id = auth.uid() for update;
  if not found then
    raise exception 'job_not_found' using errcode = 'P0001';
  end if;
  if j.status <> 'quoted' then
    raise exception 'no_quote_to_answer' using errcode = 'P0001';
  end if;
  if p_approve then
    update public.ustaad_jobs set status = 'in_progress', approved_at = now() where id = j.id returning * into j;
  else
    update public.ustaad_jobs set status = 'visit_only', amount_due = visit_fee, cash_collected = true, completed_at = now()
     where id = j.id returning * into j;
  end if;
  perform public.enqueue_notification(j.ustaad_id, 'partner', 'quote_answer', null,
    jsonb_build_object('code', j.code, 'job_id', j.id, 'approved', p_approve));
  return j;
end;
$$;

-- Customer: the same problem came back within the warranty window → a free revisit (labour free),
-- offered first to the same ustaad.
create or replace function public.report_issue_again(p_job uuid, p_problem_text text)
returns public.ustaad_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.ustaad_jobs;
  j public.ustaad_jobs;
begin
  select * into parent from public.ustaad_jobs where id = p_job and customer_id = auth.uid();
  if not found then
    raise exception 'job_not_found' using errcode = 'P0001';
  end if;
  if parent.status <> 'completed' or parent.warranty_until is null or parent.warranty_until < now() then
    raise exception 'warranty_over' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.ustaad_jobs where parent_job_id = parent.id and status <> 'cancelled') then
    raise exception 'revisit_exists' using errcode = 'P0001';
  end if;
  insert into public.ustaad_jobs (
    customer_id, preferred_ustaad_id, parent_job_id, is_warranty, trade, problem_text, timing,
    address_id, address_text, latitude, longitude, recipient_name, recipient_phone, instructions, zone_id,
    visit_fee, surge_percent
  ) values (
    auth.uid(), parent.ustaad_id, parent.id, true, parent.trade,
    coalesce(nullif(btrim(coalesce(p_problem_text, '')), ''), parent.problem_text), 'now',
    parent.address_id, parent.address_text, parent.latitude, parent.longitude, parent.recipient_name,
    parent.recipient_phone, parent.instructions, parent.zone_id, 0, 0
  )
  returning * into j;
  return j;
end;
$$;

create or replace function public.rate_job(p_job uuid, p_rating smallint, p_comment text default null)
returns public.ustaad_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.ustaad_jobs;
begin
  update public.ustaad_jobs
     set rating = p_rating, rating_comment = nullif(btrim(coalesce(p_comment, '')), '')
   where id = p_job and customer_id = auth.uid() and status in ('completed', 'visit_only') and rating is null
  returning * into j;
  if not found then
    raise exception 'cannot_rate' using errcode = 'P0001';
  end if;
  return j;
end;
$$;

-- The ustaad's public card for the customer: name, average rating, jobs done, favourite or not.
-- The phone number only while the job is active.
create or replace function public.job_ustaad(p_job uuid)
returns table (ustaad_id uuid, name text, phone text, rating_avg numeric, jobs_done integer, is_favourite boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  j public.ustaad_jobs;
begin
  select * into j from public.ustaad_jobs where id = p_job and customer_id = auth.uid();
  if not found or j.ustaad_id is null then
    return;
  end if;
  return query
    select j.ustaad_id, pr.full_name,
           case when j.status in ('accepted', 'on_the_way', 'arrived', 'quoted', 'in_progress') then pr.phone end,
           (select round(avg(x.rating)::numeric, 1) from public.ustaad_jobs x where x.ustaad_id = j.ustaad_id and x.rating is not null),
           (select count(*)::integer from public.ustaad_jobs x where x.ustaad_id = j.ustaad_id and x.status = 'completed'),
           exists (select 1 from public.favourite_ustaads f where f.customer_id = auth.uid() and f.ustaad_id = j.ustaad_id)
      from public.profiles pr
     where pr.id = j.ustaad_id;
end;
$$;

-- Customer: favourite ustaads with their trades and ratings (for "book the same ustaad").
create or replace function public.my_favourite_ustaads()
returns table (ustaad_id uuid, name text, trades public.ustaad_trade[], rating_avg numeric, jobs_done integer)
language sql
stable
security definer
set search_path = ''
as $$
  select f.ustaad_id, pr.full_name, p.trades,
         (select round(avg(x.rating)::numeric, 1) from public.ustaad_jobs x where x.ustaad_id = f.ustaad_id and x.rating is not null),
         (select count(*)::integer from public.ustaad_jobs x where x.ustaad_id = f.ustaad_id and x.status = 'completed')
    from public.favourite_ustaads f
    join public.partners p on p.id = f.ustaad_id and p.status = 'approved'
    join public.profiles pr on pr.id = f.ustaad_id
   where f.customer_id = auth.uid()
   order by f.created_at desc;
$$;

-- Where the ustaad is, for the customer of an active job.
create or replace function public.job_ustaad_location(p_job uuid)
returns table (latitude double precision, longitude double precision, seen_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.last_latitude, p.last_longitude, p.last_seen_at
    from public.ustaad_jobs j
    join public.partners p on p.id = j.ustaad_id
   where j.id = p_job
     and (j.customer_id = auth.uid() or public.is_admin())
     and j.status in ('accepted', 'on_the_way', 'arrived')
     and p.last_latitude is not null;
$$;

-- ===========================================================================
-- Ustaad actions
-- ===========================================================================

-- Open jobs near an online ustaad, for their trades (no address until accepted).
create or replace function public.list_open_jobs(lat double precision, lng double precision)
returns table (
  id uuid, code text, trade public.ustaad_trade, problem_text text, photo_count integer, timing public.job_timing,
  scheduled_for timestamptz, is_warranty boolean, area text, distance_km double precision, visit_fee integer, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me extensions.geography;
  my_trades public.ustaad_trade[];
  radius double precision := coalesce((public.setting('ustaad_dispatch_radius_km'))::text::double precision, 8);
begin
  select p.trades into my_trades from public.partners p
   where p.id = auth.uid() and p.status = 'approved' and p.is_online and p.role = 'ustaad';
  if not found then
    raise exception 'not_an_online_ustaad' using errcode = 'P0001';
  end if;
  me := extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography;
  return query
    select j.id, j.code, j.trade, j.problem_text, cardinality(j.photo_paths), j.timing, j.scheduled_for, j.is_warranty,
           coalesce(ad.area, z.name),
           round((extensions.st_distance(j.location, me) / 1000)::numeric, 1)::double precision,
           j.visit_fee, j.created_at
      from public.ustaad_jobs j
      left join public.addresses ad on ad.id = j.address_id
      left join public.service_zones z on z.id = j.zone_id
     where j.status = 'requested'
       and j.trade = any (my_trades)
       and extensions.st_dwithin(j.location, me, radius * 1000)
     order by j.timing, extensions.st_distance(j.location, me)
     limit 20;
end;
$$;

-- Ustaad: take a job (from the list or an offer). "Come now" jobs need a free ustaad; a scheduled
-- job can't clash with another scheduled job within 2 hours.
create or replace function public.accept_job(p_job uuid)
returns public.ustaad_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.ustaad_jobs;
begin
  select * into j from public.ustaad_jobs where id = p_job for update;
  if not found or j.status <> 'requested' then
    raise exception 'job_not_available' using errcode = 'P0001';
  end if;
  if not public.is_online_ustaad(auth.uid(), j.trade) then
    raise exception 'not_an_online_ustaad' using errcode = 'P0001';
  end if;
  if j.timing = 'now' and public.ustaad_busy(auth.uid()) then
    raise exception 'ustaad_busy' using errcode = 'P0001';
  end if;
  if j.timing = 'scheduled' and exists (
    select 1 from public.ustaad_jobs x
    where x.ustaad_id = auth.uid() and x.status in ('accepted', 'on_the_way', 'arrived', 'quoted', 'in_progress')
      and x.timing = 'scheduled' and abs(extract(epoch from x.scheduled_for - j.scheduled_for)) < 7200
  ) then
    raise exception 'slot_clash' using errcode = 'P0001';
  end if;
  update public.ustaad_jobs set ustaad_id = auth.uid(), status = 'accepted', accepted_at = now()
   where id = j.id returning * into j;
  return j;
end;
$$;

-- Ustaad: current offer (calls dispatch so offers move on even without the timer).
create or replace function public.my_job_offer()
returns table (
  offer_id uuid, job_id uuid, code text, trade public.ustaad_trade, problem_text text, photo_count integer,
  timing public.job_timing, scheduled_for timestamptz, is_warranty boolean, area text, distance_km double precision,
  visit_fee integer, expires_at timestamptz, seconds_left integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not exists (select 1 from public.partners where id = auth.uid() and status = 'approved' and is_online and role = 'ustaad') then
    return;
  end if;
  perform public.dispatch_pending_jobs();
  return query
    select f.id, j.id, j.code, j.trade, j.problem_text, cardinality(j.photo_paths), j.timing, j.scheduled_for, j.is_warranty,
           coalesce(ad.area, z.name), f.distance_km::double precision, j.visit_fee, f.expires_at,
           greatest(0, ceil(extract(epoch from f.expires_at - now())))::integer
      from public.job_offers f
      join public.ustaad_jobs j on j.id = f.job_id
      left join public.addresses ad on ad.id = j.address_id
      left join public.service_zones z on z.id = j.zone_id
     where f.ustaad_id = auth.uid() and f.status = 'offered' and f.expires_at > now()
     limit 1;
end;
$$;

create or replace function public.respond_job_offer(p_offer uuid, p_accept boolean)
returns public.ustaad_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.job_offers;
  j public.ustaad_jobs;
begin
  select * into f from public.job_offers where id = p_offer and ustaad_id = auth.uid() for update;
  if not found then
    raise exception 'offer_not_found' using errcode = 'P0001';
  end if;
  if f.status <> 'offered' or f.expires_at <= now() then
    raise exception 'offer_expired' using errcode = 'P0001';
  end if;
  if p_accept then
    update public.job_offers set status = 'accepted', answered_at = now() where id = f.id;
    select * into j from public.accept_job(f.job_id);
    return j;
  end if;
  update public.job_offers set status = 'declined', answered_at = now() where id = f.id;
  perform public.offer_job_to_next_ustaad(f.job_id);
  return null;
end;
$$;

-- Ustaad: next step.  accepted → on_the_way (scheduled jobs: from 2 hours before)  →  arrived (location needed)
create or replace function public.advance_job(
  p_job uuid,
  p_next public.job_status,
  lat double precision default null,
  lng double precision default null
)
returns public.ustaad_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.ustaad_jobs;
begin
  select * into j from public.ustaad_jobs where id = p_job and ustaad_id = auth.uid() for update;
  if not found then
    raise exception 'job_not_found' using errcode = 'P0001';
  end if;
  if j.status = 'accepted' and p_next = 'on_the_way' then
    if j.timing = 'scheduled' and j.scheduled_for > now() + interval '2 hours' then
      raise exception 'too_early' using errcode = 'P0001';
    end if;
    update public.ustaad_jobs set status = 'on_the_way', on_the_way_at = now() where id = j.id returning * into j;
  elsif j.status = 'on_the_way' and p_next = 'arrived' then
    if lat is null or lng is null then
      raise exception 'location_required' using errcode = 'P0001';
    end if;
    update public.ustaad_jobs set status = 'arrived', arrived_at = now() where id = j.id returning * into j;
  else
    raise exception 'invalid_transition' using errcode = 'P0001', detail = j.status::text || ' -> ' || p_next::text;
  end if;
  return j;
end;
$$;

-- Ustaad at the home: send (or revise) the quote. Warranty revisits: labour is free, parts may cost.
create or replace function public.send_quote(p_job uuid, p_labour integer, p_parts integer default 0, p_note text default null)
returns public.ustaad_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.ustaad_jobs;
begin
  select * into j from public.ustaad_jobs where id = p_job and ustaad_id = auth.uid() for update;
  if not found then
    raise exception 'job_not_found' using errcode = 'P0001';
  end if;
  if j.status not in ('arrived', 'quoted') then
    raise exception 'not_arrived' using errcode = 'P0001';
  end if;
  if p_labour is null or p_labour < 0 or coalesce(p_parts, 0) < 0 then
    raise exception 'invalid_quote' using errcode = 'P0001';
  end if;
  if j.is_warranty and p_labour <> 0 then
    raise exception 'warranty_labour_free' using errcode = 'P0001';
  end if;
  update public.ustaad_jobs
     set status = 'quoted', quoted_at = now(), labour_cost = p_labour, parts_cost = coalesce(p_parts, 0),
         quote_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = j.id returning * into j;
  perform public.enqueue_notification(j.customer_id, 'customer', 'job_quote', null,
    jsonb_build_object('code', j.code, 'job_id', j.id, 'total', j.labour_cost + j.parts_cost));
  return j;
end;
$$;

-- Ustaad: work done, cash collected. The visit fee is credited: the customer pays the quote, and at
-- least the visit fee. Starts the warranty window.
create or replace function public.complete_job(p_job uuid)
returns public.ustaad_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.ustaad_jobs;
  days integer := coalesce((public.setting('warranty_days'))::text::integer, 7);
begin
  select * into j from public.ustaad_jobs where id = p_job and ustaad_id = auth.uid() for update;
  if not found then
    raise exception 'job_not_found' using errcode = 'P0001';
  end if;
  if j.status <> 'in_progress' then
    raise exception 'invalid_transition' using errcode = 'P0001', detail = j.status::text || ' -> completed';
  end if;
  update public.ustaad_jobs
     set status = 'completed', completed_at = now(), cash_collected = true,
         amount_due = case when is_warranty then parts_cost else greatest(labour_cost + parts_cost, visit_fee) end,
         warranty_until = now() + make_interval(days => days)
   where id = j.id returning * into j;
  return j;
end;
$$;

-- Customer ↔ ustaad contact while the job is active (only the other person's name and phone).
create or replace function public.job_contact(p_job uuid)
returns table (name text, phone text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  j public.ustaad_jobs;
begin
  select * into j from public.ustaad_jobs where id = p_job;
  if not found or j.status not in ('accepted', 'on_the_way', 'arrived', 'quoted', 'in_progress') then
    return;
  end if;
  if j.customer_id = auth.uid() then
    return query select p.full_name, p.phone from public.profiles p where p.id = j.ustaad_id;
  elsif j.ustaad_id = auth.uid() then
    return query select coalesce(j.recipient_name, p.full_name), coalesce(j.recipient_phone, p.phone)
                 from public.profiles p where p.id = j.customer_id;
  end if;
end;
$$;

-- ===========================================================================
-- Admin
-- ===========================================================================
create or replace function public.assign_job(p_job uuid, p_ustaad uuid)
returns public.ustaad_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.ustaad_jobs;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  select * into j from public.ustaad_jobs where id = p_job for update;
  if not found or j.status <> 'requested' then
    raise exception 'job_not_available' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.partners where id = p_ustaad and role = 'ustaad' and status = 'approved' and j.trade = any (trades)) then
    raise exception 'ustaad_not_approved' using errcode = 'P0001';
  end if;
  if j.timing = 'now' and public.ustaad_busy(p_ustaad) then
    raise exception 'ustaad_busy' using errcode = 'P0001';
  end if;
  update public.ustaad_jobs set ustaad_id = p_ustaad, status = 'accepted', accepted_at = now()
   where id = j.id returning * into j;
  return j;
end;
$$;

-- ===========================================================================
-- Cancel. Customer: free while searching, and for scheduled jobs until 2 hours before; otherwise the
-- cancellation fee until the ustaad arrives; after that, decline the quote instead (or support).
-- Ustaad: before arriving, the job goes back to searching. Admin: anything unfinished, with a reason.
-- ===========================================================================
create or replace function public.cancel_job(p_job uuid, p_reason text default null)
returns public.ustaad_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  j public.ustaad_jobs;
  fee integer;
begin
  select * into j from public.ustaad_jobs where id = p_job for update;
  if not found then
    raise exception 'job_not_found' using errcode = 'P0001';
  end if;
  if j.status in ('completed', 'visit_only', 'cancelled') then
    raise exception 'job_finished' using errcode = 'P0001';
  end if;

  if public.is_admin() then
    if p_reason is null or btrim(p_reason) = '' then
      raise exception 'reason_required' using errcode = 'P0001';
    end if;
    update public.ustaad_jobs set status = 'cancelled', cancelled_at = now(), cancelled_by = 'admin', cancel_reason = btrim(p_reason)
     where id = j.id returning * into j;
  elsif j.customer_id = auth.uid() then
    if j.status in ('arrived', 'quoted', 'in_progress') then
      raise exception 'contact_support_to_cancel' using errcode = 'P0001';
    end if;
    fee := case
      when j.status = 'requested' then 0
      when j.timing = 'scheduled' and j.scheduled_for > now() + interval '2 hours' then 0
      else coalesce((public.setting('cancellation') ->> 'fee_after_accept')::integer, 0)
    end;
    update public.ustaad_jobs set status = 'cancelled', cancelled_at = now(), cancelled_by = 'customer',
           cancellation_fee = fee, cancel_reason = nullif(btrim(coalesce(p_reason, '')), '')
     where id = j.id returning * into j;
  elsif j.ustaad_id = auth.uid() then
    if j.status not in ('accepted', 'on_the_way') then
      raise exception 'contact_support_to_cancel' using errcode = 'P0001';
    end if;
    update public.ustaad_jobs set status = 'requested', ustaad_id = null, accepted_at = null, on_the_way_at = null
     where id = j.id returning * into j;
  else
    raise exception 'job_not_found' using errcode = 'P0001';
  end if;
  return j;
end;
$$;

-- ===========================================================================
-- After a job is booked or changes status: offers, notifications
-- ===========================================================================
create or replace function public.jobs_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.offer_job_to_next_ustaad(new.id);
    return new;
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status = 'requested' then
    update public.job_offers set status = 'withdrawn', answered_at = now()
     where job_id = new.id and status = 'offered';
  end if;

  -- Ustaad gave the job back: don't offer it to them again, start offering afresh.
  if old.status in ('accepted', 'on_the_way') and new.status = 'requested' then
    if old.ustaad_id is not null then
      insert into public.job_offers (job_id, ustaad_id, status, expires_at, answered_at)
      values (new.id, old.ustaad_id, 'declined', now(), now())
      on conflict (job_id, ustaad_id) do update set status = 'declined', answered_at = now();
    end if;
    update public.ustaad_jobs set dispatch_gave_up_at = null,
           preferred_ustaad_id = case when preferred_ustaad_id = old.ustaad_id then null else preferred_ustaad_id end
     where id = new.id;
    perform public.offer_job_to_next_ustaad(new.id);
  end if;

  if new.status in ('accepted', 'on_the_way', 'arrived', 'completed')
     or (new.status = 'cancelled' and new.cancelled_by is distinct from 'customer')
     or (new.status = 'requested' and old.status <> 'requested') then
    perform public.enqueue_notification(new.customer_id, 'customer', 'job_status', null,
      jsonb_build_object('code', new.code, 'job_id', new.id, 'status', new.status));
  end if;
  if new.status = 'accepted' and new.ustaad_id is not null and auth.uid() is distinct from new.ustaad_id then
    perform public.enqueue_notification(new.ustaad_id, 'partner', 'job_assigned', null,
      jsonb_build_object('code', new.code, 'job_id', new.id));
  end if;
  if new.status = 'cancelled' and old.ustaad_id is not null then
    perform public.enqueue_notification(old.ustaad_id, 'partner', 'job_cancelled', null,
      jsonb_build_object('code', new.code, 'job_id', new.id));
  end if;
  return new;
end;
$$;

drop trigger if exists ustaad_jobs_after_change on public.ustaad_jobs;
create trigger ustaad_jobs_after_change after insert or update of status on public.ustaad_jobs
  for each row execute function public.jobs_after_change();

-- ===========================================================================
-- Account deletion: active jobs block it; waiting jobs are cancelled; finished jobs keep no
-- personal details. (Runs when a profile is deleted, so delete_my_account() needs no change.)
-- ===========================================================================
create or replace function public.profiles_before_delete_jobs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.ustaad_jobs
             where (customer_id = old.id or ustaad_id = old.id)
               and status in ('accepted', 'on_the_way', 'arrived', 'quoted', 'in_progress')) then
    raise exception 'active_job' using errcode = 'P0001';
  end if;
  update public.ustaad_jobs set status = 'cancelled', cancelled_at = now(), cancelled_by = 'customer', cancel_reason = 'Account deleted'
   where customer_id = old.id and status = 'requested';
  update public.ustaad_jobs
     set address_text = 'Deleted account', recipient_name = null, recipient_phone = null, instructions = null,
         problem_text = 'Removed', photo_paths = '{}'
   where customer_id = old.id;
  return old;
end;
$$;

drop trigger if exists profiles_before_delete_jobs on public.profiles;
create trigger profiles_before_delete_jobs before delete on public.profiles
  for each row execute function public.profiles_before_delete_jobs();

-- ===========================================================================
-- Storage: ustaads (and ustaads with an offer) can see the problem photos.
-- Customers upload them to order-media/<their id>/job-<random>.<ext> (allowed by the P4 rules).
-- ===========================================================================
create or replace function public.can_read_job_file(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.ustaad_jobs j
    where p_name = any (j.photo_paths)
      and (j.ustaad_id = auth.uid() or j.customer_id = auth.uid() or public.is_admin()
           or exists (select 1 from public.job_offers f where f.job_id = j.id and f.ustaad_id = auth.uid() and f.status = 'offered'))
  );
$$;

drop policy if exists "job media: read" on storage.objects;
create policy "job media: read" on storage.objects for select to authenticated
  using (bucket_id = 'order-media' and public.can_read_job_file(name));

-- ===========================================================================
-- Live updates and the dispatch timer, when available
-- ===========================================================================
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['ustaad_jobs', 'job_offers'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('homecare-job-dispatch', '10 seconds', 'select public.dispatch_pending_jobs()');
  end if;
exception when others then
  raise notice 'Job dispatch timer not set up (%). Offers still move on whenever an ustaad app checks in.', sqlerrm;
end;
$$;

-- ===========================================================================
-- Permissions
-- ===========================================================================
revoke execute on function public.offer_job_to_next_ustaad(uuid) from public, anon, authenticated;
revoke execute on function public.dispatch_pending_jobs() from public, anon, authenticated;
revoke execute on function public.jobs_after_change() from public, anon, authenticated;
revoke execute on function public.log_job_status() from public, anon, authenticated;
revoke execute on function public.profiles_before_delete_jobs() from public, anon, authenticated;
revoke execute on function public.ustaad_busy(uuid) from public, anon, authenticated;
revoke execute on function public.is_online_ustaad(uuid, public.ustaad_trade) from public, anon, authenticated;
revoke execute on function public.has_worked_with(uuid) from public, anon;
revoke execute on function public.can_read_job_file(text) from public, anon;
grant execute on function public.has_worked_with(uuid) to authenticated;
grant execute on function public.can_read_job_file(text) to authenticated;

revoke execute on function public.create_ustaad_job(uuid, public.ustaad_trade, text, public.job_timing, timestamptz, text[], uuid, text) from public, anon;
revoke execute on function public.answer_quote(uuid, boolean) from public, anon;
revoke execute on function public.report_issue_again(uuid, text) from public, anon;
revoke execute on function public.rate_job(uuid, smallint, text) from public, anon;
revoke execute on function public.job_ustaad(uuid) from public, anon;
revoke execute on function public.my_favourite_ustaads() from public, anon;
revoke execute on function public.job_ustaad_location(uuid) from public, anon;
revoke execute on function public.list_open_jobs(double precision, double precision) from public, anon;
revoke execute on function public.accept_job(uuid) from public, anon;
revoke execute on function public.my_job_offer() from public, anon;
revoke execute on function public.respond_job_offer(uuid, boolean) from public, anon;
revoke execute on function public.advance_job(uuid, public.job_status, double precision, double precision) from public, anon;
revoke execute on function public.send_quote(uuid, integer, integer, text) from public, anon;
revoke execute on function public.complete_job(uuid) from public, anon;
revoke execute on function public.job_contact(uuid) from public, anon;
revoke execute on function public.assign_job(uuid, uuid) from public, anon;
revoke execute on function public.cancel_job(uuid, text) from public, anon;
grant execute on function public.create_ustaad_job(uuid, public.ustaad_trade, text, public.job_timing, timestamptz, text[], uuid, text) to authenticated;
grant execute on function public.answer_quote(uuid, boolean) to authenticated;
grant execute on function public.report_issue_again(uuid, text) to authenticated;
grant execute on function public.rate_job(uuid, smallint, text) to authenticated;
grant execute on function public.job_ustaad(uuid) to authenticated;
grant execute on function public.my_favourite_ustaads() to authenticated;
grant execute on function public.job_ustaad_location(uuid) to authenticated;
grant execute on function public.list_open_jobs(double precision, double precision) to authenticated;
grant execute on function public.accept_job(uuid) to authenticated;
grant execute on function public.my_job_offer() to authenticated;
grant execute on function public.respond_job_offer(uuid, boolean) to authenticated;
grant execute on function public.advance_job(uuid, public.job_status, double precision, double precision) to authenticated;
grant execute on function public.send_quote(uuid, integer, integer, text) to authenticated;
grant execute on function public.complete_job(uuid) to authenticated;
grant execute on function public.job_contact(uuid) to authenticated;
grant execute on function public.assign_job(uuid, uuid) to authenticated;
grant execute on function public.cancel_job(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- CHECK: this is the row you see in "Results" — every column should be true
-- ----------------------------------------------------------------------------
select
  (select count(*) from public.app_settings
    where key in ('ustaad_dispatch_radius_km', 'ustaad_offer_seconds', 'ustaad_max_auto_offers')) = 3 as settings_ok,
  exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'ustaad_jobs' and rowsecurity)
    and exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'job_events' and rowsecurity)
    and exists (select 1 from pg_trigger where tgname = 'ustaad_jobs_log_status') as jobs_ok,
  exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'job_offers' and rowsecurity)
    and exists (select 1 from pg_trigger where tgname = 'ustaad_jobs_after_change') as offers_ok,
  exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'favourite_ustaads' and rowsecurity)
    and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'favourite_ustaads') = 3 as favourites_ok,
  exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'job media: read')
    and exists (select 1 from pg_trigger where tgname = 'profiles_before_delete_jobs') as media_ok,
  (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace and proname in
    ('create_ustaad_job', 'answer_quote', 'report_issue_again', 'rate_job', 'job_ustaad', 'my_favourite_ustaads', 'job_ustaad_location', 'list_open_jobs', 'accept_job', 'my_job_offer', 'respond_job_offer', 'advance_job', 'send_quote', 'complete_job', 'job_contact', 'assign_job', 'cancel_job', 'offer_job_to_next_ustaad', 'dispatch_pending_jobs', 'jobs_after_change', 'log_job_status', 'profiles_before_delete_jobs', 'ustaad_busy', 'is_online_ustaad', 'has_worked_with', 'can_read_job_file')) = 26 as actions_ok;
