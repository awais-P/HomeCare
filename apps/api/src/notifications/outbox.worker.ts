import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { FcmSender, loadServiceAccount } from './fcm.js';
import { composeMessage, isStale, type Language } from './messages.js';

const POLL_MS = 5_000;
const MAX_ATTEMPTS = 5;

type OutboxRow = {
  id: number;
  user_id: string;
  app: string;
  kind: string;
  order_id: string | null;
  params: Record<string, unknown>;
  created_at: string;
  attempts: number;
};

/**
 * Sends the notifications the database queues (notification_outbox) to the person's phones.
 * Needs SUPABASE_URL + SUPABASE_SECRET_KEY and a Firebase service account; without them it
 * logs one line and stays off (the apps still update live while open).
 */
@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Notifications');
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private db: SupabaseClient | null = null;
  private fcm: FcmSender | null = null;

  onModuleInit() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    const account = loadServiceAccount();
    if (!url || !key || !account) {
      this.logger.warn(
        'Push notifications are off: set SUPABASE_URL, SUPABASE_SECRET_KEY and FIREBASE_SERVICE_ACCOUNT_FILE in apps/api/.env (see docs/PUSH_NOTIFICATIONS.md).',
      );
      return;
    }
    this.db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    this.fcm = new FcmSender(account);
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.logger.log(`Sending push notifications for Firebase project ${account.project_id}.`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass over the queue (public for tests). */
  async tick(): Promise<number> {
    if (this.busy || !this.db || !this.fcm) return 0;
    this.busy = true;
    let sent = 0;
    try {
      const { data, error } = await this.db
        .from('notification_outbox')
        .select('id, user_id, app, kind, order_id, params, created_at, attempts')
        .is('sent_at', null)
        .lt('attempts', MAX_ATTEMPTS)
        .order('id')
        .limit(50);
      if (error) throw error;
      for (const row of (data ?? []) as OutboxRow[]) {
        if (await this.deliver(row)) sent++;
      }
    } catch (e) {
      this.logger.error(`Queue check failed: ${(e as Error).message}`);
    } finally {
      this.busy = false;
    }
    return sent;
  }

  private async deliver(row: OutboxRow): Promise<boolean> {
    const db = this.db!;
    const done = (lastError: string | null) =>
      db
        .from('notification_outbox')
        .update({ sent_at: new Date().toISOString(), attempts: row.attempts + 1, last_error: lastError })
        .eq('id', row.id);

    if (isStale(row.kind, new Date(row.created_at))) {
      await done('stale');
      return false;
    }
    const [{ data: tokens }, { data: profile }] = await Promise.all([
      db.from('push_tokens').select('token').eq('user_id', row.user_id).eq('app', row.app),
      db.from('profiles').select('language').eq('id', row.user_id).maybeSingle(),
    ]);
    const message = composeMessage(row.kind, row.params ?? {}, ((profile?.language as Language) ?? 'en'));
    if (!message || !tokens?.length) {
      await done(message ? 'no_device' : 'unknown_kind');
      return false;
    }

    const jobId = typeof row.params?.job_id === 'string' ? row.params.job_id : '';
    const payload = { kind: row.kind, order_id: row.order_id ?? '', job_id: jobId };
    let failure: string | null = null;
    for (const { token } of tokens as { token: string }[]) {
      const result = await this.fcm!.send(token, message, payload);
      if (result === 'unregistered') await db.from('push_tokens').delete().eq('token', token);
      else if (result !== 'ok') failure = result;
    }
    if (failure) {
      await db.from('notification_outbox').update({ attempts: row.attempts + 1, last_error: failure }).eq('id', row.id);
      return false;
    }
    await done(null);
    return true;
  }
}
