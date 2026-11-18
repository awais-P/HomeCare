import { useCallback, useEffect, useState } from 'react';

import type { JobEvent, JobOffer, JobStatus, UstaadJob, UstaadTrade } from '@homecare/shared/db-types';
import { formatE164ForDisplay } from '@homecare/shared/phone';

import { errorText } from './api';
import { ChatPanel } from './chat-panel';
import { supabase } from './supabase';

type JobRow = UstaadJob & {
  customer: { full_name: string | null; phone: string | null } | null;
  ustaad: { id: string; profiles: { full_name: string | null; phone: string | null } | null } | null;
};
type UstaadOption = { id: string; is_online: boolean; trades: UstaadTrade[]; profiles: { full_name: string | null } | null };
type OfferRow = JobOffer & { partners: { profiles: { full_name: string | null } | null } | null };

const STATUS_LABEL: Record<JobStatus, string> = {
  requested: 'Finding an ustaad',
  accepted: 'Ustaad confirmed',
  on_the_way: 'On the way',
  arrived: 'Arrived',
  quoted: 'Price sent',
  in_progress: 'Working',
  completed: 'Completed',
  visit_only: 'Visit only',
  cancelled: 'Cancelled',
};
const TRADE_LABEL: Record<UstaadTrade, string> = {
  plumber: 'Plumber',
  electrician: 'Electrician',
  ac_technician: 'AC technician',
  mechanic: 'Mechanic',
};
const OFFER_LABEL: Record<JobOffer['status'], string> = {
  offered: 'Offered now',
  accepted: 'Accepted',
  declined: 'Skipped',
  expired: 'No answer',
  withdrawn: 'Closed',
};
const OPEN: JobStatus[] = ['requested', 'accepted', 'on_the_way', 'arrived', 'quoted', 'in_progress'];
const FILTERS: { id: string; label: string; statuses: JobStatus[] }[] = [
  { id: 'open', label: 'Open', statuses: OPEN },
  { id: 'waiting', label: 'Waiting for ustaad', statuses: ['requested'] },
  { id: 'needs', label: 'Needs an ustaad', statuses: ['requested'] },
  { id: 'done', label: 'Finished', statuses: ['completed', 'visit_only', 'cancelled'] },
];
const REFRESH_MS = 15_000;
const rs = (n: number | null | undefined) => (n == null ? '—' : `Rs ${n.toLocaleString('en-PK')}`);
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-PK', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
// The pill colours reuse the order classes.
const pillClass = (s: JobStatus) =>
  s === 'cancelled' ? 'order-cancelled' : s === 'completed' || s === 'visit_only' ? 'order-delivered' : s === 'requested' ? 'order-requested' : 'order-on_the_way';

