import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Badge, Card, Chip, IconCircle } from '@/components/ui';
import { useRowDirection } from '@/i18n/i18n-provider';
import { spacing } from '@/theme';

type Tone = 'sauda' | 'ustaad';

export type ServiceCardProps = {
  tone: Tone;
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  tags: string[];
  badge?: string;
  onPress?: () => void;
};

/** Big tappable card for one of the two services (Sauda Run / Ustaad). */
export function ServiceCard({ tone, icon, title, body, tags, badge, onPress }: ServiceCardProps) {
  const row = useRowDirection();
  return (
    <Card onPress={onPress} accessibilityLabel={title} style={styles.card}>
      <View style={[styles.top, { flexDirection: row }]}>
        <IconCircle icon={icon} tint={`${tone}Soft`} color={tone} size={52} />
        {badge ? <Badge label={badge} tone={tone} /> : null}
      </View>
      <View style={styles.text}>
        <AppText variant="heading">{title}</AppText>
        <AppText variant="caption" color="textMuted">
          {body}
        </AppText>
      </View>
      <View style={[styles.tags, { flexDirection: row }]}>
        {tags.map((tag) => (
          <Chip key={tag} label={tag} />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  text: { gap: spacing.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
