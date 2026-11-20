import { useEffect, useState } from 'react';

import type { SharedTrip } from '@homecare/shared/db-types';

/**
 * Public tracking page for family: /track/<token>. Shows the status of a Sauda Run order or an
 * Ustaad booking and where the rider/ustaad is, without the address or phone numbers.
 * Data comes from the shared_trip() database function, callable without signing in.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const REFRESH_MS = 15_000;

const STATUS: Record<string, string> = {
  requested: 'Finding someone nearby',
  accepted: 'On the way to start',
  at_shop: 'At the shop',
  on_the_way: 'On the way',
  arrived: 'Arrived',
  quoted: 'Checking the problem',
  in_progress: 'Working',
  delivered: 'Delivered',
  completed: 'Job done',
  visit_only: 'Visit finished',
  cancelled: 'Cancelled',
};

const SERVICE: Record<string, string> = {
  sabzi: 'Sabzi & fruit',
  grocery: 'Grocery',
  meat: 'Meat & chicken',
  bakery: 'Bakery',
  pharmacy: 'Pharmacy',
  food: 'Food pickup',
  pick_drop: 'Pick & drop',
  other: 'Errand',
  plumber: 'Plumber',
  electrician: 'Electrician',
  ac_technician: 'AC technician',
  mechanic: 'Mechanic',
};

async function fetchTrip(token: string): Promise<SharedTrip | null> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/shared_trip`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token }),
  });
  if (!response.ok) throw new Error(String(response.status));
  const rows = (await response.json()) as SharedTrip[];
  return rows[0] ?? null;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' });

export function TrackPage({ token }: { token: string }) {
  const [trip, setTrip] = useState<SharedTrip | null | 'missing' | 'error'>(null);

  useEffect(() => {
    document.title = 'Live tracking — HomeCare';
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    let active = true;
    const load = () =>
      fetchTrip(token)
        .then((t) => {
          if (active) setTrip(t ?? 'missing');
        })
        .catch(() => {
          if (active) setTrip((prev) => (prev && typeof prev === 'object' ? prev : 'error'));
        });
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token]);

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return (
      <article className="doc">
        <h1>Live tracking</h1>
        <p>This page is not set up yet.</p>
      </article>
    );
  }
  if (trip === null) {
    return (
      <article className="doc">
        <p className="meta">Loading…</p>
      </article>
    );
  }
  if (trip === 'missing' || trip === 'error') {
    return (
      <article className="doc">
        <h1>Link not available</h1>
        <p>
          {trip === 'missing'
            ? 'This tracking link has expired, was turned off, or the order finished more than an hour ago.'
            : "We couldn't load the tracking right now. Please try again in a moment."}
        </p>
      </article>
    );
  }

  const where = trip.partner_latitude != null && trip.partner_longitude != null ? { lat: trip.partner_latitude, lng: trip.partner_longitude } : null;
  const d = 0.006;
  const embed = where
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${where.lng - d},${where.lat - d},${where.lng + d},${where.lat + d}&layer=mapnik&marker=${where.lat},${where.lng}`
    : null;
  const who = trip.kind === 'order' ? 'rider' : 'ustaad';

  return (
    <article className="doc">
      <p className="meta">
        {trip.kind === 'order' ? 'Sauda Run' : 'Ustaad booking'} · {trip.code} · {SERVICE[trip.service] ?? trip.service}
      </p>
      <h1>{STATUS[trip.status] ?? trip.status}</h1>
      {trip.finished ? <p className="draft">Finished. This link stops working an hour after the end.</p> : null}
      <ul className="facts">
        {trip.partner_name ? (
          <li>
            <strong>{who === 'rider' ? 'Rider' : 'Ustaad'}:</strong> {trip.partner_name} (CNIC verified)
            {trip.vehicle ? ` · ${trip.vehicle}` : ''}
          </li>
        ) : null}
        {trip.area ? (
          <li>
            <strong>Going to:</strong> {trip.area}
          </li>
        ) : null}
        {trip.scheduled_for ? (
          <li>
            <strong>Booked for:</strong> {new Date(trip.scheduled_for).toLocaleString('en-PK', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
          </li>
        ) : null}
        <li>
          <strong>Last update:</strong> {time(trip.updated_at)}
        </li>
      </ul>
      {embed && where ? (
        <>
          <iframe className="map" title={`Where the ${who} is`} src={embed} loading="lazy" />
          <p className="meta">
            Position at {trip.partner_seen_at ? time(trip.partner_seen_at) : '—'} ·{' '}
            <a href={`https://www.google.com/maps/search/?api=1&query=${where.lat},${where.lng}`} target="_blank" rel="noreferrer">
              Open in Google Maps
            </a>
          </p>
        </>
      ) : null}
      <p className="meta">This page refreshes every 15 seconds. It never shows the home address or phone numbers.</p>
    </article>
  );
}
