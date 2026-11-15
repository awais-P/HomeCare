import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useI18n, useRowDirection } from '@homecare/shared/i18n';
import { radius, spacing, useColors } from '@homecare/shared/theme';
import { AppText, BrandMark, Button, IconCircle, LanguageToggle, Screen } from '@homecare/shared/ui';

export default function PartnerWelcomeScreen() {
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
        <BrandMark size={72} name={t('partner.appName')} />
        <AppText variant="display" align="center">
          {t('partner.welcome.tagline')}
        </AppText>
        <AppText color="textMuted" align="center">
          {t('partner.welcome.subtitle')}
        </AppText>
      </View>

      <View style={styles.roles}>
        {(
          [
            ['bicycle', 'sauda', 'partner.welcome.rider', 'partner.welcome.riderBody'],
            ['construct', 'ustaad', 'partner.welcome.ustaad', 'partner.welcome.ustaadBody'],
          ] as const
        ).map(([icon, tone, title, body]) => (
          <View
            key={title}
            style={[styles.roleRow, { flexDirection: row, backgroundColor: colors.surface, borderColor: colors.border }]}>
            <IconCircle icon={icon} tint={`${tone}Soft`} color={tone} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{t(title)}</AppText>
              <AppText variant="caption" color="textMuted">
                {t(body)}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.verified, { flexDirection: row }]}>
        <Ionicons name="shield-checkmark" size={18} color={colors.success} />
        <AppText variant="caption" color="textMuted" style={styles.flex}>
          {t('partner.welcome.verified')}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  hero: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  roles: { gap: spacing.md },
  roleRow: { alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  verified: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl },
});
