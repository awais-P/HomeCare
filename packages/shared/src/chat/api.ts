import { useCallback, useEffect, useState } from 'react';

import { supabase, type ChatMessage } from '../lib';
import { useLiveChanges } from '../orders/live';

/** A chat belongs to one Sauda Run order or one Ustaad booking. */
export type ChatThread = { kind: 'order' | 'job'; id: string };

const column = (t: ChatThread) => (t.kind === 'order' ? 'order_id' : 'job_id');
const args = (t: ChatThread) => (t.kind === 'order' ? { p_order: t.id } : { p_job: t.id });

export async function listMessages(thread: ChatThread): Promise<ChatMessage[]> {
  const { data, error } = await supabase.from('chat_messages').select('*').eq(column(thread), thread.id).order('id').limit(300);
  if (error) throw error;
  return data;
}

export async function sendMessage(thread: ChatThread, body: string): Promise<ChatMessage> {
  const { data, error } = await supabase.rpc('send_chat_message', { p_body: body, ...args(thread) });
  if (error) throw error;
  return data;
}

export async function markRead(thread: ChatThread): Promise<void> {
  await supabase.rpc('mark_chat_read', args(thread));
}

/** Live updates for one chat. */
export function useChatLive(thread: ChatThread | null, onChange: () => void) {
  useLiveChanges(
    thread ? `chat-${thread.kind}-${thread.id}` : null,
    thread ? [{ table: 'chat_messages', filter: `${column(thread)}=eq.${thread.id}` }] : [],
    onChange,
  );
}

/** How many messages from the other side I haven't read yet (live). */
export function useUnreadCount(thread: ChatThread | null, myId: string | null) {
  const [count, setCount] = useState(0);
  const [token, setToken] = useState(0);
  const refresh = useCallback(() => setToken((n) => n + 1), []);
  const kind = thread?.kind;
  const id = thread?.id;
  // Its own channel name, so it can sit next to an open chat screen.
  useLiveChanges(
    thread ? `chat-unread-${thread.kind}-${thread.id}` : null,
    thread ? [{ table: 'chat_messages', filter: `${column(thread)}=eq.${thread.id}` }] : [],
    refresh,
  );

  useEffect(() => {
    if (!kind || !id || !myId) return;
    let active = true;
    supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq(kind === 'order' ? 'order_id' : 'job_id', id)
      .is('read_at', null)
      .neq('sender_id', myId)
      .then(({ count: n }) => {
        if (active) setCount(n ?? 0);
      });
    return () => {
      active = false;
    };
  }, [kind, id, myId, token]);

  return count;
}

export function chatErrorKey(error: unknown) {
  const message = (error as { message?: string })?.message ?? '';
  if (message.includes('slow_down')) return 'chat.slowDown' as const;
  if (message.includes('chat_closed')) return 'chat.closed' as const;
  return 'chat.failed' as const;
}
