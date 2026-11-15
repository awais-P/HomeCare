import type { Partner, PartnerStatus } from '@homecare/shared/db-types';

import { supabase } from './supabase';

export type PartnerWithProfile = Partner & { profiles: { full_name: string | null; phone: string | null } | null };
export type DocumentKind = 'cnic_front' | 'cnic_back' | 'selfie';
export const DOCUMENT_KINDS: DocumentKind[] = ['cnic_front', 'cnic_back', 'selfie'];

/** A partner counts as online only if their last location is recent. */
export const ONLINE_FRESH_MS = 2 * 60 * 1000;

export async function listPartners(statuses: PartnerStatus[]): Promise<PartnerWithProfile[]> {
  const { data, error } = await supabase
    .from('partners')
    .select('*, profiles(full_name, phone)')
    .in('status', statuses)
    .order('submitted_at', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data as PartnerWithProfile[];
}

export async function listOnlinePartners(): Promise<PartnerWithProfile[]> {
  const since = new Date(Date.now() - ONLINE_FRESH_MS).toISOString();
  const { data, error } = await supabase
    .from('partners')
    .select('*, profiles(full_name, phone)')
    .eq('status', 'approved')
    .eq('is_online', true)
    .gte('last_seen_at', since);
  if (error) throw error;
  return data as PartnerWithProfile[];
}

/** Short-lived links (10 min) to a partner's private verification photos. */
export async function documentUrls(partnerId: string): Promise<Partial<Record<DocumentKind, string>>> {
  const bucket = supabase.storage.from('partner-documents');
  const { data: files, error } = await bucket.list(partnerId);
  if (error) throw error;
  const paths = files.map((f) => `${partnerId}/${f.name}`);
  if (!paths.length) return {};
  const { data: signed, error: signError } = await bucket.createSignedUrls(paths, 600);
  if (signError) throw signError;
  const result: Partial<Record<DocumentKind, string>> = {};
  for (const item of signed) {
    const kind = item.path?.split('/')[1]?.split('.')[0] as DocumentKind | undefined;
    if (kind && DOCUMENT_KINDS.includes(kind) && item.signedUrl) result[kind] = item.signedUrl;
  }
  return result;
}

export async function reviewPartner(partnerId: string, decision: 'approved' | 'rejected' | 'suspended', reason?: string) {
  const { data, error } = await supabase.rpc('review_partner', {
    p_partner: partnerId,
    p_decision: decision,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

export async function fetchZones(): Promise<GeoJSON.FeatureCollection | null> {
  const { data, error } = await supabase.rpc('service_zones_geojson');
  if (error) return null;
  return data as unknown as GeoJSON.FeatureCollection;
}

/** Readable message for errors raised by the database rules. */
export function errorText(error: unknown): string {
  const message = (error as { message?: string })?.message ?? String(error);
  const known: Record<string, string> = {
    not_admin: 'Your account is not an admin.',
    reason_required: 'Please write a reason. The partner will see it.',
    invalid_transition: 'This status change is not allowed (someone may have reviewed it already). Refresh the list.',
    partner_not_found: 'Partner not found. Refresh the list.',
  };
  const code = Object.keys(known).find((k) => message.includes(k));
  return code ? known[code] : message;
}
