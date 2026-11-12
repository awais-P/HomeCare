import * as Haptics from 'expo-haptics';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BackHeader } from '@/components/back-header';
import { AppText, Button, InlineMessage, OtpInput, Screen, type OtpInputHandle } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-provider';
import { errorMessageKey } from '@/features/auth/errors';
import { formatE164ForDisplay, normalizePakistaniMobile } from '@/features/auth/phone';
import { useI18n } from '@/i18n/i18n-provider';
import type { TranslationKey } from '@/i18n/strings';
import { spacing } from '@/theme';

const CODE_LENGTH = 6;
/** Supabase allows one SMS per number every 60 seconds by default. */
const RESEND_SECONDS = 60;

export default function VerifyScreen() {
  const params = useLocalSearchParams<{ phone?: string }>();
  const phone = normalizePakistaniMobile(params.phone ?? '');
  if (!phone) return <Redirect href="/phone" />;
  return <VerifyForm phone={phone} />;
}

function VerifyForm({ phone }: { phone: string }) {
  const { t } = useI18n();
  const { verifyOtp, sendOtp } = useAuth();
  const otpRef = useRef<OtpInputHandle>(null);

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [notice, setNotice] = useState<TranslationKey | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  const verify = async (value: string) => {
    if (value.length !== CODE_LENGTH || verifying) return;
    setVerifying(true);
    setError(null);
    setNotice(null);
    try {
      await verifyOtp(phone, value);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // No navigation needed: the auth gate changes and the root layout moves us on.
    } catch (err) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(errorMessageKey(err));
      setCode('');
      otpRef.current?.shake();
      otpRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    setNotice(null);
    try {
      await sendOtp(phone);
      setNotice('verify.resent');
      setSecondsLeft(RESEND_SECONDS);
      setCode('');
      otpRef.current?.focus();
    } catch (err) {
      setError(errorMessageKey(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen
      header={<BackHeader />}
      footer={
        <Button
          label={t('verify.verify')}
          onPress={() => void verify(code)}
          loading={verifying}
          disabled={code.length !== CODE_LENGTH}
        />
      }>
      <View style={styles.content}>
        <View style={styles.heading}>
          <AppText variant="title">{t('verify.title')}</AppText>
          <AppText color="textMuted">
            {t('verify.subtitle', { phone: '⁦' + formatE164ForDisplay(phone) + '⁩' })}
          </AppText>
          <Pressable onPress={() => router.back()} accessibilityRole="link" hitSlop={8} style={styles.link}>
            <AppText variant="label" color="primary">
              {t('verify.changeNumber')}
            </AppText>
          </Pressable>
        </View>

        <OtpInput
          ref={otpRef}
          value={code}
          onChange={(next) => {
            setCode(next);
            if (error) setError(null);
          }}
          onComplete={(value) => void verify(value)}
          length={CODE_LENGTH}
          error={Boolean(error)}
          disabled={verifying}
          accessibilityLabel={t('verify.otpLabel')}
        />

        {error ? <InlineMessage tone="error" message={t(error)} /> : null}
        {notice ? <InlineMessage tone="success" message={t(notice)} /> : null}

        <View style={styles.resend}>
          {secondsLeft > 0 ? (
            <AppText variant="caption" color="textMuted" align="center">
              {t('verify.resendIn', { seconds: secondsLeft })}
            </AppText>
          ) : (
            <Button
              label={t('verify.resend')}
              variant="ghost"
              size="md"
              icon="refresh"
              fullWidth={false}
              loading={resending}
              onPress={() => void resend()}
            />
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xl },
  heading: { gap: spacing.sm },
  link: { alignSelf: 'flex-start' },
  resend: { alignItems: 'center', minHeight: 48, justifyContent: 'center' },
});
