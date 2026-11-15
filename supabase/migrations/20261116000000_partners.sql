-- M3: partners (riders + ustaads), verification documents, online status, admins
-- Written to be safe to re-run (the dashboard SQL Editor script is the same statements).

-- ===========================================================================
-- Admins: people who can approve partners in the admin panel.
-- Add one in the SQL Editor:  insert into public.admins (user_id)
--   select id from auth.users where phone = '923001234567' on conflict do nothing;
-- ===========================================================================
create table if not exists public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
-- No client policies: the list is read only through is_admin().

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Admins can read every profile (names and phones of partners and customers).
drop policy if exists "profiles: admins read all" on public.profiles;
create policy "profiles: admins read all"
  on public.profiles for select
  to authenticated
  using ((select public.is_admin()));

-- ===========================================================================
-- Partners
-- ===========================================================================
do $$
begin
  create type public.partner_role as enum ('rider', 'ustaad');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.partner_status as enum ('draft', 'pending', 'approved', 'rejected', 'suspended');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.ustaad_trade as enum ('plumber', 'electrician', 'ac_technician', 'mechanic');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.vehicle_type as enum ('motorcycle', 'bicycle', 'car', 'rickshaw');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.payout_method as enum ('jazzcash', 'easypaisa');
exception when duplicate_object then null;
end;
$$;

create table if not exists public.partners (
  id               uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  role             public.partner_role not null,
  trades           public.ustaad_trade[] not null default '{}',
  cnic_number      text check (cnic_number is null or cnic_number ~ '^[0-9]{5}-[0-9]{7}-[0-9]$'),
  vehicle_type     public.vehicle_type,
  vehicle_number   text check (vehicle_number is null or char_length(btrim(vehicle_number)) between 2 and 20),
  payout_method    public.payout_method,
  payout_account   text check (payout_account is null or payout_account ~ '^03[0-9]{9}$'),
  status           public.partner_status not null default 'draft',
  status_reason    text check (status_reason is null or char_length(status_reason) <= 300),
  submitted_at     timestamptz,
  reviewed_at      timestamptz,
  reviewed_by      uuid references auth.users (id) on delete set null,
  is_online        boolean not null default false,
  last_latitude    double precision check (last_latitude is null or last_latitude between 23 and 38),
  last_longitude   double precision check (last_longitude is null or last_longitude between 60 and 78),
  last_location    extensions.geography(Point, 4326)
                     generated always as (
                       case when last_latitude is null or last_longitude is null then null
                       else extensions.st_setsrid(extensions.st_makepoint(last_longitude, last_latitude), 4326)::extensions.geography
                       end
                     ) stored,
  last_seen_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists partners_status_idx on public.partners (status);
create index if not exists partners_online_location_idx on public.partners using gist (last_location) where is_online;

alter table public.partners enable row level security;
revoke all on public.partners from anon, authenticated;
grant select on public.partners to authenticated;
-- Partners fill in their application; status, review and online fields change only through the functions below.
grant insert (role, trades, cnic_number, vehicle_type, vehicle_number, payout_method, payout_account)
  on public.partners to authenticated;
grant update (role, trades, cnic_number, vehicle_type, vehicle_number, payout_method, payout_account)
  on public.partners to authenticated;

drop policy if exists "partners: read own or admin" on public.partners;
create policy "partners: read own or admin" on public.partners for select to authenticated
  using ((select auth.uid()) = id or (select public.is_admin()));
drop policy if exists "partners: create own" on public.partners;
create policy "partners: create own" on public.partners for insert to authenticated
  with check ((select auth.uid()) = id);
drop policy if exists "partners: edit own application" on public.partners;
create policy "partners: edit own application" on public.partners for update to authenticated
  using ((select auth.uid()) = id and status in ('draft', 'rejected'))
  with check ((select auth.uid()) = id);

drop trigger if exists partners_set_updated_at on public.partners;
create trigger partners_set_updated_at
  before update on public.partners
  for each row execute function public.set_updated_at();

-- Can the signed-in partner still change their application (and its documents)?
create or replace function public.partner_can_edit()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.partners
    where id = auth.uid() and status in ('draft', 'rejected')
  );
$$;

revoke execute on function public.partner_can_edit() from public, anon;
grant execute on function public.partner_can_edit() to authenticated;

-- ===========================================================================
-- Verification documents: private bucket, one folder per partner:
--   partner-documents/<user id>/cnic_front.jpg | cnic_back.jpg | selfie.jpg
-- ===========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-documents', 'partner-documents', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "partner docs: read own or admin" on storage.objects;
create policy "partner docs: read own or admin" on storage.objects for select to authenticated
  using (
    bucket_id = 'partner-documents'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

drop policy if exists "partner docs: upload own" on storage.objects;
create policy "partner docs: upload own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'partner-documents'
    and name ~ ('^' || (select auth.uid())::text || '/(cnic_front|cnic_back|selfie)\.(jpg|jpeg|png|webp)$')
    and (select public.partner_can_edit())
  );

drop policy if exists "partner docs: replace own" on storage.objects;
create policy "partner docs: replace own" on storage.objects for update to authenticated
  using (
    bucket_id = 'partner-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.partner_can_edit())
  )
  with check (
    bucket_id = 'partner-documents'
    and name ~ ('^' || (select auth.uid())::text || '/(cnic_front|cnic_back|selfie)\.(jpg|jpeg|png|webp)$')
  );

