import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet } from 'react-native';

import { useI18n } from '@/i18n/i18n-provider';
import type { AppLanguage } from '@/lib/database.types';
import { radius, spacing, useColors } from '@/theme';

import { AppText } from './ui';

/** Small pill that switches between English and Urdu, labelled with the *other* language. */
export function LanguageToggle({ onChange }: { onChange?: (language: AppLanguage) => void }) {
  const { language, setLanguage, t } = useI18n();
  const colors = useColors();
  const next: AppLanguage = language === 'en' ? 'ur' : 'en';

  return (
    <Pressable
      onPress={() => {
        setLanguage(next);
        onChange?.(next);
      }}
      accessibilityRole="button"
      accessibilityLabel={t(`lang.${next}`)}
      hitSlop={8}
      style={({ pressed }) => [
        styles.pill,
        { borderColor: colors.border, backgroundColor: pressed ? colors.surfaceAlt : colors.surface },
      ]}>
      <Ionicons name="language" size={16} color={colors.textMuted} />
      <AppText variant="label" color="text" align="center">
        {t(`lang.${next}`)}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
