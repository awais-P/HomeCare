-- ============================================================================
--  HomeCare — Supabase database setup, part 8 (P7: trust & safety)
-- ============================================================================
--
--  Run SETUP_01 … SETUP_07 first (once). Then:
--  1. Supabase dashboard → your project → left sidebar "SQL Editor" → "+ New query".
--  2. Copy ALL of this file (Ctrl+A, Ctrl+C), paste it into the editor (Ctrl+V).
--  3. Click "Run" (or Ctrl+Enter). If Supabase warns about a "destructive operation", confirm:
--     the only things dropped are rules and triggers this script re-creates right after.
--  4. The "Results" panel shows ONE row. Every column must be "true":
--
--       columns_ok | sos_ok | sharing_ok | disputes_ok | moderation_ok | actions_ok
--
--     Any "false", or a red error → send the Results row / error text to the team.
--
--  Safe to run again: it changes nothing and keeps all data.
--  It updates the automatic-offer functions from SETUP_05 and SETUP_06: if you ever run either of
--  those again, run this file again afterwards.
--
--  WHAT IT ADDS
--  - SOS alerts (customers and partners) that reach the admins at once.
--  - Share a live trip or job with family: a private link showing status and where the partner is.
--  - "Prefer a woman rider or ustaad": women are offered the order first (gender comes from the
--    CNIC: last digit odd = man, even = woman).
--  - Disputes: report a problem on an order or job; admins review, resolve with a note and record
--    any money adjustment.
--  - Rating moderation (admins remove unfair ratings) and a rating summary per partner.
--
--  For developers: this mirrors supabase/migrations/20261121000000_safety.sql and is covered by
--  `npm run db:test`. Change both together (regenerate this file from the migration).
-- ============================================================================

-- ===========================================================================
-- Women-first preference
-- Gender comes from the CNIC: in a Pakistani CNIC the last digit is odd for men, even for women.
-- ===========================================================================
alter table public.partners add column if not exists gender text
  generated always as (
    case when cnic_number is null then null
         when (right(cnic_number, 1))::integer % 2 = 0 then 'female'
         else 'male' end
  ) stored;

alter table public.profiles add column if not exists prefer_female_partner boolean not null default false;
grant update (prefer_female_partner) on public.profiles to authenticated;