/** Ustaad bookings: list, details, assign an ustaad, cancel. */
export function JobsView() {
  const [filter, setFilter] = useState(FILTERS[0]);
  const [rows, setRows] = useState<JobRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error: e } = await supabase
        .from('ustaad_jobs')
        .select('*, customer:profiles!ustaad_jobs_customer_id_fkey(full_name, phone), ustaad:partners!ustaad_jobs_ustaad_id_fkey(id, profiles(full_name, phone))')
        .in('status', filter.statuses)
        .order('created_at', { ascending: false })
        .limit(100);
      if (!active) return;
      const list = (data as unknown as JobRow[] | null) ?? [];
      if (e) setError(errorText(e));
      else {
        setError(null);
        setRows(filter.id === 'needs' ? list.filter((j) => j.dispatch_gave_up_at) : list);
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
          <h2>Ustaad jobs</h2>
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
          Updates every 15 s. New jobs are offered to the nearest free ustaad with the trade (a favourite ustaad first); &quot;Needs an
          ustaad&quot; means those offers ran out.
        </p>
        {error ? <p className="error">{error}</p> : null}
        {rows.length === 0 && !error ? <p className="muted">No jobs here.</p> : null}
        {rows.map((j) => (
          <button key={j.id} className={`row ${j.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(j.id)}>
            <span className={`pill ${pillClass(j.status)}`}>{STATUS_LABEL[j.status]}</span>
            {j.status === 'requested' && j.dispatch_gave_up_at ? <span className="pill order-cancelled">Needs an ustaad</span> : null}
            <span className="row-main">
              <strong>
                {j.code} · {TRADE_LABEL[j.trade]}
                {j.is_warranty ? ' · warranty' : ''}
              </strong>
              <span className="muted small">
                {j.timing === 'scheduled' && j.scheduled_for ? `${when(j.scheduled_for)} · ` : 'Come now · '}
                {j.problem_text.slice(0, 50)}
                {j.problem_text.length > 50 ? '…' : ''}
              </span>
            </span>
            <span className="muted small">{new Date(j.created_at).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' })}</span>
          </button>
        ))}
      </section>
      <section className="detail">
        {selected ? <JobDetail key={selected.id} job={selected} onChanged={reload} /> : <p className="muted">Select a job.</p>}
      </section>
    </div>
  );
}

function JobDetail({ job, onChanged }: { job: JobRow; onChanged: () => void }) {
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [ustaads, setUstaads] = useState<UstaadOption[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [ustaadId, setUstaadId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('job_events')
      .select('*')
      .eq('job_id', job.id)
      .order('id')
      .then(({ data }) => {
        if (active) setEvents(data ?? []);
      });
    supabase
      .from('job_offers')
      .select('*, partners(profiles(full_name))')
      .eq('job_id', job.id)
      .order('offered_at')
      .then(({ data }) => {
        if (active) setOffers((data as unknown as OfferRow[]) ?? []);
      });
    if (job.photo_paths.length) {
      supabase.storage
        .from('order-media')
        .createSignedUrls(job.photo_paths, 600)
        .then(({ data }) => {
          if (active) setPhotos((data ?? []).flatMap((p) => (p.signedUrl ? [p.signedUrl] : [])));
        });
    }
    if (job.status === 'requested') {
      supabase
        .from('partners')
        .select('id, is_online, trades, profiles(full_name)')
        .eq('status', 'approved')
        .eq('role', 'ustaad')
        .contains('trades', [job.trade])
        .order('is_online', { ascending: false })
        .then(({ data }) => {
          if (active) setUstaads((data as unknown as UstaadOption[]) ?? []);
        });
    }
    return () => {
      active = false;
    };
  }, [job.id, job.status, job.trade, job.photo_paths, job.updated_at]);

  const act = async (fn: () => PromiseLike<{ error: unknown }>) => {
    setBusy(true);
    setError(null);
    const { error: e } = await fn();
    setBusy(false);
    if (e) setError(errorText(e));
    else onChanged();
  };

  const open = OPEN.includes(job.status);
  const customerPhone = job.recipient_phone ?? job.customer?.phone ?? null;

  return (
    <div className="stack">
      <h2>
        {job.code} <span className={`pill ${pillClass(job.status)}`}>{STATUS_LABEL[job.status]}</span>
      </h2>
      <dl className="facts">
        <dt>Trade</dt>
        <dd>
          {TRADE_LABEL[job.trade]}
          {job.is_warranty ? ' · warranty revisit (labour free)' : ''}
        </dd>
        <dt>When</dt>
        <dd>{job.timing === 'scheduled' && job.scheduled_for ? when(job.scheduled_for) : 'Come now'}</dd>
        <dt>Customer</dt>
        <dd>
          {job.recipient_name ?? job.customer?.full_name ?? '—'}
          {customerPhone ? ` · ${formatE164ForDisplay(customerPhone)}` : ''}
        </dd>
        <dt>Address</dt>
        <dd>{job.address_text}</dd>
        <dt>Problem</dt>
        <dd style={{ whiteSpace: 'pre-wrap' }}>{job.problem_text}</dd>
        <dt>Ustaad</dt>
        <dd>
          {job.ustaad
            ? `${job.ustaad.profiles?.full_name ?? 'Ustaad'}${job.ustaad.profiles?.phone ? ` · ${formatE164ForDisplay(job.ustaad.profiles.phone)}` : ''}`
            : '—'}
        </dd>
        <dt>Visit fee</dt>
        <dd>
          {rs(job.visit_fee)}
          {job.surge_percent ? ` (incl. ${job.surge_percent}% come-now)` : ''}
        </dd>
        <dt>Quote</dt>
        <dd>
          {job.labour_cost != null ? `Labour ${rs(job.labour_cost)} · parts ${rs(job.parts_cost)}` : '—'}
          {job.quote_note ? ` — ${job.quote_note}` : ''}
        </dd>
        <dt>Paid</dt>
        <dd>
          <strong>{rs(job.amount_due)}</strong>
          {job.cancellation_fee ? ` · cancellation fee ${rs(job.cancellation_fee)}` : ''}
          {job.warranty_until ? ` · warranty until ${new Date(job.warranty_until).toLocaleDateString('en-PK')}` : ''}
        </dd>
        {job.rating ? (
          <>
            <dt>Rating</dt>
            <dd>
              {'★'.repeat(job.rating)} {job.rating_comment ?? ''}
            </dd>
          </>
        ) : null}
      </dl>

      {photos.length ? (
        <div className="doc-grid">
          {photos.map((src) => (
            <a key={src} href={src} target="_blank" rel="noreferrer">
              <img src={src} alt="Problem" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8 }} />
            </a>
          ))}
        </div>
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
                {o.partners?.profiles?.full_name ?? 'Ustaad'}
                {o.distance_km != null ? ` · ${o.distance_km} km` : ''} <span className="muted">— {OFFER_LABEL[o.status]}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <ChatPanel kind="job" id={job.id} />

      <h3>History</h3>
      <ul className="timeline">
        {events.map((e) => (
          <li key={e.id}>
            <span className="muted small">{when(e.created_at)}</span> {STATUS_LABEL[e.to_status]}
            {e.note ? <span className="muted"> — {e.note}</span> : null}
          </li>
        ))}
      </ul>

      {job.status === 'requested' ? (
        <>
          <h3>Assign an ustaad</h3>
          <select className="input" value={ustaadId} onChange={(e) => setUstaadId(e.target.value)}>
            <option value="">Choose an approved {TRADE_LABEL[job.trade].toLowerCase()}…</option>
            {ustaads.map((u) => (
              <option key={u.id} value={u.id}>
                {u.profiles?.full_name ?? 'Ustaad'} {u.is_online ? '(online)' : '(offline)'}
              </option>
            ))}
          </select>
          <button className="btn primary" disabled={!ustaadId || busy} onClick={() => void act(() => supabase.rpc('assign_job', { p_job: job.id, p_ustaad: ustaadId }))}>
            Assign
          </button>
        </>
      ) : null}

      {open ? (
        <>
          <h3>Cancel job</h3>
          <textarea className="input" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (the customer sees it)" />
          <button className="btn danger" disabled={busy || !reason.trim()} onClick={() => void act(() => supabase.rpc('cancel_job', { p_job: job.id, p_reason: reason.trim() }))}>
            Cancel job
          </button>
        </>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
