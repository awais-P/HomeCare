import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppText, Badge } from '@homecare/shared/ui';
import { useRowDirection } from '@homecare/shared/i18n';
import { radius, spacing, useColors, type ColorToken } from '@homecare/shared/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type ServiceTileProps = {
  title: string;
  caption?: string;
  icon: IconName;
  /** Background tint and icon colour. */
  tint: ColorToken;
  color: ColorToken;
  /** feature = big tile with caption; compact = one-line tile with the icon beside the title. */
  variant?: 'feature' | 'compact';
  badge?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

/** A colourful tappable tile for one service on the Home sheet. */
export function ServiceTile({ title, caption, icon, tint, color, variant = 'compact', badge, onPress, style }: ServiceTileProps) {
  const colors = useColors();
  const row = useRowDirection();
  const badgeTone = color === 'sauda' || color === 'ustaad' ? color : 'primary';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, caption, badge].filter(Boolean).join('. ')}
      style={({ pressed }) => [
        styles.tile,
        variant === 'feature' ? styles.feature : [styles.compact, { flexDirection: row }],
        { backgroundColor: colors[tint], opacity: pressed ? 0.85 : 1 },
        style,
      ]}>
      {variant === 'feature' ? (
        <>
          <View style={styles.text}>
            <AppText variant="heading" numberOfLines={1}>
              {title}
            </AppText>
            {caption ? (
              <AppText variant="small" color="textMuted" numberOfLines={3}>
                {caption}
              </AppText>
            ) : null}
            {badge ? (
              <View style={styles.badgeRow}>
                <Badge label={badge} tone={badgeTone} />
              </View>
            ) : null}
          </View>
          <View style={styles.featureIcon}>
            <Ionicons name={icon} size={52} color={colors[color]} />
          </View>
        </>
      ) : (
        <>
          <Ionicons name={icon} size={26} color={colors[color]} />
          <AppText variant="label" numberOfLines={1} style={styles.shrink}>
            {title}
          </AppText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: radius.lg, padding: spacing.md, overflow: 'hidden' },
  feature: { minHeight: 172, justifyContent: 'space-between' },
  compact: { minHeight: 56, alignItems: 'center', gap: spacing.sm },
  text: { gap: spacing.xs },
  badgeRow: { flexDirection: 'row', marginTop: spacing.xxs },
  featureIcon: { alignSelf: 'flex-end' },
  shrink: { flexShrink: 1 },
});
