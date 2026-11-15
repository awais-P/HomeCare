import { useCallback, useEffect, useState } from 'react';

import type { PartnerStatus } from '@homecare/shared/db-types';
import { formatE164ForDisplay } from '@homecare/shared/phone';

import { DOCUMENT_KINDS, documentUrls, errorText, listPartners, reviewPartner, type DocumentKind, type PartnerWithProfile } from './api';

const TRADE_LABEL: Record<string, string> = {
  plumber: 'Plumber',
  electrician: 'Electrician',
  ac_technician: 'AC technician',
  mechanic: 'Mechanic',
};
const DOC_LABEL: Record<DocumentKind, string> = { cnic_front: 'CNIC front', cnic_back: 'CNIC back', selfie: 'Selfie' };

export function workSummary(p: PartnerWithProfile): string {
  if (p.role === 'ustaad') return p.trades.map((t) => TRADE_LABEL[t] ?? t).join(', ') || '—';
  return [p.vehicle_type, p.vehicle_number].filter(Boolean).join(' · ') || '—';
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';
}

/** List of partners in some statuses, with a detail panel to review one. */
export function PartnersView({ statuses, title, onChanged }: { statuses: PartnerStatus[]; title: string; onChanged?: () => void }) {
  const [rows, setRows] = useState<PartnerWithProfile[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const statusKey = statuses.join(',');

  const load = useCallback(async () => {
    setState('loading');
    try {
      setRows(await listPartners(statusKey.split(',') as PartnerStatus[]));
      setState('ready');
    } catch (e) {
      setError(errorText(e));
      setState('error');
    }
  }, [statusKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="split">
      <section className="list">
        <div className="list-header">
          <h2>{title}</h2>
          <button className="btn ghost small" onClick={() => void load()}>
            Refresh
          </button>
        </div>
        {state === 'loading' ? <p className="muted">Loading…</p> : null}
        {state === 'error' ? <p className="error">{error}</p> : null}
        {state === 'ready' && rows.length === 0 ? <p className="muted">Nothing here right now.</p> : null}
        {rows.map((p) => (
          <button key={p.id} className={`row ${p.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(p.id)}>
            <span className={`pill role-${p.role}`}>{p.role === 'rider' ? 'Rider' : 'Ustaad'}</span>
            <span className="row-main">
              <strong>{p.profiles?.full_name ?? 'Unnamed'}</strong>
              <span className="muted small">
                {p.profiles?.phone ? formatE164ForDisplay(p.profiles.phone) : ''} · {workSummary(p)}
              </span>
            </span>
            <span className={`pill status-${p.status}`}>{p.status}</span>
          </button>
        ))}
      </section>
      <section className="detail">
        {selected ? (
          <PartnerDetail
            key={selected.id}
            partner={selected}
            onReviewed={() => {
              void load();
              onChanged?.();
            }}
          />
        ) : (
          <p className="muted">Select a partner to review.</p>
        )}
      </section>
    </div>
  );
}

function PartnerDetail({ partner, onReviewed }: { partner: PartnerWithProfile; onReviewed: () => void }) {
  const [docs, setDocs] = useState<Partial<Record<DocumentKind, string>> | null>(null);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    documentUrls(partner.id)
      .then((urls) => {
        if (active) setDocs(urls);
      })
      .catch((e) => {
        if (active) setDocsError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [partner.id]);

  const decide = async (decision: 'approved' | 'rejected' | 'suspended') => {
    setBusy(true);
    setError(null);
    try {
      await reviewPartner(partner.id, decision, reason.trim() || undefined);
      onReviewed();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <h2>{partner.profiles?.full_name ?? 'Unnamed partner'}</h2>
      <dl className="facts">
        <dt>Phone</dt>
        <dd>{partner.profiles?.phone ? formatE164ForDisplay(partner.profiles.phone) : '—'}</dd>
        <dt>Role</dt>
        <dd>{partner.role === 'rider' ? 'Rider' : 'Ustaad'}</dd>
        <dt>{partner.role === 'rider' ? 'Vehicle' : 'Trades'}</dt>
        <dd>{workSummary(partner)}</dd>
        <dt>CNIC</dt>
        <dd className="mono">{partner.cnic_number ?? '—'}</dd>
        <dt>Payout</dt>
        <dd>
          {partner.payout_method ?? '—'} · <span className="mono">{partner.payout_account ?? '—'}</span>
        </dd>
        <dt>Status</dt>
        <dd>
          <span className={`pill status-${partner.status}`}>{partner.status}</span>
          {partner.status_reason ? <span className="muted"> — {partner.status_reason}</span> : null}
        </dd>
        <dt>Submitted</dt>
        <dd>{formatDate(partner.submitted_at)}</dd>
      </dl>

      <h3>Documents</h3>
      {docsError ? <p className="error">{docsError}</p> : null}
      <div className="docs">
        {DOCUMENT_KINDS.map((kind) => (
          <figure key={kind} className="doc">
            {docs?.[kind] ? (
              <a href={docs[kind]} target="_blank" rel="noreferrer">
                <img src={docs[kind]} alt={DOC_LABEL[kind]} />
              </a>
            ) : (
              <div className="doc-missing">{docs ? 'Not uploaded' : 'Loading…'}</div>
            )}
            <figcaption>{DOC_LABEL[kind]}</figcaption>
          </figure>
        ))}
      </div>
      <p className="muted small">Check the CNIC number matches the photo, and the selfie matches the CNIC face.</p>

      {partner.status === 'pending' || partner.status === 'approved' ? (
        <>
          <label className="label" htmlFor="reason">
            {partner.status === 'pending' ? 'Reason (needed to reject — the partner will see it)' : 'Reason for suspension'}
          </label>
          <textarea
            id="reason"
            className="input"
            rows={2}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={partner.status === 'pending' ? 'e.g. CNIC photo is blurry, please retake' : 'e.g. Customer complaint'}
          />
        </>
      ) : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="actions">
        {partner.status === 'pending' ? (
          <>
            <button className="btn primary" disabled={busy} onClick={() => void decide('approved')}>
              Approve
            </button>
            <button className="btn danger" disabled={busy} onClick={() => void decide('rejected')}>
              Reject
            </button>
          </>
        ) : null}
        {partner.status === 'approved' ? (
          <button className="btn danger" disabled={busy} onClick={() => void decide('suspended')}>
            Suspend
          </button>
        ) : null}
        {partner.status === 'suspended' ? (
          <button className="btn primary" disabled={busy} onClick={() => void decide('approved')}>
            Reactivate
          </button>
        ) : null}
      </div>
    </div>
  );
}