drop policy if exists "partner docs: delete own" on storage.objects;
create policy "partner docs: delete own" on storage.objects for delete to authenticated
  using (
    bucket_id = 'partner-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.partner_can_edit())
  );

-- ===========================================================================
-- Actions (the only way status / online / location change)
-- ===========================================================================

-- Partner: send the application for review. Error 'application_incomplete' lists what's missing
-- in its DETAIL, e.g. "cnic_number,selfie".
create or replace function public.submit_partner_application()
returns public.partners
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.partners;
  missing text[] := '{}';
  doc text;
begin
  select * into p from public.partners where id = auth.uid() for update;
  if not found then
    raise exception 'partner_not_found' using errcode = 'P0001';
  end if;
  if p.status not in ('draft', 'rejected') then
    raise exception 'partner_not_editable' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = p.id and full_name is not null) then
    missing := array_append(missing, 'full_name');
  end if;
  if p.cnic_number is null then missing := array_append(missing, 'cnic_number'); end if;
  if p.payout_method is null or p.payout_account is null then missing := array_append(missing, 'payout'); end if;
  if p.role = 'rider' and (p.vehicle_type is null or (p.vehicle_type <> 'bicycle' and p.vehicle_number is null)) then
    missing := array_append(missing, 'vehicle');
  end if;
  if p.role = 'ustaad' and cardinality(p.trades) = 0 then missing := array_append(missing, 'trades'); end if;
  foreach doc in array array['cnic_front', 'cnic_back', 'selfie'] loop
    if not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'partner-documents' and o.name like p.id::text || '/' || doc || '.%'
    ) then
      missing := array_append(missing, doc);
    end if;
  end loop;

  if cardinality(missing) > 0 then
    raise exception 'application_incomplete' using errcode = 'P0001', detail = array_to_string(missing, ',');
  end if;

  update public.partners
     set status = 'pending', submitted_at = now(), status_reason = null
   where id = p.id
  returning * into p;
  return p;
end;
$$;

-- Partner: go online (needs a location) or offline. Only approved partners.
create or replace function public.set_partner_online(p_online boolean, lat double precision default null, lng double precision default null)
returns public.partners
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.partners;
begin
  if p_online and (lat is null or lng is null) then
    raise exception 'location_required' using errcode = 'P0001';
  end if;
  update public.partners
     set is_online = p_online,
         last_latitude = coalesce(lat, last_latitude),
         last_longitude = coalesce(lng, last_longitude),
         last_seen_at = now()
   where id = auth.uid() and status = 'approved'
  returning * into p;
  if not found then
    raise exception 'partner_not_approved' using errcode = 'P0001';
  end if;
  return p;
end;
$$;

-- Partner: location heartbeat while online (every 15–30 s). Error 'partner_offline' = stop sending.
create or replace function public.update_partner_location(lat double precision, lng double precision)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.partners
     set last_latitude = lat, last_longitude = lng, last_seen_at = now()
   where id = auth.uid() and status = 'approved' and is_online;
  if not found then
    raise exception 'partner_offline' using errcode = 'P0001';
  end if;
end;
$$;

-- Admin: approve / reject / suspend. A reason is required for reject and suspend.
create or replace function public.review_partner(p_partner uuid, p_decision public.partner_status, p_reason text default null)
returns public.partners
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.partners;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if p_decision not in ('approved', 'rejected', 'suspended') then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;
  if p_decision in ('rejected', 'suspended') and (p_reason is null or btrim(p_reason) = '') then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  select * into p from public.partners where id = p_partner for update;
  if not found then
    raise exception 'partner_not_found' using errcode = 'P0001';
  end if;
  -- pending -> approved | rejected;  approved -> suspended;  suspended -> approved
  if not (
    (p.status = 'pending' and p_decision in ('approved', 'rejected'))
    or (p.status = 'approved' and p_decision = 'suspended')
    or (p.status = 'suspended' and p_decision = 'approved')
  ) then
    raise exception 'invalid_transition' using errcode = 'P0001', detail = p.status::text || ' -> ' || p_decision::text;
  end if;

  update public.partners
     set status = p_decision,
         status_reason = case when p_decision = 'approved' then null else btrim(p_reason) end,
         reviewed_at = now(),
         reviewed_by = auth.uid(),
         is_online = case when p_decision = 'approved' then is_online else false end
   where id = p_partner
  returning * into p;
  return p;
end;
$$;

revoke execute on function public.submit_partner_application() from public, anon;
revoke execute on function public.set_partner_online(boolean, double precision, double precision) from public, anon;
revoke execute on function public.update_partner_location(double precision, double precision) from public, anon;
revoke execute on function public.review_partner(uuid, public.partner_status, text) from public, anon;
grant execute on function public.submit_partner_application() to authenticated;
grant execute on function public.set_partner_online(boolean, double precision, double precision) to authenticated;
grant execute on function public.update_partner_location(double precision, double precision) to authenticated;
grant execute on function public.review_partner(uuid, public.partner_status, text) to authenticated;
