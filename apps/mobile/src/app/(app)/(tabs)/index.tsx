import Ionicons from '@expo/vector-icons/Ionicons';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Badge, Card, IconCircle, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-provider';
import { ServiceCard } from '@/features/home/service-card';
import { useI18n, useRowDirection } from '@/i18n/i18n-provider';
import type { TranslationKey } from '@/i18n/strings';
import { radius, spacing, useColors } from '@/theme';

const TRUST_POINTS: { icon: 'shield-checkmark' | 'receipt' | 'cash'; key: TranslationKey }[] = [
  { icon: 'shield-checkmark', key: 'home.trust.verified' },
  { icon: 'receipt', key: 'home.trust.prices' },
  { icon: 'cash', key: 'home.trust.cash' },
];

export default function HomeScreen() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const colors = useColors();
  const row = useRowDirection();
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? '';

  // Ordering arrives in M4/M5; until then every entry point explains that it is coming.
  const comingSoon = () => Alert.alert(t('home.comingSoonTitle'), t('home.comingSoonBody'));

  return (
    <Screen edges={['top']}>
      <View style={styles.content}>
        <View style={styles.greeting}>
          <AppText variant="caption" color="textMuted">
            {t('home.greeting', { name: firstName })}
          </AppText>
          <AppText variant="title">{t('home.question')}</AppText>
        </View>

        <Pressable
          onPress={comingSoon}
          accessibilityRole="button"
          accessibilityLabel={t('home.addAddress')}
          style={({ pressed }) => [
            styles.address,
            { flexDirection: row },
            { backgroundColor: pressed ? colors.surfaceAlt : colors.surface, borderColor: colors.border },
          ]}>
          <Ionicons name="location" size={20} color={colors.primary} />
          <AppText variant="label" style={styles.flex}>
            {t('home.addAddress')}
          </AppText>
          <Badge label={t('common.comingSoon')} />
        </Pressable>

        <ServiceCard
          tone="sauda"
          icon="bag-handle"
          title={t('services.sauda.title')}
          body={t('services.sauda.body')}
          badge={t('common.comingSoon')}
          tags={[
            t('services.sauda.cat.sabzi'),
            t('services.sauda.cat.grocery'),
            t('services.sauda.cat.pharmacy'),
            t('services.sauda.cat.pickDrop'),
          ]}
          onPress={comingSoon}
        />
        <ServiceCard
          tone="ustaad"
          icon="construct"
          title={t('services.ustaad.title')}
          body={t('services.ustaad.body')}
          badge={t('common.comingSoon')}
          tags={[
            t('services.ustaad.trade.plumber'),
            t('services.ustaad.trade.electrician'),
            t('services.ustaad.trade.ac'),
            t('services.ustaad.trade.mechanic'),
          ]}
          onPress={comingSoon}
        />

        <Card style={[styles.notice, { flexDirection: row }]}>
          <IconCircle icon="time-outline" size={44} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{t('home.comingSoonTitle')}</AppText>
            <AppText variant="caption" color="textMuted">
              {t('home.comingSoonBody')}
            </AppText>
          </View>
        </Card>

        <View style={styles.trust}>
          {TRUST_POINTS.map(({ icon, key }) => (
            <View key={key} style={[styles.trustRow, { flexDirection: row }]}>
              <Ionicons name={icon} size={18} color={colors.primary} />
              <AppText variant="caption" color="textMuted" style={styles.flex}>
                {t(key)}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.lg },
  greeting: { gap: spacing.xxs },
  address: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  trust: { gap: spacing.sm, paddingTop: spacing.xs },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
