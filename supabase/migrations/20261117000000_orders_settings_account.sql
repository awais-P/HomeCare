-- P4 (slice 1): business settings, Sauda Run orders, account deletion
-- Written to be safe to re-run (the dashboard SQL Editor script is the same statements).

-- ===========================================================================
-- Business settings (provisional answers to decisions D3–D8, editable by admins)
-- ===========================================================================
create table if not exists public.app_settings (
  key          text primary key,
  value        jsonb not null,
  description  text not null,
  updated_at   timestamptz not null default now()
);

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to authenticated;
grant update (value) on public.app_settings to authenticated;

drop policy if exists "settings: everyone signed in reads" on public.app_settings;
create policy "settings: everyone signed in reads" on public.app_settings for select to authenticated using (true);
drop policy if exists "settings: admins change" on public.app_settings;
create policy "settings: admins change" on public.app_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

insert into public.app_settings (key, value, description) values
  ('delivery_fee_bands', '[{"max_km": 3, "fee": 150}, {"max_km": 6, "fee": 250}, {"max_km": 10, "fee": 350}]',
   'D3 (provisional): Sauda Run delivery fee in PKR by distance from shop to home. Beyond the last band the last fee applies.'),
  ('rider_cash_limit', '5000',
   'D4 (provisional): most a rider pays at the shop (PKR). Bigger bills need the customer to pay the shop directly.'),
  ('commission_percent', '12',
   'D5 (provisional): HomeCare share of the delivery fee / labour, in percent.'),
  ('cancellation', '{"fee_after_accept": 50}',
   'D6 (provisional): free while searching for a rider; PKR fee after a rider accepts; after the rider reaches the shop only support can cancel.'),
  ('ustaad_visit_fee', '500',
   'D7 (provisional, Phase 5): ustaad visit fee in PKR, credited if the job goes ahead.'),
  ('come_now_surge_percent', '25',
   'D7 (provisional, Phase 5): extra percent on the visit fee for "come now" bookings.'),
  ('warranty_days', '7',
   'D8 (provisional, Phase 5): free revisit window for the same problem, labour only.'),
  ('dispatch_radius_km', '5',
   'Riders see open orders whose delivery point is within this distance of them.')
on conflict (key) do nothing;

create or replace function public.setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.app_settings where key = p_key;
$$;

revoke execute on function public.setting(text) from public, anon;
grant execute on function public.setting(text) to authenticated;

-- Fee for a distance, from the delivery_fee_bands setting.
create or replace function public.delivery_fee_for_km(p_km double precision)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with bands as (
    select (b ->> 'max_km')::double precision as max_km, (b ->> 'fee')::integer as fee
    from jsonb_array_elements(public.setting('delivery_fee_bands')) b
  )
  select coalesce(
    (select fee from bands where p_km <= max_km order by max_km limit 1),
    (select fee from bands order by max_km desc limit 1)
  );
$$;

revoke execute on function public.delivery_fee_for_km(double precision) from public, anon;
grant execute on function public.delivery_fee_for_km(double precision) to authenticated;

-- ===========================================================================
-- Sauda Run orders
-- ===========================================================================
do $$
begin
  create type public.order_status as enum ('requested', 'accepted', 'at_shop', 'on_the_way', 'delivered', 'cancelled');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.sauda_category as enum ('sabzi', 'grocery', 'meat', 'bakery', 'pharmacy', 'food', 'pick_drop', 'other');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.order_actor as enum ('customer', 'rider', 'admin');
exception when duplicate_object then null;
end;
$$;

