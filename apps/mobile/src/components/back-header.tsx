import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '@/i18n/i18n-provider';
import { spacing } from '@/theme';

import { AppText, IconButton } from './ui';

/** Top bar with a back button, an optional title and an optional right-side slot. */
export function BackHeader({ title, right, onBack }: { title?: string; right?: ReactNode; onBack?: () => void }) {
  const { t, isRTL } = useI18n();
  return (
    <View style={[styles.row, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
      <IconButton icon={isRTL ? 'arrow-forward' : 'arrow-back'} accessibilityLabel={t('common.back')} onPress={onBack ?? (() => router.back())} />
      <View style={styles.title}>
        {title ? (
          <AppText variant="heading" align="center" numberOfLines={1}>
            {title}
          </AppText>
        ) : null}
      </View>
      <View style={styles.side}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
  title: { flex: 1 },
  side: { minWidth: 48 },
});
