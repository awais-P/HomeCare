import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { VoiceNotePlayer } from '@homecare/shared/audio';
import { useI18n, useRowDirection } from '@homecare/shared/i18n';
import type { RiderOffer } from '@homecare/shared/lib';
import { CATEGORY_ICON, CATEGORY_KEY } from '@homecare/shared/orders';
import { spacing, useColors } from '@homecare/shared/theme';
import { AppText, Button, Card, IconCircle } from '@homecare/shared/ui';

import { fileUrls } from './jobs';

/**
 * An automatic offer: this rider is the nearest free one, and has a few seconds to accept
 * before it goes to the next rider. `deadline` is a local timestamp (server seconds_left + now).
 */
export function OfferCard({
  offer,
  deadline,
  busy,
  onAccept,
  onDecline,
  onExpire,
}: {
  offer: RiderOffer;
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
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);

  // Buzz once when the offer arrives.
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

  const voicePath = offer.voice_note_path;
  useEffect(() => {
    if (!voicePath) return;
    let active = true;
    fileUrls([voicePath]).then((map) => {
      if (active) setVoiceUrl(map[voicePath] ?? null);
    });
    return () => {
      active = false;
    };
  }, [voicePath]);

  const voiceOnly = !!voicePath && offer.items_text === 'Voice note';
  const total = Math.max(30, secondsLeft);
  const progress = Math.min(1, secondsLeft / total);

  return (
    <Card style={[styles.card, { borderColor: colors.sauda }]}>
      <View style={[styles.top, { flexDirection: row }]}>
        <IconCircle icon={CATEGORY_ICON[offer.category]} tint="saudaSoft" color="sauda" size={44} />
        <View style={styles.flex}>
          <AppText variant="label" color="sauda">
            {t('offer.title')}
          </AppText>
          <AppText variant="heading">{t(CATEGORY_KEY[offer.category])}</AppText>
          <AppText variant="caption" color="textMuted">
            {[offer.area, offer.distance_km != null ? t('jobs.distance', { km: offer.distance_km }) : null].filter(Boolean).join(' · ')}
          </AppText>
        </View>
        <AppText variant="label" color="sauda">
          {t('jobs.fee', { fee: offer.estimated_fee })}
        </AppText>
      </View>

      {voicePath ? <VoiceNotePlayer uri={voiceUrl} /> : null}
      {!voiceOnly ? <AppText numberOfLines={4}>{offer.items_text}</AppText> : null}
      {offer.shop_preference ? (
        <AppText variant="caption" color="textMuted">
          {t('order.detail.shop')}: {offer.shop_preference}
        </AppText>
      ) : null}
      {offer.photo_count > 0 ? (
        <AppText variant="caption" color="textMuted">
          {t('offer.photos', { count: offer.photo_count })}
        </AppText>
      ) : null}

      <View style={styles.timer}>
        <View style={[styles.track, { backgroundColor: colors.border }]}>
          <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: secondsLeft <= 10 ? colors.danger : colors.sauda }]} />
        </View>
        <AppText variant="small" color={secondsLeft <= 10 ? 'danger' : 'textMuted'}>
          {t('offer.secondsLeft', { seconds: secondsLeft })}
        </AppText>
      </View>

      <View style={[styles.actions, { flexDirection: row }]}>
        <Button
          style={styles.decline}
          label={t('offer.decline')}
          variant="outline"
          size="md"
          loading={busy === 'decline'}
          disabled={busy !== null}
          onPress={onDecline}
        />
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
  timer: { gap: spacing.xs },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6 },
  actions: { gap: spacing.sm },
  decline: { flex: 0.6 },
});
