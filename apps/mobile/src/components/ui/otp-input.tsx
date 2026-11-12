import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';

import { radius, spacing, useColors } from '@/theme';

import { AppText } from './app-text';

export type OtpInputHandle = {
  focus: () => void;
  /** Plays a short shake, e.g. after a wrong code. */
  shake: () => void;
};

export type OtpInputProps = {
  value: string;
  onChange: (code: string) => void;
  /** Called once all digits are entered. */
  onComplete?: (code: string) => void;
  length?: number;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  accessibilityLabel?: string;
};

/**
 * One-time-code boxes. A single invisible TextInput sits over the boxes, so SMS autofill
 * (Android "sms-otp", iOS "oneTimeCode"), paste and backspace all behave natively.
 */
export const OtpInput = forwardRef<OtpInputHandle, OtpInputProps>(function OtpInput(
  { value, onChange, onComplete, length = 6, error = false, disabled = false, autoFocus = true, accessibilityLabel },
  ref,
) {
  const colors = useColors();
  const inputRef = useRef<TextInputInstance>(null);
  const shakeX = useRef(new Animated.Value(0)).current;
  const [focused, setFocused] = useState(false);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    shake: () => {
      shakeX.setValue(0);
      Animated.sequence(
        [10, -10, 8, -8, 4, 0].map((toValue) =>
          Animated.timing(shakeX, { toValue, duration: 50, useNativeDriver: true }),
        ),
      ).start();
    },
  }));

  useEffect(() => {
    if (autoFocus && !disabled) {
      const id = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(id);
    }
  }, [autoFocus, disabled]);

  const handleChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, length);
    onChange(digits);
    if (digits.length === length) onComplete?.(digits);
  };

  const activeIndex = Math.min(value.length, length - 1);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} disabled={disabled} accessible={false}>
      <Animated.View style={[styles.row, { transform: [{ translateX: shakeX }] }]}>
        {Array.from({ length }, (_, i) => {
          const digit = value[i] ?? '';
          const isActive = focused && !disabled && i === activeIndex;
          const borderColor = error ? colors.danger : isActive ? colors.primary : digit ? colors.borderStrong : colors.border;
          return (
            <View
              key={i}
              style={[
                styles.cell,
                {
                  borderColor,
                  borderWidth: isActive || error ? 2 : 1,
                  backgroundColor: disabled ? colors.surfaceAlt : colors.surface,
                },
              ]}>
              {digit ? (
                <AppText variant="title" align="center">
                  {digit}
                </AppText>
              ) : isActive ? (
                <View style={[styles.caret, { backgroundColor: colors.primary }]} />
              ) : null}
            </View>
          );
        })}
      </Animated.View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        maxLength={length}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        importantForAutofill="yes"
        caretHidden
        accessibilityLabel={accessibilityLabel}
        style={styles.hiddenInput}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  cell: {
    flex: 1,
    maxWidth: 56,
    aspectRatio: 0.85,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caret: { width: 2, height: 26, borderRadius: 1 },
  hiddenInput: {
    ...StyleSheet.absoluteFill,
    opacity: 0.011,
    color: 'transparent',
  },
});
