import { useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { AppText, Button, InlineMessage, SegmentedControl, TextField } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-provider';
import { errorMessageKey } from '@/features/auth/errors';
import { useI18n } from '@/i18n/i18n-provider';
import type { TranslationKey } from '@/i18n/strings';
import type { AppLanguage } from '@/lib/database.types';
import { spacing } from '@/theme';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validateName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 60;
}

export function validateEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed === '' || EMAIL_PATTERN.test(trimmed);
}

export type ProfileFormProps = {
  initialName?: string | null;
  initialEmail?: string | null;
  submitLabel: string;
  onSaved?: () => void;
  /** Rendered between the fields and the submit button (e.g. a read-only phone field). */
  extra?: ReactNode;
};

/** Name, email and language form. Used for first-time setup and for editing later. */
export function ProfileForm({ initialName, initialEmail, submitLabel, onSaved, extra }: ProfileFormProps) {
  const { t, language, setLanguage } = useI18n();
  const { updateProfile } = useAuth();
  const emailRef = useRef<TextInputInstance>(null);

  const [name, setName] = useState(initialName ?? '');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<TranslationKey | null>(null);

  const nameError = submitted && !validateName(name) ? t('profile.nameInvalid') : null;
  const emailError = submitted && !validateEmail(email) ? t('profile.emailInvalid') : null;

  const submit = async () => {
    setSubmitted(true);
    setApiError(null);
    if (!validateName(name) || !validateEmail(email)) return;
    setSaving(true);
    try {
      await updateProfile({
        full_name: name.trim().replace(/\s+/g, ' '),
        email: email.trim() === '' ? null : email.trim().toLowerCase(),
        language,
      });
      onSaved?.();
    } catch (error) {
      setApiError(errorMessageKey(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.form}>
      <TextField
        label={t('profile.nameLabel')}
        placeholder={t('profile.namePlaceholder')}
        value={name}
        onChangeText={setName}
        error={nameError}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        maxLength={60}
        onSubmitEditing={() => emailRef.current?.focus()}
        submitBehavior="submit"
      />
      <TextField
        ref={emailRef}
        label={t('profile.emailLabel')}
        placeholder={t('profile.emailPlaceholder')}
        hint={t('profile.emailHint')}
        value={email}
        onChangeText={setEmail}
        error={emailError}
        forceLTR
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="done"
        maxLength={254}
        onSubmitEditing={submit}
      />
      <View style={styles.language}>
        <AppText variant="label" color="textMuted">
          {t('profile.languageLabel')}
        </AppText>
        <SegmentedControl<AppLanguage>
          accessibilityLabel={t('profile.languageLabel')}
          value={language}
          onChange={setLanguage}
          options={[
            { value: 'en', label: t('lang.en') },
            { value: 'ur', label: t('lang.ur') },
          ]}
        />
      </View>
      {extra}
      {apiError ? <InlineMessage tone="error" message={t(apiError)} /> : null}
      <Button label={submitLabel} onPress={submit} loading={saving} style={styles.submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  language: { gap: spacing.xs + 2 },
  submit: { marginTop: spacing.sm },
});