create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique default ('HC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  customer_id         uuid references public.profiles (id) on delete set null,
  rider_id            uuid references public.partners (id) on delete set null,
  status              public.order_status not null default 'requested',
  category            public.sauda_category not null,
  items_text          text not null check (char_length(btrim(items_text)) between 2 and 2000),
  photo_paths         text[] not null default '{}' check (cardinality(photo_paths) <= 4),
  shop_preference     text check (shop_preference is null or char_length(shop_preference) <= 150),
  -- Delivery address, copied from the saved address when the order is placed.
  address_id          uuid references public.addresses (id) on delete set null,
  delivery_text       text not null,
  delivery_latitude   double precision not null,
  delivery_longitude  double precision not null,
  delivery_location   extensions.geography(Point, 4326)
                        generated always as (
                          extensions.st_setsrid(extensions.st_makepoint(delivery_longitude, delivery_latitude), 4326)::extensions.geography
                        ) stored,
  recipient_name      text,
  recipient_phone     text,
  instructions        text check (instructions is null or char_length(instructions) <= 300),
  zone_id             uuid references public.service_zones (id) on delete set null,
  -- Money (PKR)
  estimated_fee       integer not null,
  delivery_fee        integer,
  shop_distance_km    numeric(6, 2),
  item_cost           integer check (item_cost is null or item_cost >= 0),
  bill_photo_path     text,
  cash_collected      boolean not null default false,
  cancellation_fee    integer not null default 0,
  cancelled_by        public.order_actor,
  cancel_reason       text check (cancel_reason is null or char_length(cancel_reason) <= 300),
  rating              smallint check (rating is null or rating between 1 and 5),
  rating_comment      text check (rating_comment is null or char_length(rating_comment) <= 300),
  created_at          timestamptz not null default now(),
  accepted_at         timestamptz,
  at_shop_at          timestamptz,
  on_the_way_at       timestamptz,
  delivered_at        timestamptz,
  cancelled_at        timestamptz,
  updated_at          timestamptz not null default now()
);

create index if not exists orders_customer_idx on public.orders (customer_id, created_at desc);
create index if not exists orders_rider_idx on public.orders (rider_id, created_at desc);
create index if not exists orders_open_location_idx on public.orders using gist (delivery_location) where status = 'requested';

alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;
grant select on public.orders to authenticated;
-- No direct writes: every change goes through the functions below.

drop policy if exists "orders: customer, rider or admin reads" on public.orders;
create policy "orders: customer, rider or admin reads" on public.orders for select to authenticated
  using ((select auth.uid()) = customer_id or (select auth.uid()) = rider_id or (select public.is_admin()));

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

-- Every status change is logged.
create table if not exists public.order_events (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders (id) on delete cascade,
  actor_id     uuid,
  from_status  public.order_status,
  to_status    public.order_status not null,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists order_events_order_idx on public.order_events (order_id, created_at);

alter table public.order_events enable row level security;
revoke all on public.order_events from anon, authenticated;
grant select on public.order_events to authenticated;

drop policy if exists "order events: same people as the order" on public.order_events;
create policy "order events: same people as the order" on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

create or replace function public.log_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_events (order_id, actor_id, from_status, to_status, note)
    values (new.id, auth.uid(), case when tg_op = 'UPDATE' then old.status end, new.status,
            case when new.status = 'cancelled' then new.cancel_reason end);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_log_status on public.orders;
create trigger orders_log_status after insert or update of status on public.orders
  for each row execute function public.log_order_status();

-- ===========================================================================
-- Order photos (customer's list photos, rider's bill photo): private bucket
--   order-media/<customer id>/<file>     list photos, uploaded by the customer
--   order-media/bills/<order id>.<ext>   bill photo, uploaded by the assigned rider
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-media', 'order-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "order media: read" on storage.objects;
create policy "order media: read" on storage.objects for select to authenticated
  using (
    bucket_id = 'order-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
      or exists (
        select 1 from public.orders o
        where (o.rider_id = (select auth.uid()) or o.customer_id = (select auth.uid()))
          and (name = any (o.photo_paths) or name = o.bill_photo_path)
      )
    )
  );

drop policy if exists "order media: customer uploads list photos" on storage.objects;
create policy "order media: customer uploads list photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'order-media'
    and name ~ ('^' || (select auth.uid())::text || '/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$')
  );

drop policy if exists "order media: rider uploads bill" on storage.objects;
create policy "order media: rider uploads bill" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'order-media'
    and exists (
      select 1 from public.orders o
      where o.rider_id = (select auth.uid()) and o.status = 'at_shop'
        and name ~ ('^bills/' || o.id::text || '\.(jpg|jpeg|png|webp)$')
    )
  );

