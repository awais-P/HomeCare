import type { TranslationKey } from '../i18n';
import { supabase, type Dispute, type DisputeReason, type DisputeStatus, type SafetyAlert } from '../lib';
import { getDeviceLocation } from '../location';

/** An order or a booking. */
export type SafetyThread = { kind: 'order' | 'job'; id: string };

const args = (t: SafetyThread | null) => (t ? (t.kind === 'order' ? { p_order: t.id } : { p_job: t.id }) : {});

/**
 * The public website (for "share trip" links), from EXPO_PUBLIC_SITE_URL. Without it the share
 * button is hidden, so a wrong link is never sent.
 */
export const SITE_URL = process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/$/, '') || null;

export const DISPUTE_REASONS: DisputeReason[] = [
  'wrong_items',
  'overcharged',
  'poor_work',
  'damage',
  'late_or_no_show',
  'behaviour',
  'safety',
  'other',
];

export const DISPUTE_REASON_KEY: Record<DisputeReason, TranslationKey> = {
  wrong_items: 'dispute.reason.wrong_items',
  overcharged: 'dispute.reason.overcharged',
  poor_work: 'dispute.reason.poor_work',
  damage: 'dispute.reason.damage',
  late_or_no_show: 'dispute.reason.late_or_no_show',
  behaviour: 'dispute.reason.behaviour',
  safety: 'dispute.reason.safety',
  other: 'dispute.reason.other',
};

export const DISPUTE_STATUS_KEY: Record<DisputeStatus, TranslationKey> = {
  open: 'dispute.status.open',
  in_review: 'dispute.status.in_review',
  resolved: 'dispute.status.resolved',
  rejected: 'dispute.status.rejected',
};

/** Alert the HomeCare team, with the phone's location when it can be read quickly. */
export async function raiseSos(thread: SafetyThread | null, note?: string): Promise<SafetyAlert> {
  const location = await Promise.race([
    getDeviceLocation(),
    new Promise<{ status: 'timeout' }>((resolve) => setTimeout(() => resolve({ status: 'timeout' }), 6000)),
  ]);
  const coords = location.status === 'ok' && 'coordinate' in location ? location.coordinate : null;
  const { data, error } = await supabase.rpc('raise_sos', {
    ...args(thread),
    lat: coords?.latitude,
    lng: coords?.longitude,
    p_note: note?.trim() || undefined,
  });
  if (error) throw error;
  return data;
}

/** A link family can open to follow the order or booking live (no sign-in). */
export async function createShareLink(thread: SafetyThread): Promise<string> {
  if (!SITE_URL) throw new Error('site_url_missing');
  const { data, error } = await supabase.rpc('create_trip_share', args(thread));
  if (error) throw error;
  return `${SITE_URL}/track/${data}`;
}

export async function listMyDisputes(thread: SafetyThread): Promise<Dispute[]> {
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .eq(thread.kind === 'order' ? 'order_id' : 'job_id', thread.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function raiseDispute(thread: SafetyThread, reason: DisputeReason, details: string): Promise<Dispute> {
  const { data, error } = await supabase.rpc('raise_dispute', { p_reason: reason, p_details: details, ...args(thread) });
  if (error) throw error;
  return data;
}

export function disputeErrorKey(error: unknown): TranslationKey {
  const message = (error as { message?: string })?.message ?? '';
  if (message.includes('dispute_exists')) return 'dispute.exists';
  if (message.includes('too_late')) return 'dispute.tooLate';
  if (message.includes('details_required')) return 'dispute.detailsRequired';
  return 'errors.generic';
}
