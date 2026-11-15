import { StyleSheet, View } from 'react-native';

import { AppText, Button, IconCircle, Screen } from '../../ui';
import { useAuth } from '../auth-provider';
import { formatE164ForDisplay } from '../phone';
import { ProfileForm } from '../profile-form';
import { useI18n } from '../../i18n';
import { spacing } from '../../theme';

/** Shown once, right after the first sign-in, until the user has saved a name. */
export function ProfileSetupScreen() {
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
