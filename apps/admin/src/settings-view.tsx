import { useEffect, useState } from 'react';

import { errorText } from './api';
import { supabase } from './supabase';

type Setting = { key: string; value: unknown; description: string; updated_at: string };

/** Business values (fees, limits). Provisional until the team decides — see the decision log. */
export function SettingsView() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    supabase
      .from('app_settings')
      .select('*')
      .order('key')
      .then(({ data, error: e }) => {
        if (!active) return;
        if (e) setError(errorText(e));
        else setSettings((data as Setting[]) ?? []);
      });
    return () => {
      active = false;
    };
  }, [reloadToken]);

  return (
    <div className="settings">
      <div className="list-header">
        <h2>Business settings</h2>
      </div>
      <p className="muted">
        These values are provisional answers to the open business decisions (D3–D8). Changes apply to new orders straight away.
        Values are JSON: a number like <code>5000</code>, or a list like <code>[{'{'}"max_km": 3, "fee": 150{'}'}]</code>.
      </p>
      {error ? <p className="error">{error}</p> : null}
      {settings.map((s) => (
        <SettingRow key={s.key} setting={s} onSaved={() => setReloadToken((n) => n + 1)} />
      ))}
    </div>
  );
}

function SettingRow({ setting, onSaved }: { setting: Setting; onSaved: () => void }) {
  const [text, setText] = useState(JSON.stringify(setting.value, null, 1));
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      setError('Not valid JSON.');
      return;
    }
    setState('saving');
    setError(null);
    const { error: e, count } = await supabase.from('app_settings').update({ value: value as never }, { count: 'exact' }).eq('key', setting.key);
    if (e || count === 0) {
      setError(e ? errorText(e) : 'Not saved — only admins can change settings.');
      setState('idle');
      return;
    }
    setState('saved');
    onSaved();
  };

  return (
    <div className="card setting">
      <div className="setting-head">
        <strong className="mono">{setting.key}</strong>
        <span className="muted small">updated {new Date(setting.updated_at).toLocaleDateString('en-PK')}</span>
      </div>
      <p className="muted small">{setting.description}</p>
      <textarea className="input mono" rows={Math.min(6, text.split('\n').length)} value={text} onChange={(e) => {
        setText(e.target.value);
        setState('idle');
      }} />
      <div className="actions">
        <button className="btn primary small" disabled={state === 'saving'} onClick={() => void save()}>
          {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : 'Save'}
        </button>
        {error ? <span className="error small">{error}</span> : null}
      </div>
    </div>
  );
}
