import { useEffect, useRef } from 'react';

import { supabase } from '../lib';

type Watch = { table: 'orders' | 'order_substitutions' | 'order_offers' | 'ustaad_jobs' | 'job_offers' | 'chat_messages'; filter: string };

/**
 * Calls `onChange` whenever a watched row changes (Supabase Realtime, filtered by the database's
 * own access rules). Screens still poll every 15 s as a backup, so a dropped connection only
 * makes updates slower, never wrong.
 */
export function useLiveChanges(key: string | null, watches: Watch[], onChange: () => void) {
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);
  const signature = JSON.stringify(watches);

  useEffect(() => {
    if (!key) return;
    const list = JSON.parse(signature) as Watch[];
    let channel = supabase.channel(`live-${key}`);
    for (const w of list) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: w.table, filter: w.filter }, () =>
        callback.current(),
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [key, signature]);
}

/** Live updates for one order and its substitution questions. */
export function useOrderLive(orderId: string | null, onChange: () => void) {
  useLiveChanges(
    orderId ? `order-${orderId}` : null,
    orderId
      ? [
          { table: 'orders', filter: `id=eq.${orderId}` },
          { table: 'order_substitutions', filter: `order_id=eq.${orderId}` },
        ]
      : [],
    onChange,
  );
}
