import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useI18n, useRowDirection } from '@homecare/shared/i18n';
import { formatSlot, TRADE_ICON, TRADE_KEY } from '@homecare/shared/jobs';
import type { UstaadOffer } from '@homecare/shared/lib';
import { formatRupees } from '@homecare/shared/orders';
import { spacing, useColors } from '@homecare/shared/theme';
import { AppText, Badge, Button, Card, IconCircle } from '@homecare/shared/ui';

/** An automatic job offer for an ustaad, with a countdown. `deadline` is a local timestamp. */
export function JobOfferCard({
  offer,
  deadline,
  busy,
  onAccept,
  onDecline,
  onExpire,
}: {
  offer: UstaadOffer;
  deadline: number;
  busy: 'accept' | 'decline' | null;
  onAccept: () => void;
  onDecline: () => void;
  onExpire: () => void;
}) {
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [offer.offer_id]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((deadline - now) / 1000));
  useEffect(() => {
    if (secondsLeft > 0) return;
    const timer = setTimeout(onExpire, 0);
    return () => clearTimeout(timer);
  }, [secondsLeft, onExpire]);

  const progress = Math.min(1, secondsLeft / Math.max(45, secondsLeft));

  return (
    <Card style={[styles.card, { borderColor: colors.ustaad }]}>
      <View style={[styles.top, { flexDirection: row }]}>
        <IconCircle icon={TRADE_ICON[offer.trade]} tint="ustaadSoft" color="ustaad" size={44} />
        <View style={styles.flex}>
          <AppText variant="label" color="ustaad">
            {t('ujob.offer.title')}
          </AppText>
          <AppText variant="heading">{t(TRADE_KEY[offer.trade])}</AppText>
          <AppText variant="caption" color="textMuted">
            {[offer.area, offer.distance_km != null ? t('jobs.distance', { km: offer.distance_km }) : null].filter(Boolean).join(' · ')}
          </AppText>
        </View>
        <AppText variant="label" color="ustaad">
          {t('common.rupees', { amount: formatRupees(offer.visit_fee) })}
        </AppText>
      </View>
      <View style={[styles.badges, { flexDirection: row }]}>
        <Badge label={offer.timing === 'scheduled' && offer.scheduled_for ? formatSlot(offer.scheduled_for) : t('ujob.timing.now')} tone="ustaad" />
        {offer.is_warranty ? <Badge label={t('ujob.warranty.badge')} tone="primary" /> : null}
      </View>
      <AppText numberOfLines={4}>{offer.problem_text}</AppText>
      {offer.photo_count > 0 ? (
        <AppText variant="caption" color="textMuted">
          {t('offer.photos', { count: offer.photo_count })}
        </AppText>
      ) : null}

      <View style={styles.timer}>
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: secondsLeft <= 10 ? colors.danger : colors.ustaad }]} />
        </View>
        <AppText variant="small" color={secondsLeft <= 10 ? 'danger' : 'textMuted'}>
          {t('offer.secondsLeft', { seconds: secondsLeft })}
        </AppText>
      </View>

      <View style={[styles.actions, { flexDirection: row }]}>
        <Button style={styles.decline} label={t('offer.decline')} variant="outline" size="md" loading={busy === 'decline'} disabled={busy !== null} onPress={onDecline} />
        <Button
          style={styles.flex}
          label={t('offer.accept')}
          icon="checkmark-circle-outline"
          size="md"
          loading={busy === 'accept'}
          disabled={busy !== null || secondsLeft === 0}
          onPress={onAccept}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.md, borderWidth: 2 },
  top: { alignItems: 'center', gap: spacing.md },
  badges: { flexWrap: 'wrap', gap: spacing.sm },
  timer: { gap: spacing.xs },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6 },
  actions: { gap: spacing.sm },
  decline: { flex: 0.6 },
});
