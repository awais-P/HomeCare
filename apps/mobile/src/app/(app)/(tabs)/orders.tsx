import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState, type ComponentProps } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useI18n, useRowDirection } from '@homecare/shared/i18n';
import { isJobOpen, JOB_STATUS_KEY, jobTotal, TRADE_ICON, TRADE_KEY } from '@homecare/shared/jobs';
import type { Order, UstaadJob } from '@homecare/shared/lib';
import { CATEGORY_ICON, CATEGORY_KEY, formatRupees, isOpen, STATUS_KEY } from '@homecare/shared/orders';
import { spacing, useColors, type ColorToken } from '@homecare/shared/theme';
import { AppText, Badge, Button, Card, EmptyState, IconCircle, InlineMessage } from '@homecare/shared/ui';

import { listMyJobs } from '@/features/jobs/api';
import { listMyOrders } from '@/features/orders/api';

/** One row in the list: a Sauda Run order or an ustaad booking. */
type Item = {
  key: string;
  href: Href;
  open: boolean;
  createdAt: string;
  title: string;
  caption: string;
  status: string;
  tone: 'primary' | 'sauda' | 'ustaad' | 'danger';
  icon: ComponentProps<typeof Ionicons>['name'];
  tint: ColorToken;
  color: ColorToken;
  total: number | null;
};

const day = (iso: string) => new Date(iso).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' });

export default function OrdersScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const [items, setItems] = useState<Item[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [orders, jobs] = await Promise.all([listMyOrders(), listMyJobs()]);
      const fromOrders = orders.map((o: Order): Item => ({
        key: `o-${o.id}`,
        href: { pathname: '/order/[id]', params: { id: o.id } },
        open: isOpen(o.status),
        createdAt: o.created_at,
        title: o.voice_note_path && o.items_text === 'Voice note' ? t('voice.note') : o.items_text,
        caption: `${t(CATEGORY_KEY[o.category])} · ${o.code} · ${day(o.created_at)}`,
        status: t(STATUS_KEY[o.status]),
        tone: o.status === 'cancelled' ? 'danger' : o.status === 'delivered' ? 'primary' : 'sauda',
        icon: CATEGORY_ICON[o.category],
        tint: 'saudaSoft',
        color: 'sauda',
        total: o.item_cost != null && o.delivery_fee != null ? o.item_cost + o.delivery_fee : null,
      }));
      const fromJobs = jobs.map((j: UstaadJob): Item => ({
        key: `j-${j.id}`,
        href: { pathname: '/job/[id]', params: { id: j.id } },
        open: isJobOpen(j.status),
        createdAt: j.created_at,
        title: j.problem_text,
        caption: `${t(TRADE_KEY[j.trade])} · ${j.code} · ${day(j.created_at)}`,
        status: t(JOB_STATUS_KEY[j.status]),
        tone: j.status === 'cancelled' ? 'danger' : j.status === 'completed' || j.status === 'visit_only' ? 'primary' : 'ustaad',
        icon: TRADE_ICON[j.trade],
        tint: 'ustaadSoft',
        color: 'ustaad',
        total: j.status === 'visit_only' ? j.amount_due : jobTotal(j),
      }));
      setItems([...fromOrders, ...fromJobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [t]);

  // Reload whenever the tab is opened.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const active = items.filter((i) => i.open);
  const past = items.filter((i) => !i.open);

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
        <View style={styles.actions}>
          <Button label={t('order.new.title')} icon="bag-add-outline" onPress={() => router.push('/order/new')} />
          <Button label={t('ustaad.book')} icon="construct-outline" variant="secondary" onPress={() => router.push('/job/new')} />
        </View>

        {state === 'error' ? <InlineMessage tone="error" message={t('errors.generic')} /> : null}
        {state === 'ready' && items.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState icon="receipt-outline" title={t('orders.emptyTitle')} body={t('orders.emptyBody')} />
          </View>
        ) : null}

        {active.length ? <Section title={t('orders.active')} items={active} /> : null}
        {past.length ? <Section title={t('orders.past')} items={past} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, items }: { title: string; items: Item[] }) {
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  return (
    <View style={styles.section}>
      <AppText variant="label" color="textMuted">
        {title}
      </AppText>
      {items.map((item) => (
        <Card
          key={item.key}
          onPress={() => router.push(item.href)}
          accessibilityLabel={`${item.title} ${item.status}`}
          style={[styles.item, { flexDirection: row }]}>
          <IconCircle icon={item.icon} tint={item.tint} color={item.color} size={44} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {item.title}
            </AppText>
            <AppText variant="caption" color="textMuted">
              {item.caption}
            </AppText>
            <View style={[styles.meta, { flexDirection: row }]}>
              <Badge label={item.status} tone={item.tone} />
              {item.total != null ? (
                <AppText variant="small" color="textMuted">
                  {t('common.rupees', { amount: formatRupees(item.total) })}
                </AppText>
              ) : null}
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.xl, gap: spacing.lg },
  actions: { gap: spacing.sm },
  empty: { minHeight: 280 },
  section: { gap: spacing.sm },
  item: { alignItems: 'center', gap: spacing.md },
  meta: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
});
