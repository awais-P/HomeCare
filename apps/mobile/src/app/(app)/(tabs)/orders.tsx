import { StyleSheet, View } from 'react-native';

import { AppText, EmptyState, Screen } from '@/components/ui';
import { useI18n } from '@/i18n/i18n-provider';
import { spacing } from '@/theme';

export default function OrdersScreen() {
  const { t } = useI18n();
  return (
    <Screen edges={['top']} scroll={false}>
      <View style={styles.header}>
        <AppText variant="title">{t('orders.title')}</AppText>
      </View>
      <EmptyState icon="receipt-outline" title={t('orders.emptyTitle')} body={t('orders.emptyBody')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: spacing.lg },
});