create or replace function public.offer_order_to_next_rider(p_order uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  pick_id uuid;
  pick_km double precision;
  new_offer uuid;
  women_first boolean;
  radius double precision := coalesce((public.setting('dispatch_radius_km'))::text::double precision, 5);
  max_offers integer := coalesce((public.setting('max_auto_offers'))::text::integer, 3);
  secs integer := coalesce((public.setting('offer_seconds'))::text::integer, 30);
begin
  select * into o from public.orders where id = p_order for update;
  if not found or o.status <> 'requested' or o.dispatch_gave_up_at is not null then
    return null;
  end if;
  if exists (select 1 from public.order_offers where order_id = o.id and status = 'offered') then
    return null;
  end if;
  if (select count(*) from public.order_offers where order_id = o.id) >= max_offers then
    update public.orders set dispatch_gave_up_at = now() where id = o.id;
    return null;
  end if;
  select coalesce(pr.prefer_female_partner, false) into women_first from public.profiles pr where pr.id = o.customer_id;

  select p.id, extensions.st_distance(p.last_location, o.delivery_location) / 1000
    into pick_id, pick_km
    from public.partners p
   where p.role = 'rider' and p.status = 'approved' and p.is_online
     and p.last_location is not null
     and p.last_seen_at > now() - interval '2 minutes'
     and extensions.st_dwithin(p.last_location, o.delivery_location, radius * 1000)
     and not exists (select 1 from public.orders x
                      where x.rider_id = p.id and x.status in ('accepted', 'at_shop', 'on_the_way'))
     and not exists (select 1 from public.order_offers f
                      where f.rider_id = p.id and (f.order_id = o.id or f.status = 'offered'))
   order by case when coalesce(women_first, false) and p.gender = 'female' then 0 else 1 end,
            extensions.st_distance(p.last_location, o.delivery_location)
   limit 1;
  if pick_id is null then
    return null;
  end if;

  begin
    insert into public.order_offers (order_id, rider_id, distance_km, expires_at)
    values (o.id, pick_id, round(pick_km::numeric, 2), now() + make_interval(secs => secs))
    returning id into new_offer;
  exception when unique_violation then
    return null;
  end;
  perform public.enqueue_notification(pick_id, 'partner', 'new_offer', o.id,
    jsonb_build_object('code', o.code, 'fee', o.estimated_fee, 'km', round(pick_km::numeric, 1)));
  return new_offer;
end;
$$;

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
  women_first boolean;
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
  select coalesce(pr.prefer_female_partner, false) into women_first from public.profiles pr where pr.id = j.customer_id;

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
     order by case when coalesce(women_first, false) and p.gender = 'female' then 0 else 1 end,
              extensions.st_distance(p.last_location, j.location)
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

-- ===========================================================================
-- Who is the caller on an order or job? ('customer', 'partner', or null) and is it active?
-- ===========================================================================
create or replace function public.thread_role(p_order uuid, p_job uuid)
returns table (role text, is_active boolean, finished_at timestamptz, customer_id uuid, partner_id uuid, code text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  o public.orders;
  j public.ustaad_jobs;
  me uuid := auth.uid();
begin
  if p_order is not null then
    select * into o from public.orders where id = p_order;
    if not found then return; end if;
    return query select
      case when o.customer_id = me then 'customer' when o.rider_id = me then 'partner' end,
      o.status in ('accepted', 'at_shop', 'on_the_way'),
      coalesce(o.delivered_at, o.cancelled_at), o.customer_id, o.rider_id, o.code;
  elsif p_job is not null then
    select * into j from public.ustaad_jobs where id = p_job;
    if not found then return; end if;
    return query select
      case when j.customer_id = me then 'customer' when j.ustaad_id = me then 'partner' end,
      j.status in ('accepted', 'on_the_way', 'arrived', 'quoted', 'in_progress'),
      coalesce(j.completed_at, j.cancelled_at), j.customer_id, j.ustaad_id, j.code;
  end if;
end;
$$;

-- Tell every admin (on whichever HomeCare app they use).
create or replace function public.notify_admins(p_kind text, p_order uuid, p_params jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
begin
  for a in select user_id from public.admins loop
    perform public.enqueue_notification(a.user_id, 'customer', p_kind, p_order, p_params);
    perform public.enqueue_notification(a.user_id, 'partner', p_kind, p_order, p_params);
  end loop;
end;
$$;

-- ===========================================================================
-- SOS alerts
-- ===========================================================================
create table if not exists public.safety_alerts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users (id) on delete set null,
  role             text not null check (role in ('customer', 'partner')),
  order_id         uuid references public.orders (id) on delete set null,
  job_id           uuid references public.ustaad_jobs (id) on delete set null,
  latitude         double precision,
  longitude        double precision,
  note             text check (note is null or char_length(note) <= 300),
  status           text not null default 'open' check (status in ('open', 'resolved')),
  resolution_note  text check (resolution_note is null or char_length(resolution_note) <= 500),
  resolved_by      uuid references auth.users (id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists safety_alerts_open_idx on public.safety_alerts (created_at desc) where status = 'open';
alter table public.safety_alerts enable row level security;
revoke all on public.safety_alerts from anon, authenticated;
grant select on public.safety_alerts to authenticated;

drop policy if exists "sos: own or admin" on public.safety_alerts;
create policy "sos: own or admin" on public.safety_alerts for select to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

-- Raise an SOS (optionally about an order or job the caller is on). Admins are notified at once.
create or replace function public.raise_sos(
  p_order uuid default null,
  p_job uuid default null,
  lat double precision default null,
  lng double precision default null,
  p_note text default null
)
returns public.safety_alerts
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  who text := 'customer';
  thread_code text := '';
  a public.safety_alerts;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if num_nonnulls(p_order, p_job) > 1 then
    raise exception 'one_thread_required' using errcode = 'P0001';
  end if;
  if p_order is not null or p_job is not null then
    select * into t from public.thread_role(p_order, p_job);
    if not found or t.role is null then
      raise exception 'not_your_order' using errcode = 'P0001';
    end if;
    who := t.role;
    thread_code := t.code;
  elsif exists (select 1 from public.partners where id = auth.uid() and status = 'approved') then
    who := 'partner';
  end if;
  insert into public.safety_alerts (user_id, role, order_id, job_id, latitude, longitude, note)
  values (auth.uid(), who, p_order, p_job, lat, lng, nullif(btrim(coalesce(p_note, '')), ''))
  returning * into a;
  perform public.notify_admins('sos_alert', p_order,
    jsonb_build_object('alert_id', a.id, 'role', who, 'code', thread_code, 'job_id', p_job));
  return a;
end;
$$;

create or replace function public.resolve_sos(p_alert uuid, p_note text)
returns public.safety_alerts
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.safety_alerts;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if p_note is null or btrim(p_note) = '' then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  update public.safety_alerts
     set status = 'resolved', resolution_note = btrim(p_note), resolved_by = auth.uid(), resolved_at = now()
   where id = p_alert and status = 'open'
  returning * into a;
  if not found then
    raise exception 'alert_not_open' using errcode = 'P0001';
  end if;
  return a;
end;
$$;

-- ===========================================================================
-- Share a live trip / job with family: a secret link that shows status and where the partner is,
-- without the address or phone numbers. It stops working 12 hours after creation, 1 hour after
-- the order or job finishes, or when the customer turns it off.
-- ===========================================================================
create table if not exists public.trip_shares (
  token       text primary key default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  order_id    uuid references public.orders (id) on delete cascade,
  job_id      uuid references public.ustaad_jobs (id) on delete cascade,
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '12 hours',
  revoked     boolean not null default false,
  constraint trip_shares_one_thread check (num_nonnulls(order_id, job_id) = 1)
);

alter table public.trip_shares enable row level security;
revoke all on public.trip_shares from anon, authenticated;
grant select on public.trip_shares to authenticated;

drop policy if exists "trip shares: own" on public.trip_shares;
create policy "trip shares: own" on public.trip_shares for select to authenticated
  using ((select auth.uid()) = created_by);

-- Customer: get the share link token for their order or job (reuses a live one).
create or replace function public.create_trip_share(p_order uuid default null, p_job uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  tok text;
begin
  if num_nonnulls(p_order, p_job) <> 1 then
    raise exception 'one_thread_required' using errcode = 'P0001';
  end if;
  select * into t from public.thread_role(p_order, p_job);
  if not found or t.role is distinct from 'customer' then
    raise exception 'not_your_order' using errcode = 'P0001';
  end if;
  if t.finished_at is not null then
    raise exception 'order_finished' using errcode = 'P0001';
  end if;
  select token into tok from public.trip_shares
   where created_by = auth.uid() and not revoked and expires_at > now()
     and order_id is not distinct from p_order and job_id is not distinct from p_job
   limit 1;
  if tok is null then
    insert into public.trip_shares (order_id, job_id, created_by) values (p_order, p_job, auth.uid())
    returning token into tok;
  end if;
  return tok;
end;
$$;

create or replace function public.revoke_trip_share(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.trip_shares set revoked = true where token = p_token and created_by = auth.uid();
$$;

-- Public (no sign-in): what a family member sees on the tracking page.
create or replace function public.shared_trip(p_token text)
returns table (
  kind text, code text, status text, service text, partner_name text, vehicle text,
  partner_latitude double precision, partner_longitude double precision, partner_seen_at timestamptz,
  area text, scheduled_for timestamptz, updated_at timestamptz, finished boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  s public.trip_shares;
  o public.orders;
  j public.ustaad_jobs;
  p public.partners;
  first_name text;
  done_at timestamptz;
begin
  select * into s from public.trip_shares where token = p_token and not revoked and expires_at > now();
  if not found then
    return;
  end if;
  if s.order_id is not null then
    select * into o from public.orders where id = s.order_id;
    done_at := coalesce(o.delivered_at, o.cancelled_at);
    if done_at is not null and done_at < now() - interval '1 hour' then return; end if;
    select * into p from public.partners where id = o.rider_id;
    select split_part(btrim(pr.full_name), ' ', 1) into first_name from public.profiles pr where pr.id = o.rider_id;
    return query select
      'order'::text, o.code, o.status::text, o.category::text, first_name,
      case when p.id is null then null else concat_ws(' ', p.vehicle_type::text, p.vehicle_number) end,
      case when o.status in ('accepted', 'at_shop', 'on_the_way') then p.last_latitude end,
      case when o.status in ('accepted', 'at_shop', 'on_the_way') then p.last_longitude end,
      case when o.status in ('accepted', 'at_shop', 'on_the_way') then p.last_seen_at end,
      coalesce((select ad.area from public.addresses ad where ad.id = o.address_id), (select z.name from public.service_zones z where z.id = o.zone_id)),
      null::timestamptz, o.updated_at, done_at is not null;
  else
    select * into j from public.ustaad_jobs where id = s.job_id;
    done_at := coalesce(j.completed_at, j.cancelled_at);
    if done_at is not null and done_at < now() - interval '1 hour' then return; end if;
    select * into p from public.partners where id = j.ustaad_id;
    select split_part(btrim(pr.full_name), ' ', 1) into first_name from public.profiles pr where pr.id = j.ustaad_id;
    return query select
      'job'::text, j.code, j.status::text, j.trade::text, first_name, null::text,
      case when j.status in ('accepted', 'on_the_way', 'arrived') then p.last_latitude end,
      case when j.status in ('accepted', 'on_the_way', 'arrived') then p.last_longitude end,
      case when j.status in ('accepted', 'on_the_way', 'arrived') then p.last_seen_at end,
      coalesce((select ad.area from public.addresses ad where ad.id = j.address_id), (select z.name from public.service_zones z where z.id = j.zone_id)),
      j.scheduled_for, j.updated_at, done_at is not null;
  end if;
end;
$$;

-- ===========================================================================
-- Disputes
-- ===========================================================================
do $$
begin
  create type public.dispute_reason as enum
    ('wrong_items', 'overcharged', 'poor_work', 'damage', 'late_or_no_show', 'behaviour', 'safety', 'other');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.dispute_status as enum ('open', 'in_review', 'resolved', 'rejected');
exception when duplicate_object then null;
end;
$$;

create table if not exists public.disputes (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique default ('DS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  order_id       uuid references public.orders (id) on delete set null,
  job_id         uuid references public.ustaad_jobs (id) on delete set null,
  raised_by      uuid references auth.users (id) on delete set null,
  raised_role    text not null check (raised_role in ('customer', 'partner')),
  reason         public.dispute_reason not null,
  details        text not null check (char_length(btrim(details)) between 5 and 1000),
  status         public.dispute_status not null default 'open',
  resolution     text check (resolution is null or char_length(resolution) <= 1000),
  -- PKR: positive = paid back to the customer, negative = charged to them. Recorded for accounting.
  adjustment     integer not null default 0 check (adjustment between -100000 and 100000),
  handled_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  constraint disputes_one_thread check (num_nonnulls(order_id, job_id) = 1)
);

create index if not exists disputes_open_idx on public.disputes (created_at desc) where status in ('open', 'in_review');
alter table public.disputes enable row level security;
revoke all on public.disputes from anon, authenticated;
grant select on public.disputes to authenticated;

-- The person who raised it, and admins. (The other side hears about it from support.)
drop policy if exists "disputes: raiser or admin" on public.disputes;
create policy "disputes: raiser or admin" on public.disputes for select to authenticated
  using ((select auth.uid()) = raised_by or (select public.is_admin()));

drop trigger if exists disputes_set_updated_at on public.disputes;
create trigger disputes_set_updated_at before update on public.disputes
  for each row execute function public.set_updated_at();

-- Raise a problem about an order or job you were on: while it is active, or within 7 days after.
create or replace function public.raise_dispute(
  p_reason public.dispute_reason,
  p_details text,
  p_order uuid default null,
  p_job uuid default null
)
returns public.disputes
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  d public.disputes;
begin
  if num_nonnulls(p_order, p_job) <> 1 then
    raise exception 'one_thread_required' using errcode = 'P0001';
  end if;
  select * into t from public.thread_role(p_order, p_job);
  if not found or t.role is null then
    raise exception 'not_your_order' using errcode = 'P0001';
  end if;
  if t.finished_at is not null and t.finished_at < now() - interval '7 days' then
    raise exception 'too_late' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.disputes
             where raised_by = auth.uid() and status in ('open', 'in_review')
               and order_id is not distinct from p_order and job_id is not distinct from p_job) then
    raise exception 'dispute_exists' using errcode = 'P0001';
  end if;
  if p_details is null or char_length(btrim(p_details)) < 5 then
    raise exception 'details_required' using errcode = 'P0001';
  end if;
  insert into public.disputes (order_id, job_id, raised_by, raised_role, reason, details)
  values (p_order, p_job, auth.uid(), t.role, p_reason, btrim(p_details))
  returning * into d;
  perform public.notify_admins('dispute_raised', p_order,
    jsonb_build_object('dispute_id', d.id, 'code', d.code, 'reason', d.reason, 'job_id', p_job));
  return d;
end;
$$;

-- Admin: move a dispute along. Resolving or rejecting needs a note the raiser will see.
create or replace function public.update_dispute(
  p_dispute uuid,
  p_status public.dispute_status,
  p_resolution text default null,
  p_adjustment integer default 0
)
returns public.disputes
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.disputes;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  select * into d from public.disputes where id = p_dispute for update;
  if not found then
    raise exception 'dispute_not_found' using errcode = 'P0001';
  end if;
  if d.status in ('resolved', 'rejected') then
    raise exception 'dispute_closed' using errcode = 'P0001';
  end if;
  if p_status = 'open' then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if p_status in ('resolved', 'rejected') and (p_resolution is null or btrim(p_resolution) = '') then
    raise exception 'resolution_required' using errcode = 'P0001';
  end if;
  update public.disputes
     set status = p_status,
         resolution = coalesce(nullif(btrim(coalesce(p_resolution, '')), ''), resolution),
         adjustment = case when p_status = 'resolved' then coalesce(p_adjustment, 0) else 0 end,
         handled_by = auth.uid(),
         resolved_at = case when p_status in ('resolved', 'rejected') then now() end
   where id = d.id
  returning * into d;
  perform public.enqueue_notification(d.raised_by, case when d.raised_role = 'partner' then 'partner' else 'customer' end,
    'dispute_update', d.order_id,
    jsonb_build_object('dispute_id', d.id, 'code', d.code, 'status', d.status, 'job_id', d.job_id));
  return d;
end;
$$;

-- ===========================================================================
-- Rating moderation: an admin removes an unfair or abusive rating (kept for the record).
-- It no longer counts, and the customer cannot rate that order or job again.
-- ===========================================================================
alter table public.orders add column if not exists removed_rating smallint;
alter table public.orders add column if not exists rating_removed_reason text;
alter table public.orders add column if not exists rating_removed_at timestamptz;
alter table public.ustaad_jobs add column if not exists removed_rating smallint;
alter table public.ustaad_jobs add column if not exists rating_removed_reason text;
alter table public.ustaad_jobs add column if not exists rating_removed_at timestamptz;

create or replace function public.block_rating_after_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.rating_removed_at is not null and new.rating is not null then
    raise exception 'rating_removed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_block_rating on public.orders;
create trigger orders_block_rating before update of rating on public.orders
  for each row execute function public.block_rating_after_removal();
drop trigger if exists ustaad_jobs_block_rating on public.ustaad_jobs;
create trigger ustaad_jobs_block_rating before update of rating on public.ustaad_jobs
  for each row execute function public.block_rating_after_removal();

create or replace function public.remove_rating(p_reason text, p_order uuid default null, p_job uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if p_order is not null then
    update public.orders
       set removed_rating = rating, rating = null, rating_removed_reason = btrim(p_reason), rating_removed_at = now()
     where id = p_order and rating is not null;
  elsif p_job is not null then
    update public.ustaad_jobs
       set removed_rating = rating, rating = null, rating_removed_reason = btrim(p_reason), rating_removed_at = now()
     where id = p_job and rating is not null;
  end if;
  if not found then
    raise exception 'no_rating' using errcode = 'P0001';
  end if;
end;
$$;

-- Admin: rating summary per partner (low ratings flagged for a look).
create or replace function public.partner_ratings()
returns table (partner_id uuid, rating_avg numeric, rating_count integer, low boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  return query
    with r as (
      select rider_id as pid, rating from public.orders where rating is not null and rider_id is not null
      union all
      select ustaad_id, rating from public.ustaad_jobs where rating is not null and ustaad_id is not null
    )
    select pid, round(avg(rating)::numeric, 2), count(*)::integer, (count(*) >= 5 and avg(rating) < 3.5)
      from r group by pid;
end;
$$;

-- ===========================================================================
-- Account deletion: SOS alerts and disputes are kept for safety records, without the notes.
-- ===========================================================================
create or replace function public.profiles_before_delete_safety()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.safety_alerts set note = null where user_id = old.id;
  update public.trip_shares set revoked = true where created_by = old.id;
  return old;
end;
$$;

drop trigger if exists profiles_before_delete_safety on public.profiles;
create trigger profiles_before_delete_safety before delete on public.profiles
  for each row execute function public.profiles_before_delete_safety();

-- Live updates for the admin panel
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['safety_alerts', 'disputes'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end;
$$;

-- ===========================================================================
-- Permissions
-- ===========================================================================
revoke execute on function public.thread_role(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.notify_admins(text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.block_rating_after_removal() from public, anon, authenticated;
revoke execute on function public.profiles_before_delete_safety() from public, anon, authenticated;
revoke execute on function public.offer_order_to_next_rider(uuid) from public, anon, authenticated;
revoke execute on function public.offer_job_to_next_ustaad(uuid) from public, anon, authenticated;
revoke execute on function public.raise_sos(uuid, uuid, double precision, double precision, text) from public, anon;
revoke execute on function public.resolve_sos(uuid, text) from public, anon;
revoke execute on function public.create_trip_share(uuid, uuid) from public, anon;
revoke execute on function public.revoke_trip_share(text) from public, anon;
revoke execute on function public.raise_dispute(public.dispute_reason, text, uuid, uuid) from public, anon;
revoke execute on function public.update_dispute(uuid, public.dispute_status, text, integer) from public, anon;
revoke execute on function public.remove_rating(text, uuid, uuid) from public, anon;
revoke execute on function public.partner_ratings() from public, anon;
grant execute on function public.raise_sos(uuid, uuid, double precision, double precision, text) to authenticated;
grant execute on function public.resolve_sos(uuid, text) to authenticated;
grant execute on function public.create_trip_share(uuid, uuid) to authenticated;
grant execute on function public.revoke_trip_share(text) to authenticated;
grant execute on function public.raise_dispute(public.dispute_reason, text, uuid, uuid) to authenticated;
grant execute on function public.update_dispute(uuid, public.dispute_status, text, integer) to authenticated;
grant execute on function public.remove_rating(text, uuid, uuid) to authenticated;
grant execute on function public.partner_ratings() to authenticated;
-- The tracking page works without signing in.
revoke execute on function public.shared_trip(text) from public;
grant execute on function public.shared_trip(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- CHECK: this is the row you see in "Results" — every column should be true
-- ----------------------------------------------------------------------------
select
  exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'partners' and column_name = 'gender')
    and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'prefer_female_partner') as columns_ok,
  exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'safety_alerts' and rowsecurity) as sos_ok,
  exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'trip_shares' and rowsecurity)
    and has_function_privilege('anon', 'public.shared_trip(text)', 'execute') as sharing_ok,
  exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'disputes' and rowsecurity) as disputes_ok,
  exists (select 1 from pg_trigger where tgname = 'orders_block_rating')
    and exists (select 1 from pg_trigger where tgname = 'ustaad_jobs_block_rating') as moderation_ok,
  (select count(distinct proname) from pg_proc where pronamespace = 'public'::regnamespace and proname in
    ('thread_role', 'notify_admins', 'raise_sos', 'resolve_sos', 'create_trip_share', 'revoke_trip_share', 'shared_trip', 'raise_dispute', 'update_dispute', 'block_rating_after_removal', 'remove_rating', 'partner_ratings', 'profiles_before_delete_safety')) = 13 as actions_ok;
