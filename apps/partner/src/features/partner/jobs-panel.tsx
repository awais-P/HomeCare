import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n, useRowDirection, type TranslationKey } from '@homecare/shared/i18n';
import type { OpenOrder, Order, Partner, RiderOffer } from '@homecare/shared/lib';
import { getDeviceLocation } from '@homecare/shared/location';
import { CATEGORY_ICON, CATEGORY_KEY, STATUS_KEY, useLiveChanges } from '@homecare/shared/orders';
import { spacing, useColors } from '@homecare/shared/theme';
import { AppText, Badge, Button, Card, IconCircle, InlineMessage } from '@homecare/shared/ui';

import { acceptOrder, listOpenOrders, myActiveOrder, myOffer, respondOffer } from './jobs';
import { OfferCard } from './offer-card';

/** Offers last 30 s, so check often; new offers normally arrive instantly through Realtime. */
const REFRESH_MS = 10_000;

/**
 * Rider's jobs: the order in progress if there is one; otherwise an automatic offer (nearest
 * rider first, a few seconds to accept) and the open orders nearby (first to accept gets it).
 */
export function JobsPanel({ partner, online }: { partner: Partner; online: boolean }) {
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const [active, setActive] = useState<Order | null>(null);
  const [offer, setOffer] = useState<{ offer: RiderOffer; deadline: number } | null>(null);
  const [open, setOpen] = useState<OpenOrder[]>([]);
  const [message, setMessage] = useState<TranslationKey | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [answering, setAnswering] = useState<'accept' | 'decline' | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const isRider = partner.role === 'rider';
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  useLiveChanges(isRider && online ? `offers-${partner.id}` : null, [{ table: 'order_offers', filter: `rider_id=eq.${partner.id}` }], reload);

  useEffect(() => {
    if (!isRider) return;
    let alive = true;
    const refresh = async () => {
      try {
        const current = await myActiveOrder(partner.id);
        if (!alive) return;
        setActive(current);
        if (current || !online) {
          setOffer(null);
          setOpen([]);
          return;
        }
        const nextOffer = await myOffer();
        if (!alive) return;
        setOffer((prev) =>
          nextOffer
            ? { offer: nextOffer, deadline: prev?.offer.offer_id === nextOffer.offer_id ? prev.deadline : Date.now() + nextOffer.seconds_left * 1000 }
            : null,
        );
        const location = await getDeviceLocation();
        if (location.status !== 'ok') return;
        const orders = await listOpenOrders(location.coordinate.latitude, location.coordinate.longitude);
        if (alive) setOpen(orders.filter((o) => o.id !== nextOffer?.order_id));
      } catch {
        // Network hiccup: keep showing the last state.
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [isRider, online, partner.id, reloadToken]);

  const accept = async (orderId: string) => {
    setAccepting(orderId);
    setMessage(null);
    try {
      const order = await acceptOrder(orderId);
      router.push({ pathname: '/job/[id]', params: { id: order.id } });
    } catch (e) {
      const msg = (e as { message?: string }).message ?? '';
      setMessage(msg.includes('rider_busy') ? 'jobs.busy' : 'jobs.taken');
      reload();
    } finally {
      setAccepting(null);
    }
  };

  const answerOffer = async (yes: boolean) => {
    if (!offer) return;
    setAnswering(yes ? 'accept' : 'decline');
    setMessage(null);
    try {
      const order = await respondOffer(offer.offer.offer_id, yes);
      setOffer(null);
      if (order) router.push({ pathname: '/job/[id]', params: { id: order.id } });
    } catch (e) {
      const msg = (e as { message?: string }).message ?? '';
      setOffer(null);
      setMessage(msg.includes('rider_busy') ? 'jobs.busy' : msg.includes('offer_expired') ? 'offer.expired' : 'jobs.taken');
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

  if (!isRider) {
    return <InlineMessage tone="info" message={t('jobs.ustaadSoon')} />;
  }

  if (active) {
    return (
      <Card
        onPress={() => router.push({ pathname: '/job/[id]', params: { id: active.id } })}
        style={[styles.activeCard, { flexDirection: row, borderColor: colors.sauda }]}>
        <IconCircle icon={CATEGORY_ICON[active.category]} tint="saudaSoft" color="sauda" />
        <View style={styles.flex}>
          <AppText variant="label" color="textMuted">
            {t('job.title')} · {active.code}
          </AppText>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {active.voice_note_path && active.items_text === 'Voice note' ? t('voice.note') : active.items_text}
          </AppText>
          <Badge label={t(STATUS_KEY[active.status])} tone="sauda" />
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
      </Card>
    );
  }

  return (
    <View style={styles.list}>
      {offer ? (
        <OfferCard
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
            <IconCircle icon={CATEGORY_ICON[job.category]} tint="saudaSoft" color="sauda" size={40} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{t(CATEGORY_KEY[job.category])}</AppText>
              <AppText variant="caption" color="textMuted">
                {[job.area, t('jobs.distance', { km: job.distance_km })].filter(Boolean).join(' · ')}
              </AppText>
            </View>
            <AppText variant="label" color="sauda">
              {t('jobs.fee', { fee: job.estimated_fee })}
            </AppText>
          </View>
          <AppText numberOfLines={3}>{job.items_text === 'Voice note' ? t('voice.note') : job.items_text}</AppText>
          {job.shop_preference ? (
            <AppText variant="caption" color="textMuted">
              {t('order.detail.shop')}: {job.shop_preference}
            </AppText>
          ) : null}
          <Button
            label={t('jobs.accept')}
            icon="checkmark-circle-outline"
            size="md"
            loading={accepting === job.id}
            disabled={accepting !== null || answering !== null}
            onPress={() => void accept(job.id)}
          />
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: spacing.md },
  activeCard: { alignItems: 'center', gap: spacing.md, borderWidth: 2 },
  job: { gap: spacing.sm },
  jobTop: { alignItems: 'center', gap: spacing.md },
});
