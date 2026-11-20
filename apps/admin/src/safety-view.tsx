import { useCallback, useEffect, useState } from 'react';

import type { Dispute, DisputeReason, DisputeStatus, SafetyAlert } from '@homecare/shared/db-types';

import { errorText } from './api';
import { supabase } from './supabase';

const REASON: Record<DisputeReason, string> = {
  wrong_items: 'Wrong or missing items',
  overcharged: 'Charged too much',
  poor_work: 'Work not done properly',
  damage: 'Something damaged',
  late_or_no_show: 'Late / no-show',
  behaviour: 'Rude or unprofessional',
  safety: 'Felt unsafe',
  other: 'Other',
};
const STATUS: Record<DisputeStatus, string> = { open: 'Open', in_review: 'In review', resolved: 'Resolved', rejected: 'Rejected' };
const when = (iso: string) => new Date(iso).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const REFRESH_MS = 15_000;

/** SOS alerts (newest first, open ones on top) and disputes. */
export function SafetyView() {
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [showClosed, setShowClosed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const [a, d] = await Promise.all([
        supabase.from('safety_alerts').select('*').order('created_at', { ascending: false }).limit(50),
        supabase
          .from('disputes')
          .select('*')
          .in('status', showClosed ? ['resolved', 'rejected'] : ['open', 'in_review'])
          .order('created_at', { ascending: false })
          .limit(100),
      ]);
      if (!active) return;
      if (a.error || d.error) setError(errorText(a.error ?? d.error));
      else {
        setError(null);
        setAlerts(a.data);
        setDisputes(d.data);
      }
    };
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [showClosed, reloadToken]);

  const open = alerts.filter((a) => a.status === 'open');
  const dispute = disputes.find((d) => d.id === selected) ?? null;

  return (
    <div className="split">
      <section className="list">
        <div className="list-header">
          <h2>Safety</h2>
          <button className="btn ghost small" onClick={reload}>
            Refresh
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}

        <h3>SOS alerts {open.length ? <span className="pill order-cancelled">{open.length} open</span> : null}</h3>
        {alerts.length === 0 ? <p className="muted small">No alerts.</p> : null}
        {alerts.slice(0, 15).map((a) => (
          <SosRow key={a.id} alert={a} onChanged={reload} />
        ))}

        <div className="list-header">
          <h3>Disputes</h3>
          <button className="btn ghost small" onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? 'Show open' : 'Show closed'}
          </button>
        </div>
        {disputes.length === 0 ? <p className="muted small">No disputes here.</p> : null}
        {disputes.map((d) => (
          <button key={d.id} className={`row ${d.id === selected ? 'selected' : ''}`} onClick={() => setSelected(d.id)}>
            <span className={`pill ${d.status === 'open' ? 'order-cancelled' : d.status === 'in_review' ? 'order-requested' : 'order-delivered'}`}>
              {STATUS[d.status]}
            </span>
            <span className="row-main">
              <strong>
                {d.code} · {REASON[d.reason]}
              </strong>
              <span className="muted small">
                From the {d.raised_role} · {d.details.slice(0, 60)}
                {d.details.length > 60 ? '…' : ''}
              </span>
            </span>
            <span className="muted small">{when(d.created_at)}</span>
          </button>
        ))}
      </section>
      <section className="detail">
        {dispute ? <DisputeDetail key={dispute.id} dispute={dispute} onChanged={reload} /> : <p className="muted">Select a dispute.</p>}
      </section>
    </div>
  );
}

function SosRow({ alert, onChanged }: { alert: SafetyAlert; onChanged: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolve = async () => {
    setBusy(true);
    const { error: e } = await supabase.rpc('resolve_sos', { p_alert: alert.id, p_note: note.trim() });
    setBusy(false);
    if (e) setError(errorText(e));
    else onChanged();
  };
  const map = alert.latitude != null && alert.longitude != null ? `https://www.google.com/maps/search/?api=1&query=${alert.latitude},${alert.longitude}` : null;
  return (
    <div className={`card ${alert.status === 'open' ? 'sos-open' : ''}`}>
      <p>
        <strong>{alert.status === 'open' ? '🚨 OPEN' : 'Resolved'}</strong> · {alert.role} · {when(alert.created_at)}
        {alert.order_id ? ' · on an order' : alert.job_id ? ' · on an ustaad job' : ''}
        {map ? (
          <>
            {' · '}
            <a href={map} target="_blank" rel="noreferrer">
              location
            </a>
          </>
        ) : null}
      </p>
      {alert.note ? <p>“{alert.note}”</p> : null}
      {alert.status === 'open' ? (
        <>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you do? (required to close)" />
          <button className="btn danger small" disabled={busy || !note.trim()} onClick={() => void resolve()}>
            Mark resolved
          </button>
        </>
      ) : (
        <p className="muted small">{alert.resolution_note}</p>
      )}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

function DisputeDetail({ dispute, onChanged }: { dispute: Dispute; onChanged: () => void }) {
  const [resolution, setResolution] = useState(dispute.resolution ?? '');
  const [adjustment, setAdjustment] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closed = dispute.status === 'resolved' || dispute.status === 'rejected';

  const update = async (status: DisputeStatus) => {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('update_dispute', {
      p_dispute: dispute.id,
      p_status: status,
      p_resolution: resolution.trim() || undefined,
      p_adjustment: Number(adjustment) || 0,
    });
    setBusy(false);
    if (e) setError(errorText(e));
    else onChanged();
  };

  return (
    <div className="stack">
      <h2>
        {dispute.code} <span className="pill order-requested">{STATUS[dispute.status]}</span>
      </h2>
      <dl className="facts">
        <dt>Reason</dt>
        <dd>{REASON[dispute.reason]}</dd>
        <dt>Raised by</dt>
        <dd>The {dispute.raised_role}</dd>
        <dt>About</dt>
        <dd>
          {dispute.order_id ? `Sauda Run order ${dispute.order_id.slice(0, 8)}` : `Ustaad job ${dispute.job_id?.slice(0, 8)}`} — open it in
          the Orders / Ustaad jobs tab for the chat, bill and history
        </dd>
        <dt>Details</dt>
        <dd style={{ whiteSpace: 'pre-wrap' }}>{dispute.details}</dd>
        <dt>Raised</dt>
        <dd>{when(dispute.created_at)}</dd>
        {closed ? (
          <>
            <dt>Outcome</dt>
            <dd>
              {dispute.resolution}
              {dispute.adjustment ? ` · adjustment Rs ${dispute.adjustment}` : ''}
            </dd>
          </>
        ) : null}
      </dl>
      {!closed ? (
        <>
          {dispute.status === 'open' ? (
            <button className="btn" disabled={busy} onClick={() => void update('in_review')}>
              Start review
            </button>
          ) : null}
          <h3>Close it</h3>
          <textarea
            className="input"
            rows={3}
            maxLength={1000}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            placeholder="What we decided (the person who raised it sees this)"
          />
          <label className="muted small">
            Money adjustment in Rs (positive = paid back to the customer, negative = charged)
            <input className="input" type="number" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} />
          </label>
          <div className="row-actions">
            <button className="btn primary" disabled={busy || !resolution.trim()} onClick={() => void update('resolved')}>
              Resolve
            </button>
            <button className="btn danger" disabled={busy || !resolution.trim()} onClick={() => void update('rejected')}>
              Reject
            </button>
          </div>
        </>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
