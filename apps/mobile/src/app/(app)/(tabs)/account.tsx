import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText, Avatar, Card, Divider, ListItem, Screen, SegmentedControl } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-provider';
import { formatE164ForDisplay } from '@/features/auth/phone';
import { useI18n, useRowDirection } from '@/i18n/i18n-provider';
import type { AppLanguage } from '@/lib/database.types';
import { radius, spacing, useColors } from '@/theme';

export default function AccountScreen() {
  const { t, language, setLanguage } = useI18n();
  const { profile, updateProfile, signOut } = useAuth();
  const colors = useColors();
  const row = useRowDirection();

  const changeLanguage = (next: AppLanguage) => {
    setLanguage(next);
    // Saved to the profile so it follows the user to a new phone. Not critical if it fails.
    updateProfile({ language: next }).catch(() => {});
  };

  const confirmSignOut = () =>
    Alert.alert(t('account.signOutConfirmTitle'), t('account.signOutConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('account.signOut'), style: 'destructive', onPress: () => void signOut() },
    ]);

  return (
    <Screen edges={['top']}>
      <View style={styles.content}>
        <AppText variant="title">{t('account.title')}</AppText>

        <Card style={[styles.profileCard, { flexDirection: row }]}>
          <Avatar name={profile?.full_name} />
          <View style={styles.flex}>
            <AppText variant="heading" numberOfLines={1}>
              {profile?.full_name ?? ''}
            </AppText>
            {profile?.phone ? (
              <AppText variant="caption" color="textMuted">
                {'⁦' + formatE164ForDisplay(profile.phone) + '⁩'}
              </AppText>
            ) : null}
            {profile?.email ? (
              <AppText variant="caption" color="textMuted" numberOfLines={1}>
                {profile.email}
              </AppText>
            ) : null}
          </View>
        </Card>

        <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ListItem icon="person-outline" title={t('account.editProfile')} onPress={() => router.push('/edit-profile')} />
          <Divider inset={spacing.lg} />
          <ListItem icon="location-outline" title={t('account.addresses')} value={t('common.comingSoon')} disabled />
          <Divider inset={spacing.lg} />
          <ListItem icon="help-circle-outline" title={t('account.help')} value={t('common.comingSoon')} disabled />
        </View>

        <View style={styles.languageBlock}>
          <AppText variant="label" color="textMuted">
            {t('account.language')}
          </AppText>
          <SegmentedControl<AppLanguage>
            accessibilityLabel={t('account.language')}
            value={language}
            onChange={changeLanguage}
            options={[
              { value: 'en', label: t('lang.en') },
              { value: 'ur', label: t('lang.ur') },
            ]}
          />
        </View>

        <View style={[styles.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ListItem icon="log-out-outline" title={t('account.signOut')} destructive showChevron={false} onPress={confirmSignOut} />
        </View>

        <AppText variant="small" color="textSubtle" align="center">
          {t('account.version', { version: Constants.expoConfig?.version ?? '—' })}
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: spacing.lg },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  group: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  languageBlock: { gap: spacing.xs + 2 },
});
