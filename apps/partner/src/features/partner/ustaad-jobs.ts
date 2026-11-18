import { supabase, type JobStatus, type OpenJob, type UstaadJob, type UstaadOffer } from '@homecare/shared/lib';

/** The automatic job offer waiting for this ustaad, if any (also moves expired offers on). */
export async function myJobOffer(): Promise<UstaadOffer | null> {
  const { data, error } = await supabase.rpc('my_job_offer');
  if (error) throw error;
  return data?.[0] ?? null;
}

/** Accept (returns the job, now yours) or skip (returns null). */
export async function respondJobOffer(offerId: string, accept: boolean): Promise<UstaadJob | null> {
  const { data, error } = await supabase.rpc('respond_job_offer', { p_offer: offerId, p_accept: accept });
  if (error) throw error;
  return data;
}

export async function listOpenJobs(lat: number, lng: number): Promise<OpenJob[]> {
  const { data, error } = await supabase.rpc('list_open_jobs', { lat, lng });
  if (error) throw error;
  return data ?? [];
}

export async function acceptJob(jobId: string): Promise<UstaadJob> {
  const { data, error } = await supabase.rpc('accept_job', { p_job: jobId });
  if (error) throw error;
  return data;
}

/** This ustaad's jobs that aren't finished: the one in progress first, then by time. */
export async function myJobs(ustaadId: string): Promise<UstaadJob[]> {
  const { data, error } = await supabase
    .from('ustaad_jobs')
    .select('*')
    .eq('ustaad_id', ustaadId)
    .in('status', ['accepted', 'on_the_way', 'arrived', 'quoted', 'in_progress'])
    .order('accepted_at', { ascending: true });
  if (error) throw error;
  const rank = (j: UstaadJob) => (j.status === 'accepted' ? 1 : 0);
  const when = (j: UstaadJob) => j.scheduled_for ?? j.accepted_at ?? j.created_at;
  return data.sort((a, b) => rank(a) - rank(b) || when(a).localeCompare(when(b)));
}

export async function getJob(jobId: string): Promise<UstaadJob | null> {
  const { data, error } = await supabase.from('ustaad_jobs').select('*').eq('id', jobId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function advanceJob(jobId: string, next: JobStatus, location?: { lat: number; lng: number }): Promise<UstaadJob> {
  const { data, error } = await supabase.rpc('advance_job', { p_job: jobId, p_next: next, lat: location?.lat, lng: location?.lng });
  if (error) throw error;
  return data;
}

export async function sendQuote(jobId: string, labour: number, parts: number, note?: string): Promise<UstaadJob> {
  const { data, error } = await supabase.rpc('send_quote', { p_job: jobId, p_labour: labour, p_parts: parts, p_note: note });
  if (error) throw error;
  return data;
}

export async function completeJob(jobId: string): Promise<UstaadJob> {
  const { data, error } = await supabase.rpc('complete_job', { p_job: jobId });
  if (error) throw error;
  return data;
}

/** Gives the job back (only before arriving). */
export async function releaseJob(jobId: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_job', { p_job: jobId, p_reason: 'Ustaad gave the job back' });
  if (error) throw error;
}

export async function jobCustomerContact(jobId: string) {
  const { data } = await supabase.rpc('job_contact', { p_job: jobId });
  return data?.[0] ?? null;
}
