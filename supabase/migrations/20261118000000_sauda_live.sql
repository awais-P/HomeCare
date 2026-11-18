-- P4 (slice 2): substitutions, voice notes, automatic offers to the nearest rider,
-- rider location for the customer, live updates (Realtime) and the push notification queue.
-- Written to be safe to re-run (the dashboard SQL Editor script is the same statements).
-- It only ADDS to slice 1: no function from 20261117000000 is redefined here.

-- ===========================================================================
-- Settings for automatic offers
-- ===========================================================================
insert into public.app_settings (key, value, description) values
  ('offer_seconds', '30',
   'Seconds a rider has to accept an automatic offer before it goes to the next nearest rider.'),
  ('max_auto_offers', '3',
   'How many riders an order is offered to automatically. After that it waits in the nearby list for any rider, or for an admin to assign it.')
on conflict (key) do nothing;

-- ===========================================================================
-- New order columns
-- ===========================================================================
alter table public.orders add column if not exists voice_note_path text;
-- Set when automatic offers ran out: the admin panel shows these as "needs a rider".
alter table public.orders add column if not exists dispatch_gave_up_at timestamptz;

-- Voice notes are audio files in the same private bucket.
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp',
                                  'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm']
 where id = 'order-media';

-- ===========================================================================
-- Substitutions: "No Olpers — get Nestle?" asked by the rider at the shop, answered by the customer
-- ===========================================================================
do $$
begin
  create type public.substitution_status as enum ('pending', 'approved', 'declined', 'no_reply');
exception when duplicate_object then null;
end;
$$;

create table if not exists public.order_substitutions (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  item         text not null check (char_length(btrim(item)) between 1 and 150),
  -- null = "not available, skip it?"
  suggestion   text check (suggestion is null or char_length(btrim(suggestion)) between 1 and 150),
  price        integer check (price is null or price between 0 and 100000),
  photo_path   text,
  status       public.substitution_status not null default 'pending',
  created_at   timestamptz not null default now(),
  answered_at  timestamptz
);

create index if not exists order_substitutions_order_idx on public.order_substitutions (order_id, created_at);

alter table public.order_substitutions enable row level security;
revoke all on public.order_substitutions from anon, authenticated;
grant select on public.order_substitutions to authenticated;

drop policy if exists "substitutions: same people as the order" on public.order_substitutions;
create policy "substitutions: same people as the order" on public.order_substitutions for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

-- ===========================================================================
-- Automatic offers: an order is offered to the nearest free online rider for a few seconds,
-- then to the next one, up to max_auto_offers riders.
-- ===========================================================================
do $$
begin
  create type public.offer_status as enum ('offered', 'accepted', 'declined', 'expired', 'withdrawn');
exception when duplicate_object then null;
end;
$$;

create table if not exists public.order_offers (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  rider_id     uuid not null references public.partners (id) on delete cascade,
  status       public.offer_status not null default 'offered',
  distance_km  numeric(6, 2),
  offered_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  answered_at  timestamptz,
  unique (order_id, rider_id)
);

-- One open offer per order and per rider at a time.
create unique index if not exists order_offers_one_open_per_order on public.order_offers (order_id) where status = 'offered';
create unique index if not exists order_offers_one_open_per_rider on public.order_offers (rider_id) where status = 'offered';

alter table public.order_offers enable row level security;
revoke all on public.order_offers from anon, authenticated;
grant select on public.order_offers to authenticated;

drop policy if exists "offers: own rider or admin" on public.order_offers;
create policy "offers: own rider or admin" on public.order_offers for select to authenticated
  using ((select auth.uid()) = rider_id or (select public.is_admin()));

-- ===========================================================================
-- Push notifications: device tokens and a queue the API sends from
-- ===========================================================================
create table if not exists public.push_tokens (
  token       text primary key check (char_length(token) between 10 and 4096),
  user_id     uuid not null references auth.users (id) on delete cascade,
  app         text not null check (app in ('customer', 'partner')),
  platform    text not null check (platform in ('android', 'ios')),
  updated_at  timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id, app);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from anon, authenticated;
-- No client policies: tokens change only through the functions below.

create table if not exists public.notification_outbox (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  app         text not null check (app in ('customer', 'partner')),
  kind        text not null,
  order_id    uuid references public.orders (id) on delete cascade,
  params      jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  attempts    smallint not null default 0,
  last_error  text
);

create index if not exists notification_outbox_unsent_idx on public.notification_outbox (id) where sent_at is null;
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon, authenticated;
-- Read and marked as sent only by the API (secret key).

