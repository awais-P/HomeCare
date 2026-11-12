import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { MIN_TOUCH, radius, spacing, useColors, type ColorToken } from '@/theme';

import { AppText } from './app-text';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: ComponentProps<typeof Ionicons>['name'];
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

const variantColors: Record<Variant, { bg: ColorToken | 'transparent'; pressed: ColorToken | 'transparent'; fg: ColorToken; border?: ColorToken }> = {
  primary: { bg: 'primary', pressed: 'primaryPressed', fg: 'onPrimary' },
  secondary: { bg: 'primarySoft', pressed: 'surfaceAlt', fg: 'primary' },
  outline: { bg: 'transparent', pressed: 'surfaceAlt', fg: 'text', border: 'borderStrong' },
  ghost: { bg: 'transparent', pressed: 'surfaceAlt', fg: 'primary' },
  danger: { bg: 'dangerSoft', pressed: 'surfaceAlt', fg: 'danger' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon,
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
  accessibilityHint,
}: ButtonProps) {
  const colors = useColors();
  const v = variantColors[variant];
  const inactive = disabled || loading;
  const resolve = (token: ColorToken | 'transparent') => (token === 'transparent' ? 'transparent' : colors[token]);

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' ? styles.lg : styles.md,
        fullWidth && styles.fullWidth,
        {
          backgroundColor: resolve(pressed ? v.pressed : v.bg),
          borderColor: v.border ? colors[v.border] : 'transparent',
          borderWidth: v.border ? 1 : 0,
          opacity: disabled && !loading ? 0.45 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={colors[v.fg]} />
      ) : (
        <View style={styles.content}>
          {icon ? <Ionicons name={icon} size={20} color={colors[v.fg]} /> : null}
          <AppText variant="bodyStrong" color={v.fg} align="center" numberOfLines={1}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  lg: { minHeight: 54 },
  md: { minHeight: MIN_TOUCH - 4 },
  fullWidth: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
