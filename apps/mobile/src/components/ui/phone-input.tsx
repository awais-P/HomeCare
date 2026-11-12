import { forwardRef } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';

import { formatNationalDigits, PK_COUNTRY_CODE, PK_NSN_LENGTH, toNationalDigits } from '@/features/auth/phone';
import { spacing, useColors } from '@/theme';

import { AppText } from './app-text';
import { TextField } from './text-field';

export type PhoneInputProps = {
  /** National digits only, e.g. "3001234567". */
  value: string;
  onChangeValue: (nationalDigits: string) => void;
  label?: string;
  placeholder?: string;
  error?: string | null;
  onSubmitEditing?: () => void;
  autoFocus?: boolean;
  editable?: boolean;
};

/**
 * Pakistani mobile number field with a fixed +92 prefix. Accepts typing or pasting in any
 * common format (0300-1234567, +92 300 1234567) and keeps only the 10 national digits.
 */
export const PhoneInput = forwardRef<TextInputInstance, PhoneInputProps>(function PhoneInput(
  { value, onChangeValue, label, placeholder, error, onSubmitEditing, autoFocus, editable = true },
  ref,
) {
  const colors = useColors();

  return (
    <TextField
      ref={ref}
      label={label}
      error={error}
      editable={editable}
      forceLTR
      value={formatNationalDigits(value)}
      onChangeText={(text) => onChangeValue(toNationalDigits(text))}
      placeholder={placeholder}
      keyboardType="phone-pad"
      textContentType="telephoneNumber"
      autoComplete="tel"
      maxLength={PK_NSN_LENGTH + 4}
      returnKeyType="done"
      onSubmitEditing={onSubmitEditing}
      autoFocus={autoFocus}
      accessibilityLabel={label}
      style={styles.input}
      leading={
        <View style={[styles.prefix, { borderRightColor: colors.border }]}>
          <AppText variant="bodyStrong" align="left">
            🇵🇰 {PK_COUNTRY_CODE}
          </AppText>
        </View>
      }
    />
  );
});

const styles = StyleSheet.create({
  prefix: {
    paddingRight: spacing.md,
    borderRightWidth: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  input: { fontSize: 18, letterSpacing: 0.5 },
});
