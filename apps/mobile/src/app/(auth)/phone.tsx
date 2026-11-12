import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackHeader } from '@/components/back-header';
import { AppText, Button, InlineMessage, PhoneInput, Screen } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-provider';
import { errorMessageKey } from '@/features/auth/errors';
import { isValidNationalNumber, PK_COUNTRY_CODE, PK_NSN_LENGTH } from '@/features/auth/phone';
import { useI18n } from '@/i18n/i18n-provider';
import type { TranslationKey } from '@/i18n/strings';
import { isSupabaseConfigured } from '@/lib/supabase';
import { spacing } from '@/theme';

export default function PhoneScreen() {
  const { t } = useI18n();
  const { sendOtp } = useAuth();
  const [digits, setDigits] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [apiError, setApiError] = useState<TranslationKey | null>(null);

  const valid = isValidNationalNumber(digits);
  const showInvalid = submitted && !valid;

  const submit = async () => {
    setSubmitted(true);
    setApiError(null);
    if (!valid || sending) return;
    if (!isSupabaseConfigured) {
      setApiError('errors.notConfigured');
      return;
    }
    const phone = `${PK_COUNTRY_CODE}${digits}`;
    setSending(true);
    try {
      await sendOtp(phone);
      router.push({ pathname: '/verify', params: { phone } });
    } catch (error) {
      setApiError(errorMessageKey(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen
      header={<BackHeader />}
      footer={
        <Button
          label={t('phone.sendCode')}
          onPress={submit}
          loading={sending}
          disabled={digits.length < PK_NSN_LENGTH}
        />
      }>
      <View style={styles.content}>
        <View style={styles.heading}>
          <AppText variant="title">{t('phone.title')}</AppText>
          <AppText color="textMuted">{t('phone.subtitle')}</AppText>
        </View>
        <PhoneInput
          label={t('phone.label')}
          placeholder={t('phone.placeholder')}
          value={digits}
          onChangeValue={(next) => {
            setDigits(next);
            setApiError(null);
          }}
          error={showInvalid ? t('phone.invalid') : null}
          onSubmitEditing={submit}
          autoFocus
        />
        {apiError ? <InlineMessage tone="error" message={t(apiError)} /> : null}
        <InlineMessage tone="info" message={t('phone.privacy')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl },
  heading: { gap: spacing.sm },
});
