import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '@/i18n/i18n-provider';
import { MIN_TOUCH, radius, spacing, useColors, type ColorToken } from '@/theme';

import { AppText } from './app-text';

type IconName = ComponentProps<typeof Ionicons>['name'];

/* ------------------------------------------------------------------ IconButton */

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  color = 'text',
}: {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  color?: ColorToken;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.surfaceAlt }]}>
      <Ionicons name={icon} size={24} color={colors[color]} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ Chip / Badge */

export function Chip({ label, tint = 'surfaceAlt', textColor = 'textMuted' }: { label: string; tint?: ColorToken; textColor?: ColorToken }) {
  const colors = useColors();
  return (
    <View style={[styles.chip, { backgroundColor: colors[tint] }]}>
      <AppText variant="small" color={textColor} align="center">
        {label}
      </AppText>
    </View>
  );
}

export function Badge({ label, tone = 'primary' }: { label: string; tone?: 'primary' | 'sauda' | 'ustaad' | 'danger' }) {
  const colors = useColors();
  const soft = `${tone}Soft` as ColorToken;
  return (
    <View style={[styles.badge, { backgroundColor: colors[soft] }]}>
      <AppText variant="small" color={tone} align="center">
        {label}
      </AppText>
    </View>
  );
}

/* ------------------------------------------------------------------ IconCircle */

export function IconCircle({
  icon,
  tint = 'primarySoft',
  color = 'primary',
  size = 48,
}: {
  icon: IconName;
  tint?: ColorToken;
  color?: ColorToken;
  size?: number;
}) {
  const colors = useColors();
  return (
    <View style={[styles.iconCircle, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors[tint] }]}>
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={colors[color]} />
    </View>
  );
}

/* ------------------------------------------------------------------ Avatar */

export function Avatar({ name, size = 56 }: { name?: string | null; size?: number }) {
  const colors = useColors();
  const initials =
    (name ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?';
  return (
    <View style={[styles.iconCircle, { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft }]}>
      <AppText variant="heading" color="primary" align="center" style={{ fontSize: size * 0.38, lineHeight: size * 0.5 }}>
        {initials}
      </AppText>
    </View>
  );
}

/* ------------------------------------------------------------------ BrandMark */

export function BrandMark({ size = 64, showName = true, name }: { size?: number; showName?: boolean; name?: string }) {
  const colors = useColors();
  return (
    <View style={styles.brand}>
      <View style={[styles.brandIcon, { width: size, height: size, borderRadius: size * 0.28, backgroundColor: colors.primary }]}>
        <Ionicons name="home" size={size * 0.52} color={colors.onPrimary} />
      </View>
      {showName ? (
        <AppText variant="title" align="center">
          {name ?? 'HomeCare'}
        </AppText>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ InlineMessage */

const toneIcon: Record<'error' | 'info' | 'success', IconName> = {
  error: 'alert-circle',
  info: 'information-circle',
  success: 'checkmark-circle',
};

export function InlineMessage({ tone = 'info', message }: { tone?: 'error' | 'info' | 'success'; message: string }) {
  const colors = useColors();
  const fg: ColorToken = tone === 'error' ? 'danger' : tone === 'success' ? 'success' : 'primary';
  const bg: ColorToken = tone === 'error' ? 'dangerSoft' : tone === 'success' ? 'successSoft' : 'primarySoft';
  const { isRTL } = useI18n();
  return (
    <View style={[styles.inline, { flexDirection: isRTL ? 'row-reverse' : 'row', backgroundColor: colors[bg] }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Ionicons name={toneIcon[tone]} size={20} color={colors[fg]} />
      <AppText variant="caption" color={tone === 'info' ? 'text' : fg} style={styles.flex}>
        {message}
      </AppText>
    </View>
  );
}

/* ------------------------------------------------------------------ EmptyState */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <IconCircle icon={icon} size={72} />
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      {body ? (
        <AppText color="textMuted" align="center">
          {body}
        </AppText>
      ) : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ ListItem */

export function ListItem({
  icon,
  title,
  subtitle,
  value,
  onPress,
  destructive = false,
  disabled = false,
  showChevron = true,
  style,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  showChevron?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const fg: ColorToken = destructive ? 'danger' : 'text';
  const { isRTL } = useI18n();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || disabled}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.listItem, { flexDirection: isRTL ? 'row-reverse' : 'row' }, pressed && { backgroundColor: colors.surfaceAlt }, disabled && { opacity: 0.5 }, style]}>
      {icon ? <Ionicons name={icon} size={22} color={colors[destructive ? 'danger' : 'textMuted']} /> : null}
      <View style={styles.flex}>
        <AppText variant="bodyStrong" color={fg}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="textMuted">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {typeof value === 'string' ? (
        <AppText variant="caption" color="textMuted">
          {value}
        </AppText>
      ) : (
        value
      )}
      {onPress && showChevron ? <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={colors.textSubtle} /> : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ SegmentedControl */

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.segmented, { backgroundColor: colors.surfaceAlt }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
            <AppText variant="label" color={selected ? 'text' : 'textMuted'} align="center">
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ Divider */

export function Divider({ inset = 0 }: { inset?: number }) {
  const colors = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: inset }} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  iconButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.pill },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs + 1, borderRadius: radius.pill },
  iconCircle: { alignItems: 'center', justifyContent: 'center' },
  brand: { alignItems: 'center', gap: spacing.md },
  brandIcon: { alignItems: 'center', justifyContent: 'center' },
  inline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  empty: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, flex: 1 },
  emptyAction: { marginTop: spacing.sm, alignSelf: 'stretch' },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: spacing.xs, gap: spacing.xs },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
});
