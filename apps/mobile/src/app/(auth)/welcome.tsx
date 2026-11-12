import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { LanguageToggle } from '@/components/language-toggle';
import { AppText, BrandMark, Button, Chip, IconCircle, Screen } from '@/components/ui';
import { useI18n, useRowDirection } from '@/i18n/i18n-provider';
import type { TranslationKey } from '@/i18n/strings';
import { spacing, useColors } from '@/theme';

const TRUST_POINTS: TranslationKey[] = ['home.trust.verified', 'home.trust.prices', 'home.trust.cash'];

export default function WelcomeScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();

  return (
    <Screen
      header={
        <View style={styles.headerRow}>
          <LanguageToggle />
        </View>
      }
      footer={
        <>
          <Button label={t('welcome.cta')} icon="call-outline" onPress={() => router.push('/phone')} />
          <AppText variant="small" color="textSubtle" align="center">
            {t('welcome.terms')}
          </AppText>
        </>
      }>
      <View style={styles.hero}>
        <BrandMark size={72} name={t('app.name')} />
        <AppText variant="display" align="center">
          {t('welcome.tagline')}
        </AppText>
        <Chip label={`📍 ${t('welcome.area')}`} tint="primarySoft" textColor="primary" />
      </View>

      <View style={styles.services}>
        <ServiceRow
          icon="bag-handle"
          tone="sauda"
          title={t('services.sauda.title')}
          body={t('services.sauda.body')}
        />
        <ServiceRow
          icon="construct"
          tone="ustaad"
          title={t('services.ustaad.title')}
          body={t('services.ustaad.body')}
        />
      </View>

      <View style={styles.trust}>
        {TRUST_POINTS.map((key) => (
          <View key={key} style={[styles.trustRow, { flexDirection: row }]}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <AppText variant="caption" color="textMuted" style={styles.flex}>
              {t(key)}
            </AppText>
          </View>
        ))}
      </View>
    </Screen>
  );
}

function ServiceRow({
  icon,
  tone,
  title,
  body,
}: {
  icon: 'bag-handle' | 'construct';
  tone: 'sauda' | 'ustaad';
  title: string;
  body: string;
}) {
  const colors = useColors();
  const row = useRowDirection();
  return (
    <View style={[styles.serviceRow, { flexDirection: row, backgroundColor: colors.surface, borderColor: colors.border }]}>
      <IconCircle icon={icon} tint={`${tone}Soft`} color={tone} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{title}</AppText>
        <AppText variant="caption" color="textMuted">
          {body}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  hero: { alignItems: 'center', gap: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  services: { gap: spacing.md },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
  },
  trust: { gap: spacing.sm, paddingTop: spacing.xl },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
