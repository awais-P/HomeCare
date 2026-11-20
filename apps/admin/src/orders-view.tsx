import { useCallback, useEffect, useState } from 'react';

import type { Offer, Order, OrderEvent, OrderStatus, Substitution } from '@homecare/shared/db-types';
import { formatE164ForDisplay } from '@homecare/shared/phone';

import { errorText } from './api';
import { ChatPanel } from './chat-panel';
import { supabase } from './supabase';

type OrderRow = Order & {
  customer: { full_name: string | null; phone: string | null } | null;
  rider: { id: string; is_online: boolean; profiles: { full_name: string | null; phone: string | null } | null } | null;
};
type RiderOption = { id: string; is_online: boolean; profiles: { full_name: string | null } | null };

const STATUS_LABEL: Record<OrderStatus, string> = {
  requested: 'Finding a rider',
  accepted: 'Rider going to shop',
  at_shop: 'At the shop',
  on_the_way: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
const FILTERS: { id: string; label: string; statuses: OrderStatus[] }[] = [
  { id: 'open', label: 'Open', statuses: ['requested', 'accepted', 'at_shop', 'on_the_way'] },
  { id: 'waiting', label: 'Waiting for rider', statuses: ['requested'] },
  { id: 'needs', label: 'Needs a rider', statuses: ['requested'] },
  { id: 'done', label: 'Finished', statuses: ['delivered', 'cancelled'] },
];
const REFRESH_MS = 15_000;
const OFFER_LABEL: Record<Offer['status'], string> = {
  offered: 'Offered now',
  accepted: 'Accepted',
  declined: 'Skipped',
  expired: 'No answer',
  withdrawn: 'Closed',
};
const SUB_LABEL: Record<Substitution['status'], string> = {
  pending: 'Waiting',
  approved: 'Yes',
  declined: 'No',
  no_reply: 'No answer',
};
type OfferRow = Offer & { partners: { profiles: { full_name: string | null } | null } | null };
const rs = (n: number | null | undefined) => (n == null ? '—' : `Rs ${n.toLocaleString('en-PK')}`);

export function OrdersView() {
  const [filter, setFilter] = useState(FILTERS[0]);
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error: e } = await supabase
        .from('orders')
        .select('*, customer:profiles!orders_customer_id_fkey(full_name, phone), rider:partners!orders_rider_id_fkey(id, is_online, profiles(full_name, phone))')
        .in('status', filter.statuses)
        .order('created_at', { ascending: false })
        .limit(100);
      if (!active) return;
      const list = (data as unknown as OrderRow[] | null) ?? [];
      if (e) setError(errorText(e));
      else {
        setError(null);
        setRows(filter.id === 'needs' ? list.filter((o) => o.dispatch_gave_up_at) : list);
      }
    };
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [filter, reloadToken]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="split">
      <section className="list">
        <div className="list-header">
          <h2>Orders</h2>
          <button className="btn ghost small" onClick={reload}>
            Refresh
          </button>
        </div>
        <div className="tabs">
          {FILTERS.map((f) => (
            <button key={f.id} className={`tab ${f.id === filter.id ? 'active' : ''}`} onClick={() => setFilter(f)}>
              {f.label}
            </button>
          ))}
        </div>
        <p className="muted small">
          Updates every 15 s. New orders are offered to the nearest free rider automatically; &quot;Needs a rider&quot; means those offers ran out.
        </p>
        {error ? <p className="error">{error}</p> : null}
        {rows.length === 0 && !error ? <p className="muted">No orders here.</p> : null}
        {rows.map((o) => (
          <button key={o.id} className={`row ${o.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(o.id)}>
            <span className={`pill order-${o.status}`}>{STATUS_LABEL[o.status]}</span>
            {o.status === 'requested' && o.dispatch_gave_up_at ? <span className="pill order-cancelled">Needs a rider</span> : null}
            <span className="row-main">
              <strong>
                {o.code} · {o.category.replace('_', ' ')}
              </strong>
              <span className="muted small">
                {o.items_text.slice(0, 60)}
                {o.items_text.length > 60 ? '…' : ''}
              </span>
            </span>
            <span className="muted small">{new Date(o.created_at).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' })}</span>
          </button>
        ))}
      </section>
      <section className="detail">
        {selected ? <OrderDetail key={selected.id} order={selected} onChanged={reload} /> : <p className="muted">Select an order.</p>}
      </section>
    </div>
  );
}

function OrderDetail({ order, onChanged }: { order: OrderRow; onChanged: () => void }) {
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [subs, setSubs] = useState<Substitution[]>([]);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [riders, setRiders] = useState<RiderOption[]>([]);
  const [riderId, setRiderId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('order_events')
      .select('*')
      .eq('order_id', order.id)
      .order('id')
      .then(({ data }) => {
        if (active) setEvents(data ?? []);
      });
    supabase
      .from('order_offers')
      .select('*, partners(profiles(full_name))')
      .eq('order_id', order.id)
      .order('offered_at')
      .then(({ data }) => {
        if (active) setOffers((data as unknown as OfferRow[]) ?? []);
      });
    supabase
      .from('order_substitutions')
      .select('*')
      .eq('order_id', order.id)
      .order('created_at')
      .then(({ data }) => {
        if (active) setSubs(data ?? []);
      });
    if (order.voice_note_path) {
      supabase.storage
        .from('order-media')
        .createSignedUrl(order.voice_note_path, 600)
        .then(({ data }) => {
          if (active) setVoiceUrl(data?.signedUrl ?? null);
        });
    }
    if (order.status === 'requested') {
      supabase
        .from('partners')
        .select('id, is_online, profiles(full_name)')
        .eq('status', 'approved')
        .eq('role', 'rider')
        .order('is_online', { ascending: false })
        .then(({ data }) => {
          if (active) setRiders((data as unknown as RiderOption[]) ?? []);
        });
    }
    return () => {
      active = false;
    };
  }, [order.id, order.status, order.voice_note_path, order.updated_at]);

  const act = async (fn: () => PromiseLike<{ error: unknown }>) => {
    setBusy(true);
    setError(null);
    const { error: e } = await fn();
    setBusy(false);
    if (e) setError(errorText(e));
    else onChanged();
  };

  const total = order.item_cost != null && order.delivery_fee != null ? order.item_cost + order.delivery_fee : null;
  const open = order.status !== 'delivered' && order.status !== 'cancelled';

  return (
    <div className="stack">
      <h2>
        {order.code} <span className={`pill order-${order.status}`}>{STATUS_LABEL[order.status]}</span>
      </h2>
      <dl className="facts">
        <dt>Customer</dt>
        <dd>
          {order.recipient_name ?? order.customer?.full_name ?? '—'}
          {order.recipient_phone || order.customer?.phone ? ` · ${formatE164ForDisplay(order.recipient_phone ?? order.customer?.phone ?? '')}` : ''}
        </dd>
        <dt>Deliver to</dt>
        <dd>{order.delivery_text}</dd>
        <dt>Items</dt>
        <dd style={{ whiteSpace: 'pre-wrap' }}>
          {order.items_text}
          {voiceUrl ? (
            <>
              <br />
              <audio controls src={voiceUrl} preload="none" />
            </>
          ) : null}
        </dd>
        <dt>Shop</dt>
        <dd>{order.shop_preference ?? 'Nearest'}</dd>
        <dt>Rider</dt>
        <dd>{order.rider ? `${order.rider.profiles?.full_name ?? 'Rider'}${order.rider.profiles?.phone ? ` · ${formatE164ForDisplay(order.rider.profiles.phone)}` : ''}` : '—'}</dd>
        <dt>Fee</dt>
        <dd>
          {order.delivery_fee != null ? rs(order.delivery_fee) : `${rs(order.estimated_fee)} (estimate)`}
          {order.shop_distance_km != null ? ` · ${order.shop_distance_km} km shop → home` : ''}
        </dd>
        <dt>Bill</dt>
        <dd>{rs(order.item_cost)}</dd>
        <dt>Total</dt>
        <dd>
          <strong>{rs(total)}</strong>
          {order.cancellation_fee ? ` · cancellation fee ${rs(order.cancellation_fee)}` : ''}
        </dd>
        {order.rating ? (
          <>
            <dt>Rating</dt>
            <dd>
              {'★'.repeat(order.rating)} {order.rating_comment ?? ''}{' '}
              <button
                className="btn ghost small"
                onClick={() => {
                  const reason = window.prompt('Why remove this rating? (kept for the record)');
                  if (reason?.trim()) void act(() => supabase.rpc('remove_rating', { p_reason: reason.trim(), p_order: order.id }));
                }}>
                Remove rating
              </button>
            </dd>
          </>
        ) : order.removed_rating ? (
          <>
            <dt>Rating</dt>
            <dd className="muted">
              Removed ({order.removed_rating}★): {order.rating_removed_reason}
            </dd>
          </>
        ) : null}
      </dl>

      {subs.length ? (
        <>
          <h3>Questions to the customer</h3>
          <ul className="timeline">
            {subs.map((s) => (
              <li key={s.id}>
                {s.item} → {s.suggestion ?? 'skip it'}
                {s.price != null ? ` (${rs(s.price)})` : ''} <span className="muted">— {SUB_LABEL[s.status]}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {offers.length ? (
        <>
          <h3>Automatic offers</h3>
          <ul className="timeline">
            {offers.map((o) => (
              <li key={o.id}>
                <span className="muted small">
                  {new Date(o.offered_at).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                </span>{' '}
                {o.partners?.profiles?.full_name ?? 'Rider'}
                {o.distance_km != null ? ` · ${o.distance_km} km` : ''} <span className="muted">— {OFFER_LABEL[o.status]}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <ChatPanel kind="order" id={order.id} />

      <h3>History</h3>
      <ul className="timeline">
        {events.map((e) => (
          <li key={e.id}>
            <span className="muted small">{new Date(e.created_at).toLocaleString('en-PK', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}</span>{' '}
            {STATUS_LABEL[e.to_status]}
            {e.note ? <span className="muted"> — {e.note}</span> : null}
          </li>
        ))}
      </ul>

      {order.status === 'requested' ? (
        <>
          <h3>Assign a rider</h3>
          <select className="input" value={riderId} onChange={(e) => setRiderId(e.target.value)}>
            <option value="">Choose an approved rider…</option>
            {riders.map((r) => (
              <option key={r.id} value={r.id}>
                {r.profiles?.full_name ?? 'Rider'} {r.is_online ? '(online)' : '(offline)'}
              </option>
            ))}
          </select>
          <button className="btn primary" disabled={!riderId || busy} onClick={() => void act(() => supabase.rpc('assign_order', { p_order: order.id, p_rider: riderId }))}>
            Assign
          </button>
        </>
      ) : null}

      {open ? (
        <>
          <h3>Cancel order</h3>
          <textarea className="input" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (the customer sees it)" />
          <button className="btn danger" disabled={busy || !reason.trim()} onClick={() => void act(() => supabase.rpc('cancel_order', { p_order: order.id, p_reason: reason.trim() }))}>
            Cancel order
          </button>
        </>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
