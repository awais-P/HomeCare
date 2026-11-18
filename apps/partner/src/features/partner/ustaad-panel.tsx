import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n, useRowDirection, type TranslationKey } from '@homecare/shared/i18n';
import { formatSlot, JOB_STATUS_KEY, TRADE_ICON, TRADE_KEY } from '@homecare/shared/jobs';
import type { OpenJob, Partner, UstaadJob, UstaadOffer } from '@homecare/shared/lib';
import { getDeviceLocation } from '@homecare/shared/location';
import { formatRupees, useLiveChanges } from '@homecare/shared/orders';
import { spacing, useColors } from '@homecare/shared/theme';
import { AppText, Badge, Button, Card, IconCircle, InlineMessage } from '@homecare/shared/ui';

import { JobOfferCard } from './job-offer-card';
import { acceptJob, listOpenJobs, myJobOffer, myJobs, respondJobOffer } from './ustaad-jobs';

const REFRESH_MS = 10_000;

const errorKey = (e: unknown): TranslationKey => {
  const msg = (e as { message?: string }).message ?? '';
  if (msg.includes('ustaad_busy')) return 'ujob.errors.busy';
  if (msg.includes('slot_clash')) return 'ujob.errors.clash';
  if (msg.includes('offer_expired')) return 'offer.expired';
  return 'ujob.errors.taken';
};

/**
 * Ustaad's jobs: their booked jobs (in progress first), an automatic offer with a countdown,
 * and open jobs nearby for their trades.
 */
export function UstaadPanel({ partner, online }: { partner: Partner; online: boolean }) {
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const [mine, setMine] = useState<UstaadJob[]>([]);
  const [offer, setOffer] = useState<{ offer: UstaadOffer; deadline: number } | null>(null);
  const [open, setOpen] = useState<OpenJob[]>([]);
  const [message, setMessage] = useState<TranslationKey | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [answering, setAnswering] = useState<'accept' | 'decline' | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useLiveChanges(online ? `job-offers-${partner.id}` : null, [{ table: 'job_offers', filter: `ustaad_id=eq.${partner.id}` }], reload);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const jobs = await myJobs(partner.id);
        if (!alive) return;
        setMine(jobs);
        if (!online) {
          setOffer(null);
          setOpen([]);
          return;
        }
        const nextOffer = await myJobOffer();
        if (!alive) return;
        setOffer((prev) =>
          nextOffer
            ? { offer: nextOffer, deadline: prev?.offer.offer_id === nextOffer.offer_id ? prev.deadline : Date.now() + nextOffer.seconds_left * 1000 }
            : null,
        );
        const location = await getDeviceLocation();
        if (location.status !== 'ok') return;
        const list = await listOpenJobs(location.coordinate.latitude, location.coordinate.longitude);
        if (alive) setOpen(list.filter((j) => j.id !== nextOffer?.job_id));
      } catch {
        // Network hiccup: keep the last state.
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [online, partner.id, reloadToken]);

  const take = async (jobId: string) => {
    setAccepting(jobId);
    setMessage(null);
    try {
      const job = await acceptJob(jobId);
      router.push({ pathname: '/work/[id]', params: { id: job.id } });
    } catch (e) {
      setMessage(errorKey(e));
    } finally {
      setAccepting(null);
      reload();
    }
  };

  const answerOffer = async (yes: boolean) => {
    if (!offer) return;
    setAnswering(yes ? 'accept' : 'decline');
    setMessage(null);
    try {
      const job = await respondJobOffer(offer.offer.offer_id, yes);
      setOffer(null);
      if (job) router.push({ pathname: '/work/[id]', params: { id: job.id } });
    } catch (e) {
      setOffer(null);
      setMessage(errorKey(e));
    } finally {
      setAnswering(null);
      reload();
    }
  };

  const expireOffer = useCallback(() => {
    setOffer(null);
    setMessage('offer.expired');
    reload();
  }, [reload]);

  return (
    <View style={styles.list}>
      {mine.map((job) => (
        <Card
          key={job.id}
          onPress={() => router.push({ pathname: '/work/[id]', params: { id: job.id } })}
          style={[styles.mineCard, { flexDirection: row, borderColor: colors.ustaad }]}>
          <IconCircle icon={TRADE_ICON[job.trade]} tint="ustaadSoft" color="ustaad" />
          <View style={styles.flex}>
            <AppText variant="label" color="textMuted">
              {t(TRADE_KEY[job.trade])} · {job.code}
            </AppText>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {job.problem_text}
            </AppText>
            <View style={[styles.badges, { flexDirection: row }]}>
              <Badge label={t(JOB_STATUS_KEY[job.status])} tone="ustaad" />
              {job.timing === 'scheduled' && job.scheduled_for ? <Badge label={formatSlot(job.scheduled_for)} tone="primary" /> : null}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
        </Card>
      ))}

      {offer ? (
        <JobOfferCard
          offer={offer.offer}
          deadline={offer.deadline}
          busy={answering}
          onAccept={() => void answerOffer(true)}
          onDecline={() => void answerOffer(false)}
          onExpire={expireOffer}
        />
      ) : null}

      <AppText variant="heading">{t('jobs.title')}</AppText>
      {!online ? (
        <AppText variant="caption" color="textMuted">
          {t('jobs.goOnlineFirst')}
        </AppText>
      ) : open.length === 0 ? (
        <AppText variant="caption" color="textMuted">
          {t('jobs.empty')}
        </AppText>
      ) : null}
      {message ? <InlineMessage tone="error" message={t(message)} /> : null}
      {open.map((job) => (
        <Card key={job.id} style={styles.job}>
          <View style={[styles.jobTop, { flexDirection: row }]}>
            <IconCircle icon={TRADE_ICON[job.trade]} tint="ustaadSoft" color="ustaad" size={40} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{t(TRADE_KEY[job.trade])}</AppText>
              <AppText variant="caption" color="textMuted">
                {[job.area, job.distance_km != null ? t('jobs.distance', { km: job.distance_km }) : null].filter(Boolean).join(' · ')}
              </AppText>
            </View>
            <AppText variant="label" color="ustaad">
              {t('common.rupees', { amount: formatRupees(job.visit_fee) })}
            </AppText>
          </View>
          <View style={[styles.badges, { flexDirection: row }]}>
            <Badge label={job.timing === 'scheduled' && job.scheduled_for ? formatSlot(job.scheduled_for) : t('ujob.timing.now')} tone="ustaad" />
            {job.is_warranty ? <Badge label={t('ujob.warranty.badge')} tone="primary" /> : null}
          </View>
          <AppText numberOfLines={3}>{job.problem_text}</AppText>
          <Button
            label={t('jobs.accept')}
            icon="checkmark-circle-outline"
            size="md"
            loading={accepting === job.id}
            disabled={accepting !== null || answering !== null}
            onPress={() => void take(job.id)}
          />
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: spacing.md },
  mineCard: { alignItems: 'center', gap: spacing.md, borderWidth: 2 },
  badges: { flexWrap: 'wrap', gap: spacing.sm },
  job: { gap: spacing.sm },
  jobTop: { alignItems: 'center', gap: spacing.md },
});
