import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { ChatButton } from '@homecare/shared/chat';
import { errorMessageKey } from '@homecare/shared/auth';
import { useI18n, useRowDirection } from '@homecare/shared/i18n';
import {
  formatSlot,
  JOB_STATUS_ICON,
  JOB_STATUS_KEY,
  JOB_STEPS,
  jobTotal,
  TRADE_ICON,
  TRADE_KEY,
  useJobLive,
} from '@homecare/shared/jobs';
import type { JobEvent, JobUstaadCard, UstaadJob } from '@homecare/shared/lib';
import { AppMap } from '@homecare/shared/map';
import { formatRupees } from '@homecare/shared/orders';
import { radius, spacing, useColors } from '@homecare/shared/theme';
import { AppText, BackHeader, Badge, Button, Card, Divider, IconCircle, InlineMessage, Screen } from '@homecare/shared/ui';

import {
  answerQuote,
  cancelJob,
  getJob,
  jobErrorKey,
  rateJob,
  reportIssueAgain,
  setFavourite,
  ustaadCard,
  ustaadLocation,
} from '@/features/jobs/api';
import { cancellationFee, photoUrls } from '@/features/orders/api';

/** Backup refresh; changes normally arrive instantly through Realtime. */
const REFRESH_MS = 15_000;

type Spot = { latitude: number; longitude: number; seen_at: string | null };

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' });
const rupees = (t: ReturnType<typeof useI18n>['t'], n: number) => t('common.rupees', { amount: formatRupees(n) });

