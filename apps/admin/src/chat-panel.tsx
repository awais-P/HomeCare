import { useCallback, useEffect, useState } from 'react';

import type { ChatMessage } from '@homecare/shared/db-types';

import { errorText } from './api';
import { supabase } from './supabase';

const WHO: Record<ChatMessage['sender_role'], string> = { customer: 'Customer', partner: 'Partner', admin: 'Support' };

/** The chat on an order or job: read it, and write as HomeCare support. */
export function ChatPanel({ kind, id }: { kind: 'order' | 'job'; id: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);
  const column = kind === 'order' ? 'order_id' : 'job_id';

  useEffect(() => {
    let active = true;
    const load = () =>
      supabase
        .from('chat_messages')
        .select('*')
        .eq(column, id)
        .order('id')
        .then(({ data }) => {
          if (active) setMessages(data ?? []);
        });
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [column, id, reloadToken]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('send_chat_message', {
      p_body: text.trim(),
      ...(kind === 'order' ? { p_order: id } : { p_job: id }),
    });
    setBusy(false);
    if (e) setError(errorText(e));
    else {
      setText('');
      reload();
    }
  };

  return (
    <>
      <h3>Chat</h3>
      {messages.length === 0 ? <p className="muted small">No messages.</p> : null}
      <ul className="timeline">
        {messages.map((m) => (
          <li key={m.id}>
            <span className="muted small">
              {new Date(m.created_at).toLocaleString('en-PK', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
            </span>{' '}
            <strong>{WHO[m.sender_role]}:</strong> {m.body}
            {m.read_at ? <span className="muted small"> · seen</span> : null}
          </li>
        ))}
      </ul>
      <textarea
        className="input"
        rows={2}
        maxLength={500}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write as HomeCare support (both sides see it and get a notification)"
      />
      <button className="btn" disabled={busy || !text.trim()} onClick={() => void send()}>
        Send as support
      </button>
      {error ? <p className="error">{error}</p> : null}
    </>
  );
}