-- Queue a notification, only if that person has the app with notifications on.
create or replace function public.enqueue_notification(p_user uuid, p_app text, p_kind text, p_order uuid, p_params jsonb default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is not null and exists (select 1 from public.push_tokens where user_id = p_user and app = p_app) then
    insert into public.notification_outbox (user_id, app, kind, order_id, params)
    values (p_user, p_app, p_kind, p_order, coalesce(p_params, '{}'));
  end if;
end;
$$;

create or replace function public.register_push_token(p_token text, p_app text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  insert into public.push_tokens (token, user_id, app, platform)
  values (p_token, auth.uid(), p_app, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, app = excluded.app, platform = excluded.platform, updated_at = now();
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

-- ===========================================================================
-- Dispatch
-- ===========================================================================

-- Offer one waiting order to the nearest free online rider who hasn't had it yet.
-- Returns the new offer id, or null (already offered, nobody free, or offers used up).
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
   order by extensions.st_distance(p.last_location, o.delivery_location)
   limit 1;
  if pick_id is null then
    return null;
  end if;

  begin
    insert into public.order_offers (order_id, rider_id, distance_km, expires_at)
    values (o.id, pick_id, round(pick_km::numeric, 2), now() + make_interval(secs => secs))
    returning id into new_offer;
  exception when unique_violation then
    -- Another dispatch run got there first.
    return null;
  end;
  perform public.enqueue_notification(pick_id, 'partner', 'new_offer', o.id,
    jsonb_build_object('code', o.code, 'fee', o.estimated_fee, 'km', round(pick_km::numeric, 1)));
  return new_offer;
end;
$$;

-- Expire old offers and offer every waiting order to its next rider. Runs every 10 s (pg_cron,
-- when available) and whenever a rider's app checks for offers, so it also works without cron.
create or replace function public.dispatch_pending()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  update public.order_offers set status = 'expired', answered_at = now()
   where status = 'offered' and expires_at <= now();
  for r in
    select o.id from public.orders o
     where o.status = 'requested' and o.dispatch_gave_up_at is null
       and not exists (select 1 from public.order_offers f where f.order_id = o.id and f.status = 'offered')
     order by o.created_at
     limit 50
  loop
    if public.offer_order_to_next_rider(r.id) is not null then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- Rider: my current offer, if any (order summary without the address).
create or replace function public.my_offer()
returns table (
  offer_id uuid, order_id uuid, code text, category public.sauda_category, items_text text,
  shop_preference text, voice_note_path text, photo_count integer, area text, distance_km double precision,
  estimated_fee integer, expires_at timestamptz, seconds_left integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not exists (select 1 from public.partners where id = auth.uid() and status = 'approved' and is_online and role = 'rider') then
    return;
  end if;
  perform public.dispatch_pending();
  return query
    select f.id, o.id, o.code, o.category, o.items_text, o.shop_preference, o.voice_note_path,
           cardinality(o.photo_paths), coalesce(ad.area, z.name),
           f.distance_km::double precision, o.estimated_fee, f.expires_at,
           greatest(0, ceil(extract(epoch from f.expires_at - now())))::integer
      from public.order_offers f
      join public.orders o on o.id = f.order_id
      left join public.addresses ad on ad.id = o.address_id
      left join public.service_zones z on z.id = o.zone_id
     where f.rider_id = auth.uid() and f.status = 'offered' and f.expires_at > now()
     limit 1;
end;
$$;

-- Rider: accept or decline an offer. Accepting returns the order (now theirs); declining returns null
-- and the order goes to the next rider straight away.
create or replace function public.respond_offer(p_offer uuid, p_accept boolean)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.order_offers;
  o public.orders;
begin
  select * into f from public.order_offers where id = p_offer and rider_id = auth.uid() for update;
  if not found then
    raise exception 'offer_not_found' using errcode = 'P0001';
  end if;
  if f.status <> 'offered' or f.expires_at <= now() then
    raise exception 'offer_expired' using errcode = 'P0001';
  end if;
  if p_accept then
    update public.order_offers set status = 'accepted', answered_at = now() where id = f.id;
    select * into o from public.accept_order(f.order_id);
    return o;
  end if;
  update public.order_offers set status = 'declined', answered_at = now() where id = f.id;
  perform public.offer_order_to_next_rider(f.order_id);
  return null;
end;
$$;

-- ===========================================================================
-- Voice note: place an order with a recorded list (the text list becomes optional)
-- ===========================================================================
create or replace function public.place_sauda_order(
  p_address_id uuid,
  p_category public.sauda_category,
  p_items_text text,
  p_shop_preference text default null,
  p_instructions text default null,
  p_photo_paths text[] default '{}',
  p_voice_path text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  items text := nullif(btrim(coalesce(p_items_text, '')), '');
begin
  if p_voice_path is not null
     and p_voice_path !~ ('^' || auth.uid()::text || '/voice-[A-Za-z0-9_-]{1,64}\.(m4a|mp4|aac|webm)$') then
    raise exception 'invalid_voice_note' using errcode = 'P0001';
  end if;
  if items is null and p_voice_path is null then
    raise exception 'list_required' using errcode = 'P0001';
  end if;
  select * into o from public.create_sauda_order(
    p_address_id, p_category, coalesce(items, 'Voice note'), p_shop_preference, p_instructions, p_photo_paths);
  if p_voice_path is not null then
    update public.orders set voice_note_path = p_voice_path where id = o.id returning * into o;
  end if;
  return o;
end;
$$;

-- ===========================================================================
-- Substitution actions
-- ===========================================================================

-- Rider at the shop: ask the customer about an item (with an optional alternative, price and photo).
create or replace function public.request_substitution(
  p_order uuid,
  p_item text,
  p_suggestion text default null,
  p_price integer default null,
  p_photo_path text default null
)
returns public.order_substitutions
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  s public.order_substitutions;
begin
  select * into o from public.orders where id = p_order and rider_id = auth.uid();
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if o.status <> 'at_shop' then
    raise exception 'not_at_shop' using errcode = 'P0001';
  end if;
  if (select count(*) from public.order_substitutions where order_id = o.id) >= 10 then
    raise exception 'too_many_substitutions' using errcode = 'P0001';
  end if;
  if p_photo_path is not null
     and p_photo_path !~ ('^subs/' || o.id::text || '/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$') then
    raise exception 'invalid_photo' using errcode = 'P0001';
  end if;
  insert into public.order_substitutions (order_id, item, suggestion, price, photo_path)
  values (o.id, btrim(p_item), nullif(btrim(coalesce(p_suggestion, '')), ''), p_price, p_photo_path)
  returning * into s;
  perform public.enqueue_notification(o.customer_id, 'customer', 'substitution', o.id,
    jsonb_build_object('code', o.code, 'item', s.item, 'suggestion', s.suggestion));
  return s;
end;
$$;

-- Customer: approve or decline while the rider is still at the shop.
create or replace function public.answer_substitution(p_substitution uuid, p_approve boolean)
returns public.order_substitutions
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.order_substitutions;
  o public.orders;
begin
  select * into s from public.order_substitutions where id = p_substitution for update;
  if not found then
    raise exception 'substitution_not_found' using errcode = 'P0001';
  end if;
  select * into o from public.orders where id = s.order_id and customer_id = auth.uid();
  if not found then
    raise exception 'substitution_not_found' using errcode = 'P0001';
  end if;
  if s.status <> 'pending' or o.status <> 'at_shop' then
    raise exception 'substitution_closed' using errcode = 'P0001';
  end if;
  update public.order_substitutions
     set status = case when p_approve then 'approved'::public.substitution_status else 'declined'::public.substitution_status end,
         answered_at = now()
   where id = s.id
  returning * into s;
  perform public.enqueue_notification(o.rider_id, 'partner', 'substitution_answer', o.id,
    jsonb_build_object('code', o.code, 'item', s.item, 'approved', p_approve));
  return s;
end;
$$;

-- ===========================================================================
-- Rider location for the customer (while the order is active). The rider app sends it every 15 s.
-- ===========================================================================
create or replace function public.order_rider_location(p_order uuid)
returns table (latitude double precision, longitude double precision, seen_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.last_latitude, p.last_longitude, p.last_seen_at
    from public.orders o
    join public.partners p on p.id = o.rider_id
   where o.id = p_order
     and (o.customer_id = auth.uid() or public.is_admin())
     and o.status in ('accepted', 'at_shop', 'on_the_way')
     and p.last_latitude is not null;
$$;

-- ===========================================================================
-- What happens after an order is placed or changes status
-- ===========================================================================
create or replace function public.orders_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.offer_order_to_next_rider(new.id);
    return new;
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Order taken, cancelled or finished: close open offers.
  if old.status = 'requested' then
    update public.order_offers set status = 'withdrawn', answered_at = now()
     where order_id = new.id and status = 'offered';
  end if;

  -- Rider gave the order back: don't offer it to them again, and start offering it afresh.
  if old.status = 'accepted' and new.status = 'requested' then
    if old.rider_id is not null then
      insert into public.order_offers (order_id, rider_id, status, expires_at, answered_at)
      values (new.id, old.rider_id, 'declined', now(), now())
      on conflict (order_id, rider_id) do update set status = 'declined', answered_at = now();
    end if;
    update public.orders set dispatch_gave_up_at = null where id = new.id;
    perform public.offer_order_to_next_rider(new.id);
  end if;

  -- Rider left the shop: questions nobody answered are closed.
  if old.status = 'at_shop' then
    update public.order_substitutions set status = 'no_reply', answered_at = now()
     where order_id = new.id and status = 'pending';
  end if;

  -- Notifications
  if new.status in ('accepted', 'at_shop', 'on_the_way', 'delivered')
     or (new.status = 'cancelled' and new.cancelled_by is distinct from 'customer') then
    perform public.enqueue_notification(new.customer_id, 'customer', 'order_status', new.id,
      jsonb_build_object('code', new.code, 'status', new.status));
  end if;
  if new.status = 'accepted' and new.rider_id is not null and auth.uid() is distinct from new.rider_id then
    perform public.enqueue_notification(new.rider_id, 'partner', 'order_assigned', new.id,
      jsonb_build_object('code', new.code));
  end if;
  if new.status = 'cancelled' and old.rider_id is not null then
    perform public.enqueue_notification(old.rider_id, 'partner', 'order_cancelled', new.id,
      jsonb_build_object('code', new.code));
  end if;
  return new;
end;
$$;

drop trigger if exists orders_after_change on public.orders;
create trigger orders_after_change after insert or update of status on public.orders
  for each row execute function public.orders_after_change();

-- ===========================================================================
-- Storage: voice notes and substitution photos (separate policy names from slice 1)
--   order-media/<customer id>/voice-<random>.<ext>   voice note, uploaded by the customer
--   order-media/subs/<order id>/<random>.<ext>        substitution photo, uploaded by the rider
-- ===========================================================================
drop policy if exists "order extras: customer uploads voice note" on storage.objects;
create policy "order extras: customer uploads voice note" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'order-media'
    and name ~ ('^' || (select auth.uid())::text || '/voice-[A-Za-z0-9_-]{1,64}\.(m4a|mp4|aac|webm)$')
  );

drop policy if exists "order extras: rider uploads substitution photo" on storage.objects;
create policy "order extras: rider uploads substitution photo" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'order-media'
    and exists (
      select 1 from public.orders o
      where o.rider_id = (select auth.uid()) and o.status = 'at_shop'
        and name ~ ('^subs/' || o.id::text || '/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$')
    )
  );

-- The rider of an order (or a rider it is offered to) can play its voice note; both people on the
-- order can see substitution photos. A helper is needed because a rider with an offer can't read the order row.
create or replace function public.can_read_order_extra(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.voice_note_path = p_name
        and (o.rider_id = auth.uid() or o.customer_id = auth.uid()
             or exists (select 1 from public.order_offers f
                        where f.order_id = o.id and f.rider_id = auth.uid() and f.status = 'offered'))
    )
    or exists (
      select 1 from public.order_substitutions s
      join public.orders o on o.id = s.order_id
      where s.photo_path = p_name and (o.rider_id = auth.uid() or o.customer_id = auth.uid())
    );
$fn$;

revoke execute on function public.can_read_order_extra(text) from public, anon;
grant execute on function public.can_read_order_extra(text) to authenticated;

drop policy if exists "order extras: read" on storage.objects;
create policy "order extras: read" on storage.objects for select to authenticated
  using (bucket_id = 'order-media' and public.can_read_order_extra(name));

-- ===========================================================================
-- Live updates (Supabase Realtime) and the 10-second dispatch timer (pg_cron), when available
-- ===========================================================================
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['orders', 'order_substitutions', 'order_offers'] loop
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
    perform cron.schedule('homecare-dispatch', '10 seconds', 'select public.dispatch_pending()');
  end if;
exception when others then
  raise notice 'Automatic dispatch timer not set up (%). Offers still move on whenever a rider app checks in.', sqlerrm;
end;
$$;

-- ===========================================================================
-- Permissions
-- ===========================================================================
revoke execute on function public.enqueue_notification(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.offer_order_to_next_rider(uuid) from public, anon, authenticated;
revoke execute on function public.dispatch_pending() from public, anon, authenticated;
revoke execute on function public.orders_after_change() from public, anon, authenticated;
revoke execute on function public.register_push_token(text, text, text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
revoke execute on function public.my_offer() from public, anon;
revoke execute on function public.respond_offer(uuid, boolean) from public, anon;
revoke execute on function public.place_sauda_order(uuid, public.sauda_category, text, text, text, text[], text) from public, anon;
revoke execute on function public.request_substitution(uuid, text, text, integer, text) from public, anon;
revoke execute on function public.answer_substitution(uuid, boolean) from public, anon;
revoke execute on function public.order_rider_location(uuid) from public, anon;
grant execute on function public.register_push_token(text, text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
grant execute on function public.my_offer() to authenticated;
grant execute on function public.respond_offer(uuid, boolean) to authenticated;
grant execute on function public.place_sauda_order(uuid, public.sauda_category, text, text, text, text[], text) to authenticated;
grant execute on function public.request_substitution(uuid, text, text, integer, text) to authenticated;
grant execute on function public.answer_substitution(uuid, boolean) to authenticated;
grant execute on function public.order_rider_location(uuid) to authenticated;
