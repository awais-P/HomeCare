import { forwardRef, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { useI18n } from '@/i18n/i18n-provider';
import { radius, spacing, typography, useColors } from '@/theme';

import { AppText } from './app-text';

export type TextFieldProps = TextInputProps & {
  label?: string;
  hint?: string;
  error?: string | null;
  /** Content shown inside the field before the input, e.g. a country code. */
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Force left-to-right input (phone numbers, emails) even in Urdu. */
  forceLTR?: boolean;
};

export const TextField = forwardRef<TextInputInstance, TextFieldProps>(function TextField(
  { label, hint, error, leading, trailing, forceLTR, editable = true, onFocus, onBlur, style, ...inputProps },
  ref,
) {
  const colors = useColors();
  const { isRTL } = useI18n();
  const [focused, setFocused] = useState(false);
  const rtlInput = isRTL && !forceLTR;

  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={styles.wrapper}>
      {label ? (
        <AppText variant="label" color="textMuted">
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.field,
          {
            borderColor,
            borderWidth: focused || error ? 2 : 1,
            backgroundColor: editable ? colors.surface : colors.surfaceAlt,
          },
        ]}>
        {leading}
        <TextInput
          ref={ref}
          editable={editable}
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.primary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            typography.body,
            { color: editable ? colors.text : colors.textMuted, textAlign: rtlInput ? 'right' : 'left' },
            style,
          ]}
          {...inputProps}
        />
        {trailing}
      </View>
      {error ? (
        <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="textSubtle">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs + 2 },
  field: {
    minHeight: 54,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  input: { flex: 1, paddingVertical: spacing.md, minHeight: 50 },
});
