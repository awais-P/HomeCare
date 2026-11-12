import { StyleSheet, View } from 'react-native';

import { AppText, Button, IconCircle, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-provider';
import { formatE164ForDisplay } from '@/features/auth/phone';
import { ProfileForm } from '@/features/profile/profile-form';
import { useI18n } from '@/i18n/i18n-provider';
import { spacing } from '@/theme';

/** Shown once, right after the first sign-in, until the user has saved a name. */
export default function ProfileSetupScreen() {
  const { t } = useI18n();
  const { profile, signOut } = useAuth();

  return (
    <Screen>
      <View style={styles.content}>
        <View style={styles.heading}>
          <IconCircle icon="person" size={56} />
          <AppText variant="title">{t('profile.title')}</AppText>
          <AppText color="textMuted">{t('profile.subtitle')}</AppText>
          {profile?.phone ? (
            <AppText variant="caption" color="textSubtle">
              {'⁦' + formatE164ForDisplay(profile.phone) + '⁩'}
            </AppText>
          ) : null}
        </View>

        <ProfileForm initialName={profile?.full_name} initialEmail={profile?.email} submitLabel={t('profile.finish')} />

        <Button label={t('verify.changeNumber')} variant="ghost" size="md" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl },
  heading: { gap: spacing.sm },
});
