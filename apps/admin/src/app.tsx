import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { LiveMap } from './live-map';
import { Login } from './login';
import { JobsView } from './jobs-view';
import { OrdersView } from './orders-view';
import { PartnersView } from './partners-view';
import { SettingsView } from './settings-view';
import { isConfigured, supabase } from './supabase';

type View = 'orders' | 'jobs' | 'applications' | 'partners' | 'map' | 'settings';

const VIEWS: { id: View; label: string }[] = [
  { id: 'orders', label: 'Orders' },
  { id: 'jobs', label: 'Ustaad jobs' },
  { id: 'applications', label: 'Applications' },
  { id: 'partners', label: 'Partners' },
  { id: 'map', label: 'Live map' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [admin, setAdmin] = useState<'checking' | 'yes' | 'no'>('checking');
  const [view, setView] = useState<View>('orders');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (active) setAdmin(!error && data === true ? 'yes' : 'no');
    });
    return () => {
      active = false;
    };
  }, [userId]);

  if (!isConfigured) {
    return (
      <div className="login">
        <div className="card login-card">
          <p className="error">Missing Supabase settings. Copy apps/admin/.env.example to apps/admin/.env and restart.</p>
        </div>
      </div>
    );
  }
  if (!ready) return null;
  if (!session) return <Login />;
  if (admin === 'checking') return <p className="muted center">Checking access…</p>;
  if (admin === 'no') {
    return (
      <div className="login">
        <div className="card login-card stack">
          <h2>Not an admin</h2>
          <p className="muted">
            This account isn&apos;t in the admins list. Ask the project owner to add it (see docs/SUPABASE_SETUP.md).
          </p>
          <button className="btn ghost" onClick={() => void supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">⌂</span> HomeCare Admin
        </div>
        <nav className="tabs">
          {VIEWS.map((v) => (
            <button key={v.id} className={`tab ${view === v.id ? 'active' : ''}`} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </nav>
        <button className="btn ghost small" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      </header>
      <main className="content">
        {view === 'applications' ? <PartnersView key="apps" title="Waiting for review" statuses={['pending']} /> : null}
        {view === 'partners' ? (
          <PartnersView key="partners" title="All partners" statuses={['approved', 'suspended', 'rejected', 'pending', 'draft']} />
        ) : null}
        {view === 'map' ? <LiveMap /> : null}
        {view === 'orders' ? <OrdersView /> : null}
        {view === 'jobs' ? <JobsView /> : null}
        {view === 'settings' ? <SettingsView /> : null}
      </main>
    </div>
  );
}