drop policy if exists "order media: rider replaces bill" on storage.objects;
create policy "order media: rider replaces bill" on storage.objects for update to authenticated
  using (
    bucket_id = 'order-media'
    and exists (
      select 1 from public.orders o
      where o.rider_id = (select auth.uid()) and o.status = 'at_shop'
        and name ~ ('^bills/' || o.id::text || '\.(jpg|jpeg|png|webp)$')
    )
  );

drop policy if exists "order media: customer deletes own" on storage.objects;
create policy "order media: customer deletes own" on storage.objects for delete to authenticated
  using (bucket_id = 'order-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ===========================================================================
-- Order actions
-- ===========================================================================

-- Customer: place a Sauda Run order to one of their saved addresses.
create or replace function public.create_sauda_order(
  p_address_id uuid,
  p_category public.sauda_category,
  p_items_text text,
  p_shop_preference text default null,
  p_instructions text default null,
  p_photo_paths text[] default '{}'
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.addresses;
  o public.orders;
  path text;
begin
  select * into a from public.addresses where id = p_address_id and user_id = auth.uid();
  if not found then
    raise exception 'address_not_found' using errcode = 'P0001';
  end if;
  if (select z.id from public.zone_at(a.latitude, a.longitude) z) is null then
    raise exception 'outside_service_area' using errcode = 'P0001';
  end if;
  if (select count(*) from public.orders where customer_id = auth.uid() and status in ('requested', 'accepted', 'at_shop', 'on_the_way')) >= 3 then
    raise exception 'too_many_active_orders' using errcode = 'P0001';
  end if;
  foreach path in array coalesce(p_photo_paths, '{}') loop
    if split_part(path, '/', 1) <> auth.uid()::text then
      raise exception 'invalid_photo' using errcode = 'P0001';
    end if;
  end loop;

  insert into public.orders (
    customer_id, category, items_text, photo_paths, shop_preference, address_id,
    delivery_text, delivery_latitude, delivery_longitude, recipient_name, recipient_phone,
    instructions, zone_id, estimated_fee
  ) values (
    auth.uid(), p_category, btrim(p_items_text), coalesce(p_photo_paths, '{}'), nullif(btrim(p_shop_preference), ''), a.id,
    concat_ws(', ', a.house, a.street, a.area, a.formatted_address), a.latitude, a.longitude, a.recipient_name, a.recipient_phone,
    coalesce(nullif(btrim(p_instructions), ''), a.instructions), a.zone_id,
    public.delivery_fee_for_km(0)
  )
  returning * into o;
  return o;
end;
$$;

-- Rider: open orders near them (approved + online only). Customer details are hidden until accepted.
create or replace function public.list_open_orders(lat double precision, lng double precision)
returns table (
  id uuid, code text, category public.sauda_category, items_text text, shop_preference text,
  area text, distance_km double precision, estimated_fee integer, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me extensions.geography;
  radius double precision := coalesce((public.setting('dispatch_radius_km'))::text::double precision, 5);
begin
  if not exists (select 1 from public.partners where id = auth.uid() and status = 'approved' and is_online and role = 'rider') then
    raise exception 'not_an_online_rider' using errcode = 'P0001';
  end if;
  me := extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography;
  return query
    select o.id, o.code, o.category, o.items_text, o.shop_preference,
           coalesce(ad.area, z.name) as area,
           round((extensions.st_distance(o.delivery_location, me) / 1000)::numeric, 1)::double precision as distance_km,
           o.estimated_fee, o.created_at
    from public.orders o
    left join public.addresses ad on ad.id = o.address_id
    left join public.service_zones z on z.id = o.zone_id
    where o.status = 'requested'
      and extensions.st_dwithin(o.delivery_location, me, radius * 1000)
    order by extensions.st_distance(o.delivery_location, me)
    limit 20;
end;
$$;

-- Rider: take an open order (first come, first served; one active order at a time).
create or replace function public.accept_order(p_order uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  if not exists (select 1 from public.partners where id = auth.uid() and status = 'approved' and is_online and role = 'rider') then
    raise exception 'not_an_online_rider' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.orders where rider_id = auth.uid() and status in ('accepted', 'at_shop', 'on_the_way')) then
    raise exception 'rider_busy' using errcode = 'P0001';
  end if;
  update public.orders set rider_id = auth.uid(), status = 'accepted', accepted_at = now()
   where id = p_order and status = 'requested'
  returning * into o;
  if not found then
    raise exception 'order_not_available' using errcode = 'P0001';
  end if;
  return o;
end;
$$;

-- Admin: give a waiting order to a specific approved rider (manual dispatch).
create or replace function public.assign_order(p_order uuid, p_rider uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.partners where id = p_rider and status = 'approved' and role = 'rider') then
    raise exception 'rider_not_approved' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.orders where rider_id = p_rider and status in ('accepted', 'at_shop', 'on_the_way')) then
    raise exception 'rider_busy' using errcode = 'P0001';
  end if;
  update public.orders set rider_id = p_rider, status = 'accepted', accepted_at = now()
   where id = p_order and status = 'requested'
  returning * into o;
  if not found then
    raise exception 'order_not_available' using errcode = 'P0001';
  end if;
  return o;
end;
$$;

-- Rider: move their order to the next step.
--   accepted   -> at_shop     (send location; the final delivery fee is set from shop-to-home distance)
--   at_shop    -> on_the_way  (item cost + bill photo required; item cost must be within the cash limit)
--   on_the_way -> delivered   (cash collected)
create or replace function public.advance_order(
  p_order uuid,
  p_next public.order_status,
  lat double precision default null,
  lng double precision default null,
  p_item_cost integer default null,
  p_bill_photo_path text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  km double precision;
  cash_limit integer := coalesce((public.setting('rider_cash_limit'))::text::integer, 5000);
begin
  select * into o from public.orders where id = p_order and rider_id = auth.uid() for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if o.status = 'accepted' and p_next = 'at_shop' then
    if lat is null or lng is null then
      raise exception 'location_required' using errcode = 'P0001';
    end if;
    km := extensions.st_distance(
      extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography, o.delivery_location) / 1000;
    update public.orders
       set status = 'at_shop', at_shop_at = now(), shop_distance_km = round(km::numeric, 2),
           delivery_fee = public.delivery_fee_for_km(km)
     where id = o.id returning * into o;
  elsif o.status = 'at_shop' and p_next = 'on_the_way' then
    if p_item_cost is null or p_bill_photo_path is null then
      raise exception 'bill_required' using errcode = 'P0001';
    end if;
    if p_item_cost > cash_limit then
      raise exception 'cash_limit_exceeded' using errcode = 'P0001', detail = cash_limit::text;
    end if;
    if p_bill_photo_path !~ ('^bills/' || o.id::text || '\.(jpg|jpeg|png|webp)$') then
      raise exception 'invalid_bill_photo' using errcode = 'P0001';
    end if;
    update public.orders
       set status = 'on_the_way', on_the_way_at = now(), item_cost = p_item_cost, bill_photo_path = p_bill_photo_path
     where id = o.id returning * into o;
  elsif o.status = 'on_the_way' and p_next = 'delivered' then
    update public.orders
       set status = 'delivered', delivered_at = now(), cash_collected = true
     where id = o.id returning * into o;
  else
    raise exception 'invalid_transition' using errcode = 'P0001', detail = o.status::text || ' -> ' || p_next::text;
  end if;
  return o;
end;
$$;

-- Cancel. Customer: free while 'requested'; fee after a rider accepts; not after the rider is at the shop.
-- Rider: before reaching the shop, the order goes back to 'requested' for someone else. Admin: anything not finished.
create or replace function public.cancel_order(p_order uuid, p_reason text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
  fee integer;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if o.status in ('delivered', 'cancelled') then
    raise exception 'order_finished' using errcode = 'P0001';
  end if;

  if public.is_admin() then
    if p_reason is null or btrim(p_reason) = '' then
      raise exception 'reason_required' using errcode = 'P0001';
    end if;
    update public.orders set status = 'cancelled', cancelled_at = now(), cancelled_by = 'admin', cancel_reason = btrim(p_reason)
     where id = o.id returning * into o;
  elsif o.customer_id = auth.uid() then
    if o.status in ('at_shop', 'on_the_way') then
      raise exception 'contact_support_to_cancel' using errcode = 'P0001';
    end if;
    fee := case when o.status = 'accepted' then coalesce((public.setting('cancellation') ->> 'fee_after_accept')::integer, 0) else 0 end;
    update public.orders set status = 'cancelled', cancelled_at = now(), cancelled_by = 'customer',
           cancellation_fee = fee, cancel_reason = nullif(btrim(coalesce(p_reason, '')), '')
     where id = o.id returning * into o;
  elsif o.rider_id = auth.uid() then
    if o.status <> 'accepted' then
      raise exception 'contact_support_to_cancel' using errcode = 'P0001';
    end if;
    -- Logged by the status trigger (accepted -> requested).
    update public.orders set status = 'requested', rider_id = null, accepted_at = null
     where id = o.id returning * into o;
  else
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  return o;
end;
$$;

-- Customer: rate a delivered order once.
create or replace function public.rate_order(p_order uuid, p_rating smallint, p_comment text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.orders;
begin
  update public.orders
     set rating = p_rating, rating_comment = nullif(btrim(coalesce(p_comment, '')), '')
   where id = p_order and customer_id = auth.uid() and status = 'delivered' and rating is null
  returning * into o;
  if not found then
    raise exception 'cannot_rate' using errcode = 'P0001';
  end if;
  return o;
end;
$$;

-- Customer ↔ rider contact for an order in progress: only the other person's name and phone,
-- only to the two people on the order, only while it is active (accepted … on the way).
create or replace function public.order_contact(p_order uuid)
returns table (name text, phone text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order;
  if not found or o.status not in ('accepted', 'at_shop', 'on_the_way') then
    return;
  end if;
  if o.customer_id = auth.uid() then
    return query select p.full_name, p.phone from public.profiles p where p.id = o.rider_id;
  elsif o.rider_id = auth.uid() then
    return query select coalesce(o.recipient_name, p.full_name), coalesce(o.recipient_phone, p.phone)
                 from public.profiles p where p.id = o.customer_id;
  end if;
end;
$$;

revoke execute on function public.order_contact(uuid) from public, anon;
grant execute on function public.order_contact(uuid) to authenticated;

-- ===========================================================================
-- Account deletion (Google Play requirement)
-- Apps first remove the user's own files through the Storage API, then call this.
-- Orders are kept for accounting with the person's details removed.
-- ===========================================================================
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.orders
             where (customer_id = me or rider_id = me) and status in ('accepted', 'at_shop', 'on_the_way')) then
    raise exception 'active_order' using errcode = 'P0001';
  end if;
  -- Orders still waiting for a rider are cancelled.
  update public.orders set status = 'cancelled', cancelled_at = now(), cancelled_by = 'customer', cancel_reason = 'Account deleted'
   where customer_id = me and status = 'requested';
  -- Keep finished orders, but without the person's address and contact details.
  update public.orders
     set delivery_text = 'Deleted account', recipient_name = null, recipient_phone = null, instructions = null,
         items_text = case when customer_id = me then 'Removed' else items_text end, photo_paths = '{}'
   where customer_id = me;
  delete from public.admins where user_id = me;
  -- Removes profile, addresses, waitlist entries and partner record (cascade).
  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.create_sauda_order(uuid, public.sauda_category, text, text, text, text[]) from public, anon;
revoke execute on function public.list_open_orders(double precision, double precision) from public, anon;
revoke execute on function public.accept_order(uuid) from public, anon;
revoke execute on function public.assign_order(uuid, uuid) from public, anon;
revoke execute on function public.advance_order(uuid, public.order_status, double precision, double precision, integer, text) from public, anon;
revoke execute on function public.cancel_order(uuid, text) from public, anon;
revoke execute on function public.rate_order(uuid, smallint, text) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.create_sauda_order(uuid, public.sauda_category, text, text, text, text[]) to authenticated;
grant execute on function public.list_open_orders(double precision, double precision) to authenticated;
grant execute on function public.accept_order(uuid) to authenticated;
grant execute on function public.assign_order(uuid, uuid) to authenticated;
grant execute on function public.advance_order(uuid, public.order_status, double precision, double precision, integer, text) to authenticated;
grant execute on function public.cancel_order(uuid, text) to authenticated;
grant execute on function public.rate_order(uuid, smallint, text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
