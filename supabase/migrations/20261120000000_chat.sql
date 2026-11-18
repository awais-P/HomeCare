-- P6: in-app chat per Sauda Run order or Ustaad booking
--   The customer and the assigned rider/ustaad can message each other while the order or job is
--   active; admins can read every chat and write into it (support). New messages are pushed to the
--   other person and arrive live (Realtime).
-- Written to be safe to re-run (the dashboard SQL Editor script is the same statements).
-- Needs P4 slice 2 (enqueue_notification) and P5 (ustaad_jobs) first.

create table if not exists public.chat_messages (
  id           bigint generated always as identity primary key,
  order_id     uuid references public.orders (id) on delete cascade,
  job_id       uuid references public.ustaad_jobs (id) on delete cascade,
  sender_id    uuid references auth.users (id) on delete set null,
  sender_role  text not null check (sender_role in ('customer', 'partner', 'admin')),
  body         text not null check (char_length(btrim(body)) between 1 and 500),
  created_at   timestamptz not null default now(),
  read_at      timestamptz,
  constraint chat_messages_one_thread check (num_nonnulls(order_id, job_id) = 1)
);

create index if not exists chat_messages_order_idx on public.chat_messages (order_id, id) where order_id is not null;
create index if not exists chat_messages_job_idx on public.chat_messages (job_id, id) where job_id is not null;

alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;
grant select on public.chat_messages to authenticated;
-- No direct writes: send_chat_message() and mark_chat_read() only.

-- Visible to whoever can see the order or job (customer, assigned rider/ustaad, admins).
drop policy if exists "chat: same people as the order or job" on public.chat_messages;
create policy "chat: same people as the order or job" on public.chat_messages for select to authenticated
  using (
    (order_id is not null and exists (select 1 from public.orders o where o.id = order_id))
    or (job_id is not null and exists (select 1 from public.ustaad_jobs j where j.id = job_id))
  );

-- Who the caller is in a thread ('customer', 'partner', 'admin' or null), whether the thread is
-- open for new messages, and who the other two people are.
create or replace function public.chat_thread(p_order uuid, p_job uuid)
returns table (role text, is_open boolean, customer_id uuid, partner_id uuid, code text)
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
      case when o.customer_id = me then 'customer' when o.rider_id = me then 'partner' when public.is_admin() then 'admin' end,
      o.status in ('accepted', 'at_shop', 'on_the_way'), o.customer_id, o.rider_id, o.code;
  elsif p_job is not null then
    select * into j from public.ustaad_jobs where id = p_job;
    if not found then return; end if;
    return query select
      case when j.customer_id = me then 'customer' when j.ustaad_id = me then 'partner' when public.is_admin() then 'admin' end,
      j.status in ('accepted', 'on_the_way', 'arrived', 'quoted', 'in_progress'), j.customer_id, j.ustaad_id, j.code;
  end if;
end;
$$;

create or replace function public.send_chat_message(p_body text, p_order uuid default null, p_job uuid default null)
returns public.chat_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  m public.chat_messages;
  preview text;
begin
  if num_nonnulls(p_order, p_job) <> 1 then
    raise exception 'one_thread_required' using errcode = 'P0001';
  end if;
  select * into t from public.chat_thread(p_order, p_job);
  if not found or t.role is null then
    raise exception 'chat_not_found' using errcode = 'P0001';
  end if;
  if not t.is_open and t.role <> 'admin' then
    raise exception 'chat_closed' using errcode = 'P0001';
  end if;
  if p_body is null or char_length(btrim(p_body)) = 0 then
    raise exception 'empty_message' using errcode = 'P0001';
  end if;
  if (select count(*) from public.chat_messages where sender_id = auth.uid() and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'slow_down' using errcode = 'P0001';
  end if;

  insert into public.chat_messages (order_id, job_id, sender_id, sender_role, body)
  values (p_order, p_job, auth.uid(), t.role, btrim(p_body))
  returning * into m;

  preview := left(m.body, 80);
  -- Tell the other person (both, when support writes).
  if t.role <> 'customer' then
    perform public.enqueue_notification(t.customer_id, 'customer', 'chat_message', p_order,
      jsonb_build_object('code', t.code, 'preview', preview, 'from', t.role, 'job_id', p_job));
  end if;
  if t.role <> 'partner' then
    perform public.enqueue_notification(t.partner_id, 'partner', 'chat_message', p_order,
      jsonb_build_object('code', t.code, 'preview', preview, 'from', t.role, 'job_id', p_job));
  end if;
  return m;
end;
$$;

-- Marks the other side's messages as read. Returns how many changed.
create or replace function public.mark_chat_read(p_order uuid default null, p_job uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  n integer;
begin
  select * into t from public.chat_thread(p_order, p_job);
  if not found or t.role is null or t.role = 'admin' then
    return 0;
  end if;
  update public.chat_messages
     set read_at = now()
   where read_at is null
     and sender_id is distinct from auth.uid()
     and ((p_order is not null and order_id = p_order) or (p_job is not null and job_id = p_job));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Account deletion: the person's messages stay in the thread, without their words.
create or replace function public.profiles_before_delete_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.chat_messages set body = '(deleted)' where sender_id = old.id;
  return old;
end;
$$;

drop trigger if exists profiles_before_delete_chat on public.profiles;
create trigger profiles_before_delete_chat before delete on public.profiles
  for each row execute function public.profiles_before_delete_chat();

-- Live updates
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.chat_messages;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;

revoke execute on function public.chat_thread(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.profiles_before_delete_chat() from public, anon, authenticated;
revoke execute on function public.send_chat_message(text, uuid, uuid) from public, anon;
revoke execute on function public.mark_chat_read(uuid, uuid) from public, anon;
grant execute on function public.send_chat_message(text, uuid, uuid) to authenticated;
grant execute on function public.mark_chat_read(uuid, uuid) to authenticated;
