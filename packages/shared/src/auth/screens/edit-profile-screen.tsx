import { router } from 'expo-router';

import { BackHeader, Screen, TextField } from '../../ui';
import { useAuth } from '../auth-provider';
import { formatE164ForDisplay } from '../phone';
import { ProfileForm } from '../profile-form';
import { useI18n } from '../../i18n';

export function EditProfileScreen() {
  const { t } = useI18n();
  const { profile } = useAuth();

  return (
    <Screen header={<BackHeader title={t('profile.editTitle')} />}>
      <ProfileForm
        initialName={profile?.full_name}
        initialEmail={profile?.email}
        submitLabel={t('common.save')}
        onSaved={() => router.back()}
        extra={
          <TextField
            label={t('profile.phoneLabel')}
            value={profile?.phone ? formatE164ForDisplay(profile.phone) : ''}
            hint={t('profile.phoneLocked')}
            editable={false}
            forceLTR
          />
        }
      />
    </Screen>
  );
}
