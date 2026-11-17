import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { useRowDirection } from '../i18n/i18n-provider';
import { radius, spacing, useColors } from '../theme';

import { AppText } from './app-text';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** A row of pill buttons where exactly one is selected (e.g. Home / Work / Parents / Other). */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const row = useRowDirection();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel} style={[styles.chips, { flexDirection: row }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            aria-checked={selected}
            aria-selected={selected}
            style={({ pressed }) => [
              styles.chip,
              {
                flexDirection: row,
                backgroundColor: selected ? colors.primarySoft : pressed ? colors.surfaceAlt : colors.surface,
                borderColor: selected ? colors.primary : colors.border,
              },
            ]}>
            {option.icon ? (
              <Ionicons name={option.icon} size={16} color={selected ? colors.primary : colors.textMuted} />
            ) : null}
            <AppText variant="label" color={selected ? 'primary' : 'text'} align="center">
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Pill buttons where any number can be selected (e.g. an ustaad's trades). */
export function MultiChoiceChips<T extends string>({
  options,
  values,
  onChange,
  accessibilityLabel,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  values: T[];
  onChange: (values: T[]) => void;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const row = useRowDirection();
  return (
    <View accessibilityLabel={accessibilityLabel} style={[styles.chips, { flexDirection: row }]}>
      {options.map((option) => {
        const selected = values.includes(option.value);
        return (
          <Pressable
            key={option.value}
            onPress={() =>
              onChange(selected ? values.filter((v) => v !== option.value) : [...values, option.value])
            }
            accessibilityRole="checkbox"
            aria-checked={selected}
            style={({ pressed }) => [
              styles.chip,
              {
                flexDirection: row,
                backgroundColor: selected ? colors.primarySoft : pressed ? colors.surfaceAlt : colors.surface,
                borderColor: selected ? colors.primary : colors.border,
              },
            ]}>
            <Ionicons
              name={selected ? 'checkmark-circle' : (option.icon ?? 'ellipse-outline')}
              size={16}
              color={selected ? colors.primary : colors.textMuted}
            />
            <AppText variant="label" color={selected ? 'primary' : 'text'} align="center">
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A label (+ optional hint) with an on/off switch. */
export function ToggleRow({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const colors = useColors();
  const row = useRowDirection();
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      aria-checked={value}
      accessibilityLabel={label}
      style={[styles.toggle, { flexDirection: row }]}>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{label}</AppText>
        {hint ? (
          <AppText variant="caption" color="textMuted">
            {hint}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.borderStrong, true: colors.primary }}
        thumbColor={colors.surface}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    alignItems: 'center',
    gap: spacing.xs + 2,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  toggle: { alignItems: 'center', gap: spacing.md, minHeight: 56 },
});
