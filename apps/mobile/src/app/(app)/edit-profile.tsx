import { router } from 'expo-router';

import { BackHeader } from '@/components/back-header';
import { Screen, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-provider';
import { formatE164ForDisplay } from '@/features/auth/phone';
import { ProfileForm } from '@/features/profile/profile-form';
import { useI18n } from '@/i18n/i18n-provider';

export default function EditProfileScreen() {
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
