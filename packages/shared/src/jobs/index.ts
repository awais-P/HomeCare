import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import type { TranslationKey } from '../i18n';
import type { JobStatus, UstaadJob, UstaadTrade } from '../lib/database.types';
import { useLiveChanges } from '../orders/live';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const TRADES: UstaadTrade[] = ['plumber', 'electrician', 'ac_technician', 'mechanic'];

export const TRADE_KEY: Record<UstaadTrade, TranslationKey> = {
  plumber: 'services.ustaad.trade.plumber',
  electrician: 'services.ustaad.trade.electrician',
  ac_technician: 'services.ustaad.trade.ac',
  mechanic: 'services.ustaad.trade.mechanic',
};

export const TRADE_ICON: Record<UstaadTrade, IconName> = {
  plumber: 'water',
  electrician: 'flash',
  ac_technician: 'snow',
  mechanic: 'car-sport',
};

export const JOB_STATUS_KEY: Record<JobStatus, TranslationKey> = {
  requested: 'ujob.status.requested',
  accepted: 'ujob.status.accepted',
  on_the_way: 'ujob.status.on_the_way',
  arrived: 'ujob.status.arrived',
  quoted: 'ujob.status.quoted',
  in_progress: 'ujob.status.in_progress',
  completed: 'ujob.status.completed',
  visit_only: 'ujob.status.visit_only',
  cancelled: 'ujob.status.cancelled',
};

export const JOB_STATUS_ICON: Record<JobStatus, IconName> = {
  requested: 'search',
  accepted: 'person-circle',
  on_the_way: 'navigate',
  arrived: 'home',
  quoted: 'pricetag',
  in_progress: 'construct',
  completed: 'checkmark-circle',
  visit_only: 'checkmark-circle-outline',
  cancelled: 'close-circle',
};

/** The happy path, in order. */
export const JOB_STEPS: JobStatus[] = ['requested', 'accepted', 'on_the_way', 'arrived', 'quoted', 'in_progress', 'completed'];

/** An ustaad is assigned and the job isn't finished. */
export const ACTIVE_JOB_STATUSES: JobStatus[] = ['accepted', 'on_the_way', 'arrived', 'quoted', 'in_progress'];

export const isJobOpen = (status: JobStatus) => status !== 'completed' && status !== 'visit_only' && status !== 'cancelled';

/** What the customer pays (cash), once known. */
export function jobTotal(job: Pick<UstaadJob, 'amount_due' | 'labour_cost' | 'parts_cost' | 'visit_fee' | 'is_warranty' | 'status'>) {
  if (job.amount_due != null) return job.amount_due;
  if (job.labour_cost == null) return null;
  const work = job.labour_cost + (job.parts_cost ?? 0);
  return job.is_warranty ? (job.parts_cost ?? 0) : Math.max(work, job.visit_fee);
}

/** "Thu 20 Nov, 11:00 am" in Pakistan time. */
export const formatSlot = (iso: string) =>
  new Date(iso).toLocaleString('en-PK', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Karachi',
  });

/** Live updates for one job. */
export function useJobLive(jobId: string | null, onChange: () => void) {
  useLiveChanges(jobId ? `job-${jobId}` : null, jobId ? [{ table: 'ustaad_jobs', filter: `id=eq.${jobId}` }] : [], onChange);
}
