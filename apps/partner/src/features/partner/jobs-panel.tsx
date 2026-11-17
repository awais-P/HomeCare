import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n, useRowDirection, type TranslationKey } from '@homecare/shared/i18n';
import type { OpenOrder, Order, Partner } from '@homecare/shared/lib';
import { getDeviceLocation } from '@homecare/shared/location';
import { CATEGORY_ICON, CATEGORY_KEY, STATUS_KEY } from '@homecare/shared/orders';
import { spacing, useColors } from '@homecare/shared/theme';
import { AppText, Badge, Button, Card, IconCircle, InlineMessage } from '@homecare/shared/ui';

import { acceptOrder, listOpenOrders, myActiveOrder } from './jobs';

const REFRESH_MS = 15_000;

/**
 * Rider's jobs: the order in progress if there is one, otherwise open orders nearby
 * (first rider to accept gets it). Refreshes every 15 seconds while online.
 */
export function JobsPanel({ partner, online }: { partner: Partner; online: boolean }) {
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const [active, setActive] = useState<Order | null>(null);
  const [open, setOpen] = useState<OpenOrder[]>([]);
  const [message, setMessage] = useState<TranslationKey | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const isRider = partner.role === 'rider';

  useEffect(() => {
    if (!isRider) return;
    let alive = true;
    const refresh = async () => {
      try {
        const current = await myActiveOrder(partner.id);
        if (!alive) return;
        setActive(current);
        if (current || !online) {
          setOpen([]);
          return;
        }
        const location = await getDeviceLocation();
        if (location.status !== 'ok') return;
        const orders = await listOpenOrders(location.coordinate.latitude, location.coordinate.longitude);
        if (alive) setOpen(orders);
      } catch {
        // Network hiccup: keep showing the last list.
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
      setReloadToken((n) => n + 1);
    } finally {
      setAccepting(null);
    }
  };

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
            {active.items_text}
          </AppText>
          <Badge label={t(STATUS_KEY[active.status])} tone="sauda" />
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
      </Card>
    );
  }

  return (
    <View style={styles.list}>
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
          <AppText numberOfLines={3}>{job.items_text}</AppText>
          {job.shop_preference ? (
            <AppText variant="caption" color="textMuted">
              {t('order.detail.shop')}: {job.shop_preference}
            </AppText>
          ) : null}
          <Button label={t('jobs.accept')} icon="checkmark-circle-outline" size="md" loading={accepting === job.id} disabled={accepting !== null} onPress={() => void accept(job.id)} />
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
