import type { TranslationKey } from '@homecare/shared/i18n';
import {
  supabase,
  type FavouriteUstaad,
  type JobEvent,
  type JobTiming,
  type JobUstaadCard,
  type UstaadJob,
  type UstaadTrade,
} from '@homecare/shared/lib';
import { base64ToArrayBuffer, photoExtension, type PickedPhoto } from '@homecare/shared/media';

export type NewJob = {
  addressId: string;
  trade: UstaadTrade;
  problemText: string;
  timing: JobTiming;
  scheduledFor?: string;
  photoPaths?: string[];
  preferredUstaad?: string;
};

export async function createJob(input: NewJob): Promise<UstaadJob> {
  const { data, error } = await supabase.rpc('create_ustaad_job', {
    p_address_id: input.addressId,
    p_trade: input.trade,
    p_problem_text: input.problemText,
    p_timing: input.timing,
    p_scheduled_for: input.scheduledFor,
    p_photo_paths: input.photoPaths ?? [],
    p_preferred_ustaad: input.preferredUstaad,
  });
  if (error) throw error;
  return data;
}

export async function listMyJobs(): Promise<UstaadJob[]> {
  const { data, error } = await supabase.from('ustaad_jobs').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return data;
}

export async function getJob(id: string): Promise<{ job: UstaadJob | null; events: JobEvent[] }> {
  const [{ data: job, error }, { data: events }] = await Promise.all([
    supabase.from('ustaad_jobs').select('*').eq('id', id).maybeSingle(),
    supabase.from('job_events').select('*').eq('job_id', id).order('id'),
  ]);
  if (error) throw error;
  return { job, events: events ?? [] };
}

export async function ustaadCard(jobId: string): Promise<JobUstaadCard | null> {
  const { data } = await supabase.rpc('job_ustaad', { p_job: jobId });
  return data?.[0] ?? null;
}

export async function ustaadLocation(jobId: string) {
  const { data } = await supabase.rpc('job_ustaad_location', { p_job: jobId });
  return data?.[0] ?? null;
}

export async function answerQuote(jobId: string, approve: boolean): Promise<UstaadJob> {
  const { data, error } = await supabase.rpc('answer_quote', { p_job: jobId, p_approve: approve });
  if (error) throw error;
  return data;
}

export async function cancelJob(jobId: string, reason?: string): Promise<UstaadJob> {
  const { data, error } = await supabase.rpc('cancel_job', { p_job: jobId, p_reason: reason });
  if (error) throw error;
  return data;
}

export async function rateJob(jobId: string, rating: number, comment?: string): Promise<UstaadJob> {
  const { data, error } = await supabase.rpc('rate_job', { p_job: jobId, p_rating: rating, p_comment: comment });
  if (error) throw error;
  return data;
}

/** The problem came back within the warranty: a free revisit, offered to the same ustaad first. */
export async function reportIssueAgain(jobId: string, problemText?: string): Promise<UstaadJob> {
  const { data, error } = await supabase.rpc('report_issue_again', { p_job: jobId, p_problem_text: problemText });
  if (error) throw error;
  return data;
}

export async function myFavourites(): Promise<FavouriteUstaad[]> {
  const { data } = await supabase.rpc('my_favourite_ustaads');
  return data ?? [];
}

export async function setFavourite(ustaadId: string, favourite: boolean) {
  const { error } = favourite
    ? await supabase.from('favourite_ustaads').insert({ ustaad_id: ustaadId })
    : await supabase.from('favourite_ustaads').delete().eq('ustaad_id', ustaadId);
  if (error) throw error;
}

/** Uploads a photo of the problem to order-media/<user id>/job-<random>.<ext>. */
export async function uploadProblemPhoto(userId: string, photo: PickedPhoto): Promise<string> {
  const path = `${userId}/job-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${photoExtension(photo.mimeType)}`;
  const { error } = await supabase.storage
    .from('order-media')
    .upload(path, base64ToArrayBuffer(photo.base64), { contentType: photo.mimeType });
  if (error) throw error;
  return path;
}

/** Visit fee, come-now surge and warranty days from the business settings. */
export async function ustaadPricing(): Promise<{ visitFee: number; surgePercent: number; warrantyDays: number }> {
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['ustaad_visit_fee', 'come_now_surge_percent', 'warranty_days']);
  const get = (key: string, fallback: number) => Number(data?.find((r) => r.key === key)?.value ?? fallback);
  return { visitFee: get('ustaad_visit_fee', 500), surgePercent: get('come_now_surge_percent', 25), warrantyDays: get('warranty_days', 7) };
}

/** Maps job errors from the database to message keys. */
export function jobErrorKey(error: unknown): TranslationKey | null {
  const message = (error as { message?: string })?.message ?? '';
  if (message.includes('too_many_active_jobs')) return 'ustaad.errors.tooMany';
  if (message.includes('invalid_slot')) return 'ustaad.errors.slot';
  if (message.includes('ustaad_not_available')) return 'ustaad.errors.notAvailable';
  if (message.includes('outside_service_area')) return 'address.errors.outside';
  if (message.includes('contact_support_to_cancel')) return 'ujob.detail.cancelSupport';
  return null;
}