/** One ustaad booking: status, the ustaad, their price to approve, payment, warranty and rating. */
export default function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const [job, setJob] = useState<UstaadJob | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [card, setCard] = useState<JobUstaadCard | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelFee, setCancelFee] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const load = useCallback(() => setReloadToken((n) => n + 1), []);
  useJobLive(id ?? null, load);

  useEffect(() => {
    let active = true;
    cancellationFee().then((fee) => {
      if (active) setCancelFee(fee);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const fetchJob = async () => {
      try {
        const result = await getJob(id);
        if (!active) return;
        setJob(result.job);
        setEvents(result.events);
        setState('ready');
        const j = result.job;
        if (!j) return;
        const [nextCard, nextSpot, nextUrls] = await Promise.all([
          j.ustaad_id ? ustaadCard(j.id) : Promise.resolve(null),
          ['accepted', 'on_the_way', 'arrived'].includes(j.status) ? ustaadLocation(j.id) : Promise.resolve(null),
          j.photo_paths.length ? photoUrls(j.photo_paths) : Promise.resolve({}),
        ]);
        if (!active) return;
        setCard(nextCard);
        setSpot(nextSpot);
        setUrls(nextUrls);
      } catch {
        if (active) setState('error');
      }
    };
    void fetchJob();
    const timer = setInterval(() => void fetchJob(), REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, reloadToken]);

  const ustaadPoint = useMemo(() => (spot ? { latitude: spot.latitude, longitude: spot.longitude } : null), [spot]);
  const home = useMemo(() => (job ? { latitude: job.latitude, longitude: job.longitude } : null), [job]);

  if (state === 'loading' || !job) {
    return (
      <Screen header={<BackHeader title={t('orders.title')} />} scroll={false}>
        {state === 'error' || (state === 'ready' && !job) ? (
          <InlineMessage tone="error" message={t('errors.generic')} />
        ) : (
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        )}
      </Screen>
    );
  }

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      load();
    } catch (e) {
      setMessage(t(jobErrorKey(e) ?? errorMessageKey(e)));
    } finally {
      setBusy(null);
    }
  };

  const cancelled = job.status === 'cancelled';
  const finished = job.status === 'completed' || job.status === 'visit_only';
  const stepIndex = JOB_STEPS.indexOf(job.status);
  const total = jobTotal(job);
  const quoteTotal = job.labour_cost != null ? job.labour_cost + (job.parts_cost ?? 0) : null;
  const warrantyOpen = job.status === 'completed' && job.warranty_until != null && new Date(job.warranty_until) > new Date();

  const confirmCancel = () => {
    if (!['requested', 'accepted', 'on_the_way'].includes(job.status)) {
      Alert.alert(t('order.detail.cancel'), t('ujob.detail.cancelSupport'));
      return;
    }
    const freeNow =
      job.status === 'requested' ||
      (job.timing === 'scheduled' && job.scheduled_for != null && new Date(job.scheduled_for).getTime() - Date.now() > 2 * 3600_000);
    Alert.alert(t('order.detail.cancelConfirm'), freeNow ? t('order.detail.cancelFree') : t('order.detail.cancelFee', { fee: cancelFee }), [
      { text: t('common.back'), style: 'cancel' },
      {
        text: t('order.detail.cancel'),
        style: 'destructive',
        onPress: () =>
          void run('cancel', async () => {
            setJob(await cancelJob(job.id));
          }),
      },
    ]);
  };

  const decline = () =>
    Alert.alert(t('ujob.quote.declineTitle'), t('ujob.quote.declineBody', { fee: formatRupees(job.visit_fee) }), [
      { text: t('common.back'), style: 'cancel' },
      {
        text: t('ujob.quote.decline'),
        style: 'destructive',
        onPress: () =>
          void run('decline', async () => {
            setJob(await answerQuote(job.id, false));
          }),
      },
    ]);

  const revisit = () =>
    Alert.alert(t('ujob.warranty.again'), t('ujob.warranty.againBody'), [
      { text: t('common.back'), style: 'cancel' },
      {
        text: t('ujob.warranty.book'),
        onPress: () =>
          void run('revisit', async () => {
            const next = await reportIssueAgain(job.id);
            router.push({ pathname: '/job/[id]', params: { id: next.id } });
          }),
      },
    ]);

  return (
    <Screen header={<BackHeader title={t('ujob.detail.title', { code: job.code })} />}>
      <View style={styles.content}>
        {/* The price to approve comes first */}
        {job.status === 'quoted' && quoteTotal != null ? (
          <Card style={[styles.block, { borderColor: colors.ustaad, borderWidth: 2 }]}>
            <View style={[styles.rowCenter, { flexDirection: row }]}>
              <Ionicons name="pricetag" size={22} color={colors.ustaad} />
              <AppText variant="heading">{t('ujob.quote.title')}</AppText>
            </View>
            {job.quote_note ? <AppText>{job.quote_note}</AppText> : null}
            <PayRow label={t('ujob.quote.labour')} value={rupees(t, job.labour_cost ?? 0)} />
            <PayRow label={t('ujob.quote.parts')} value={rupees(t, job.parts_cost ?? 0)} />
            <Divider />
            <PayRow label={t('ujob.quote.total')} value={rupees(t, total ?? quoteTotal)} strong />
            {!job.is_warranty ? (
              <AppText variant="caption" color="textMuted">
                {t('ujob.quote.visitIncluded', { fee: formatRupees(job.visit_fee) })}
              </AppText>
            ) : null}
            <Button label={t('ujob.quote.approve')} icon="checkmark-circle-outline" loading={busy === 'approve'} disabled={busy !== null}
              onPress={() => void run('approve', async () => setJob(await answerQuote(job.id, true)))} />
            <Button label={t('ujob.quote.decline')} variant="outline" size="md" loading={busy === 'decline'} disabled={busy !== null} onPress={decline} />
          </Card>
        ) : null}

        {/* Status */}
        <Card style={styles.statusCard}>
          <View style={[styles.rowCenter, { flexDirection: row }]}>
            <IconCircle
              icon={JOB_STATUS_ICON[job.status]}
              size={52}
              tint={cancelled ? 'dangerSoft' : finished ? 'successSoft' : 'ustaadSoft'}
              color={cancelled ? 'danger' : finished ? 'success' : 'ustaad'}
            />
            <View style={styles.flex}>
              <AppText variant="heading">{t(JOB_STATUS_KEY[job.status])}</AppText>
              <AppText variant="caption" color="textMuted">
                {job.status === 'requested'
                  ? t(job.dispatch_gave_up_at ? 'ujob.detail.needsUstaad' : 'ujob.detail.searching')
                  : t('order.detail.updates')}
              </AppText>
            </View>
          </View>
          <View style={[styles.badges, { flexDirection: row }]}>
            <Badge label={job.timing === 'scheduled' && job.scheduled_for ? t('ujob.detail.scheduledFor', { time: formatSlot(job.scheduled_for) }) : t('ujob.timing.now')} tone="ustaad" />
            {job.is_warranty ? <Badge label={t('ujob.warranty.badge')} tone="primary" /> : null}
          </View>
          {!cancelled && job.status !== 'visit_only' ? (
            <View style={styles.steps}>
              {JOB_STEPS.map((step, i) => {
                const done = i <= stepIndex;
                const at = events.findLast((e) => e.to_status === step)?.created_at;
                return (
                  <View key={step} style={[styles.rowCenter, { flexDirection: row }]}>
                    <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={done ? colors.success : colors.textSubtle} />
                    <AppText variant="caption" color={done ? 'text' : 'textSubtle'} style={styles.flex}>
                      {t(JOB_STATUS_KEY[step])}
                    </AppText>
                    {at && done ? (
                      <AppText variant="small" color="textSubtle">
                        {timeOf(at)}
                      </AppText>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : job.cancel_reason ? (
            <AppText variant="caption" color="textMuted">
              {job.cancel_reason}
            </AppText>
          ) : null}
        </Card>

        {/* The ustaad */}
        {card ? (
          <Card style={[styles.rowCenter, { flexDirection: row }]}>
            <IconCircle icon="person" size={44} tint="ustaadSoft" color="ustaad" />
            <View style={styles.flex}>
              <AppText variant="caption" color="textMuted">
                {t('ujob.detail.ustaad')}
              </AppText>
              <AppText variant="bodyStrong">{card.name ?? ''}</AppText>
              <AppText variant="small" color="textMuted">
                {[card.rating_avg != null ? `★ ${card.rating_avg}` : null, card.jobs_done ? t('ujob.detail.jobsDone', { count: card.jobs_done }) : t('ujob.detail.newUstaad')]
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
            </View>
            {card.phone ? (
              <Button label={t('order.detail.call')} icon="call" size="md" fullWidth={false} onPress={() => void Linking.openURL(`tel:${card.phone}`)} />
            ) : finished ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={card.is_favourite ? t('ujob.detail.favourited') : t('ujob.detail.favourite')}
                disabled={busy !== null}
                onPress={() => void run('fav', () => setFavourite(card.ustaad_id, !card.is_favourite))}
                style={styles.fav}>
                <Ionicons name={card.is_favourite ? 'heart' : 'heart-outline'} size={26} color={colors.danger} />
                <AppText variant="small" color="textMuted">
                  {card.is_favourite ? t('ujob.detail.favourited') : t('ujob.detail.favourite')}
                </AppText>
              </Pressable>
            ) : null}
          </Card>
        ) : null}

        {job.ustaad_id ? (
          <ChatButton thread={{ kind: 'job', id: job.id }} onPress={() => router.push({ pathname: '/chat/[kind]/[id]', params: { kind: 'job', id: job.id } })} />
        ) : null}

        {/* Ustaad on the map */}
        {ustaadPoint && home ? (
          <Card style={styles.mapCard}>
            <AppMap key={job.ustaad_id ?? 'ustaad'} initialCenter={ustaadPoint} initialZoom={14} marker={home} rider={ustaadPoint} style={styles.map} />
            <View style={[styles.mapCaption, { flexDirection: row }]}>
              <AppText variant="label" style={styles.flex}>
                {t('ujob.detail.map')}
              </AppText>
              {spot?.seen_at ? (
                <AppText variant="small" color="textMuted">
                  {t('order.detail.riderSeen', { time: timeOf(spot.seen_at) })}
                </AppText>
              ) : null}
            </View>
          </Card>
        ) : null}

        {/* The problem */}
        <Card style={styles.block}>
          <View style={[styles.rowCenter, { flexDirection: row }]}>
            <Ionicons name={TRADE_ICON[job.trade]} size={20} color={colors.ustaad} />
            <AppText variant="label" color="textMuted">
              {t(TRADE_KEY[job.trade])} · {t('ujob.detail.problem')}
            </AppText>
          </View>
          <AppText>{job.problem_text}</AppText>
          {job.photo_paths.length ? (
            <View style={[styles.photos, { flexDirection: row }]}>
              {job.photo_paths.map((p) => (urls[p] ? <Image key={p} source={{ uri: urls[p] }} style={styles.photo} contentFit="cover" /> : null))}
            </View>
          ) : null}
          <Divider />
          <AppText variant="caption" color="textMuted">
            {t('order.detail.deliverTo')}: {job.address_text}
          </AppText>
        </Card>

        {/* Payment */}
        <Card style={styles.block}>
          <AppText variant="label" color="textMuted">
            {t('order.detail.payment')}
          </AppText>
          <PayRow label={t('ujob.pay.visitFee')} value={rupees(t, job.visit_fee)} />
          {job.labour_cost != null && job.status !== 'visit_only' ? (
            <>
              <PayRow label={t('ujob.quote.labour')} value={rupees(t, job.labour_cost)} />
              <PayRow label={t('ujob.quote.parts')} value={rupees(t, job.parts_cost ?? 0)} />
            </>
          ) : null}
          {job.cancellation_fee > 0 ? <PayRow label={t('order.detail.cancellationFee')} value={rupees(t, job.cancellation_fee)} /> : null}
          <Divider />
          <PayRow
            label={t('ujob.pay.due')}
            value={job.status === 'visit_only' ? rupees(t, job.amount_due ?? job.visit_fee) : total != null ? rupees(t, total) : t('ujob.pay.afterQuote')}
            strong
          />
        </Card>

        {/* Warranty */}
        {warrantyOpen && job.warranty_until ? (
          <Card style={styles.block}>
            <View style={[styles.rowCenter, { flexDirection: row }]}>
              <Ionicons name="shield-checkmark" size={22} color={colors.success} />
              <AppText variant="bodyStrong" style={styles.flex}>
                {t('ujob.warranty.until', { date: new Date(job.warranty_until).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }) })}
              </AppText>
            </View>
            <AppText variant="caption" color="textMuted">
              {t('ujob.warranty.againBody')}
            </AppText>
            <Button label={t('ujob.warranty.again')} icon="refresh" variant="secondary" size="md" loading={busy === 'revisit'} disabled={busy !== null} onPress={revisit} />
          </Card>
        ) : null}

        {/* Rating */}
        {finished ? (
          <Card style={styles.block}>
            <AppText variant="bodyStrong">{job.rating ? t('order.detail.rated', { stars: job.rating }) : t('ujob.detail.rate')}</AppText>
            {!job.rating ? (
              <View style={[styles.stars, { flexDirection: row }]}>
                {[1, 2, 3, 4, 5].map((stars) => (
                  <Pressable key={stars} disabled={busy !== null} onPress={() => void run('rate', async () => setJob(await rateJob(job.id, stars)))}
                    accessibilityRole="button" accessibilityLabel={`${stars}`}>
                    <Ionicons name="star" size={34} color={colors.ustaad} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Card>
        ) : null}

        {message ? <InlineMessage tone="error" message={message} /> : null}

        {['requested', 'accepted', 'on_the_way'].includes(job.status) ? (
          <Button label={t('order.detail.cancel')} variant="danger" icon="close-circle-outline" loading={busy === 'cancel'} onPress={confirmCancel} />
        ) : null}
      </View>
    </Screen>
  );
}

function PayRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  const row = useRowDirection();
  return (
    <View style={[styles.payRow, { flexDirection: row }]}>
      <AppText variant={strong ? 'bodyStrong' : 'body'} style={styles.flex}>
        {label}
      </AppText>
      <AppText variant={strong ? 'bodyStrong' : 'body'}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: spacing.xxxl },
  content: { gap: spacing.lg },
  statusCard: { gap: spacing.md },
  rowCenter: { alignItems: 'center', gap: spacing.md },
  badges: { flexWrap: 'wrap', gap: spacing.sm },
  steps: { gap: spacing.sm },
  block: { gap: spacing.sm },
  fav: { alignItems: 'center', gap: 2 },
  mapCard: { padding: 0, overflow: 'hidden' },
  map: { height: 200 },
  mapCaption: { alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  photos: { flexWrap: 'wrap', gap: spacing.sm },
  photo: { width: 72, height: 72, borderRadius: radius.md },
  payRow: { alignItems: 'center', gap: spacing.md },
  stars: { gap: spacing.sm },
});
