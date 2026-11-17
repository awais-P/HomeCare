import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n, useRowDirection } from '@homecare/shared/i18n';
import type { Order } from '@homecare/shared/lib';
import { CATEGORY_ICON, CATEGORY_KEY, formatRupees, isOpen, STATUS_KEY } from '@homecare/shared/orders';
import { spacing, useColors } from '@homecare/shared/theme';
import { AppText, Badge, Button, Card, EmptyState, IconCircle, InlineMessage } from '@homecare/shared/ui';

import { listMyOrders } from '@/features/orders/api';

export default function OrdersScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const [orders, setOrders] = useState<Order[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrders(await listMyOrders());
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  // Reload whenever the tab is opened.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const active = orders.filter((o) => isOpen(o.status));
  const past = orders.filter((o) => !isOpen(o.status));

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }>
        <AppText variant="title">{t('orders.title')}</AppText>
        <Button label={t('order.new.title')} icon="bag-add-outline" onPress={() => router.push('/order/new')} />

        {state === 'error' ? <InlineMessage tone="error" message={t('errors.generic')} /> : null}
        {state === 'ready' && orders.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState icon="receipt-outline" title={t('orders.emptyTitle')} body={t('orders.emptyBody')} />
          </View>
        ) : null}

        {active.length ? <Section title={t('orders.active')} orders={active} /> : null}
        {past.length ? <Section title={t('orders.past')} orders={past} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, orders }: { title: string; orders: Order[] }) {
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  return (
    <View style={styles.section}>
      <AppText variant="label" color="textMuted">
        {title}
      </AppText>
      {orders.map((order) => {
        const total = order.item_cost != null && order.delivery_fee != null ? order.item_cost + order.delivery_fee : null;
        return (
          <Card
            key={order.id}
            onPress={() => router.push({ pathname: '/order/[id]', params: { id: order.id } })}
            accessibilityLabel={`${order.code} ${t(STATUS_KEY[order.status])}`}
            style={[styles.item, { flexDirection: row }]}>
            <IconCircle icon={CATEGORY_ICON[order.category]} tint="saudaSoft" color="sauda" size={44} />
            <View style={styles.flex}>
              <AppText variant="bodyStrong" numberOfLines={1}>
                {order.items_text}
              </AppText>
              <AppText variant="caption" color="textMuted">
                {t(CATEGORY_KEY[order.category])} · {order.code} ·{' '}
                {new Date(order.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
              </AppText>
              <View style={[styles.meta, { flexDirection: row }]}>
                <Badge label={t(STATUS_KEY[order.status])} tone={order.status === 'cancelled' ? 'danger' : order.status === 'delivered' ? 'primary' : 'sauda'} />
                {total != null ? (
                  <AppText variant="small" color="textMuted">
                    {t('common.rupees', { amount: formatRupees(total) })}
                  </AppText>
                ) : null}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg },
  empty: { minHeight: 280 },
  section: { gap: spacing.sm },
  item: { alignItems: 'center', gap: spacing.md },
  meta: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
});
