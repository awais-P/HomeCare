import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { errorMessageKey } from '@homecare/shared/auth';
import { useI18n, useRowDirection } from '@homecare/shared/i18n';
import type { Order, OrderEvent } from '@homecare/shared/lib';
import { CATEGORY_ICON, CATEGORY_KEY, formatRupees, ORDER_STEPS, STATUS_ICON, STATUS_KEY } from '@homecare/shared/orders';
import { radius, spacing, useColors } from '@homecare/shared/theme';
import { AppText, BackHeader, Button, Card, Divider, IconCircle, InlineMessage, Screen } from '@homecare/shared/ui';

import { cancelOrder, cancellationFee, getContact, getOrder, orderErrorKey, photoUrls, rateOrder } from '@/features/orders/api';

const REFRESH_MS = 15_000;

/** One order: live status, list, address, payment, rider contact, cancel and rating. */
export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const [order, setOrder] = useState<Order | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [contact, setContact] = useState<{ name: string | null; phone: string | null } | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelFee, setCancelFee] = useState(0);

  useEffect(() => {
    let active = true;
    cancellationFee().then((fee) => {
      if (active) setCancelFee(fee);
    });
    return () => {
      active = false;
    };
  }, []);

  const [reloadToken, setReloadToken] = useState(0);
  const load = useCallback(() => setReloadToken((n) => n + 1), []);

  // Status updates arrive by polling for now (realtime comes in Phase 6).
  useEffect(() => {
    let active = true;
    const fetchOrder = async () => {
      try {
        const result = await getOrder(id);
        if (!active) return;
        setOrder(result.order);
        setEvents(result.events);
        setState('ready');
        if (result.order) {
          const o = result.order;
          const nextContact = ['accepted', 'at_shop', 'on_the_way'].includes(o.status) ? await getContact(o.id) : null;
          const paths = [...o.photo_paths, ...(o.bill_photo_path ? [o.bill_photo_path] : [])];
          const nextUrls = paths.length ? await photoUrls(paths) : {};
          if (!active) return;
          setContact(nextContact);
          setUrls(nextUrls);
        }
      } catch {
        if (active) setState('error');
      }
    };
    void fetchOrder();
    const timer = setInterval(() => void fetchOrder(), REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, reloadToken]);

  if (state === 'loading' || !order) {
    return (
      <Screen header={<BackHeader title={t('orders.title')} />} scroll={false}>
        {state === 'error' || (state === 'ready' && !order) ? (
          <InlineMessage tone="error" message={t('errors.generic')} />
        ) : (
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        )}
      </Screen>
    );
  }

  const cancelled = order.status === 'cancelled';
  const stepIndex = ORDER_STEPS.indexOf(order.status);
  const fee = order.delivery_fee;
  const total = order.item_cost != null && fee != null ? order.item_cost + fee : null;

  const confirmCancel = () => {
    if (order.status === 'at_shop' || order.status === 'on_the_way') {
      Alert.alert(t('order.detail.cancel'), t('order.detail.cancelSupport'));
      return;
    }
    const body = order.status === 'accepted' ? t('order.detail.cancelFee', { fee: cancelFee }) : t('order.detail.cancelFree');
    Alert.alert(t('order.detail.cancelConfirm'), body, [
      { text: t('common.back'), style: 'cancel' },
      {
        text: t('order.detail.cancel'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            setOrder(await cancelOrder(order.id));
            load();
          } catch (e) {
            setMessage(t(orderErrorKey(e) ?? errorMessageKey(e)));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const rate = async (stars: number) => {
    setBusy(true);
    try {
      setOrder(await rateOrder(order.id, stars));
    } catch (e) {
      setMessage(t(errorMessageKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen header={<BackHeader title={t('order.detail.title', { code: order.code })} />}>
      <View style={styles.content}>
        {/* Status */}
        <Card style={styles.statusCard}>
          <View style={[styles.rowCenter, { flexDirection: row }]}>
            <IconCircle
              icon={STATUS_ICON[order.status]}
              size={52}
              tint={cancelled ? 'dangerSoft' : order.status === 'delivered' ? 'successSoft' : 'saudaSoft'}
              color={cancelled ? 'danger' : order.status === 'delivered' ? 'success' : 'sauda'}
            />
            <View style={styles.flex}>
              <AppText variant="heading">{t(STATUS_KEY[order.status])}</AppText>
              <AppText variant="caption" color="textMuted">
                {t('order.detail.updates')}
              </AppText>
            </View>
          </View>
          {!cancelled ? (
            <View style={styles.steps}>
              {ORDER_STEPS.map((step, i) => {
                const done = i <= stepIndex;
                const at = events.find((e) => e.to_status === step)?.created_at;
                return (
                  <View key={step} style={[styles.rowCenter, { flexDirection: row }]}>
                    <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={done ? colors.success : colors.textSubtle} />
                    <AppText variant="caption" color={done ? 'text' : 'textSubtle'} style={styles.flex}>
                      {t(STATUS_KEY[step])}
                    </AppText>
                    {at ? (
                      <AppText variant="small" color="textSubtle">
                        {new Date(at).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' })}
                      </AppText>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : order.cancel_reason ? (
            <AppText variant="caption" color="textMuted">
              {order.cancel_reason}
            </AppText>
          ) : null}
        </Card>

        {/* Rider contact */}
        {contact?.phone ? (
          <Card style={[styles.rowCenter, { flexDirection: row }]}>
            <IconCircle icon="person" size={44} />
            <View style={styles.flex}>
              <AppText variant="caption" color="textMuted">
                {t('order.detail.rider')}
              </AppText>
              <AppText variant="bodyStrong">{contact.name ?? ''}</AppText>
            </View>
            <Button label={t('order.detail.call')} icon="call" size="md" fullWidth={false} onPress={() => void Linking.openURL(`tel:${contact.phone}`)} />
          </Card>
        ) : null}

        {/* The list */}
        <Card style={styles.block}>
          <View style={[styles.rowCenter, { flexDirection: row }]}>
            <Ionicons name={CATEGORY_ICON[order.category]} size={20} color={colors.sauda} />
            <AppText variant="label" color="textMuted">
              {t(CATEGORY_KEY[order.category])} · {t('order.detail.items')}
            </AppText>
          </View>
          <AppText>{order.items_text}</AppText>
          {order.photo_paths.length ? (
            <View style={[styles.photos, { flexDirection: row }]}>
              {order.photo_paths.map((p) =>
                urls[p] ? <Image key={p} source={{ uri: urls[p] }} style={styles.photo} contentFit="cover" /> : null,
              )}
            </View>
          ) : null}
          <Divider />
          <AppText variant="caption" color="textMuted">
            {t('order.detail.shop')}: {order.shop_preference ?? t('order.detail.nearestShop')}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {t('order.detail.deliverTo')}: {order.delivery_text}
          </AppText>
        </Card>

        {/* Payment */}
        <Card style={styles.block}>
          <AppText variant="label" color="textMuted">
            {t('order.detail.payment')}
          </AppText>
          <PayRow label={t('order.detail.itemCost')} value={order.item_cost != null ? t('common.rupees', { amount: formatRupees(order.item_cost) }) : t('order.detail.pending')} />
          <PayRow
            label={t('order.detail.deliveryFee')}
            value={fee != null ? t('common.rupees', { amount: formatRupees(fee) }) : t('order.detail.estimated', { fee: order.estimated_fee })}
          />
          {order.cancellation_fee > 0 ? (
            <PayRow label={t('order.detail.cancellationFee')} value={t('common.rupees', { amount: formatRupees(order.cancellation_fee) })} />
          ) : null}
          {total != null ? (
            <>
              <Divider />
              <PayRow label={t('order.detail.total')} value={t('common.rupees', { amount: formatRupees(total) })} strong />
            </>
          ) : null}
          {order.bill_photo_path && urls[order.bill_photo_path] ? (
            <Pressable onPress={() => void Linking.openURL(urls[order.bill_photo_path!])} accessibilityRole="link">
              <Image source={{ uri: urls[order.bill_photo_path] }} style={[styles.bill, { borderColor: colors.border }]} contentFit="cover" />
              <AppText variant="caption" color="primary">
                {t('order.detail.viewBill')}
              </AppText>
            </Pressable>
          ) : null}
        </Card>

        {/* Rating */}
        {order.status === 'delivered' ? (
          <Card style={styles.block}>
            <AppText variant="bodyStrong">
              {order.rating ? t('order.detail.rated', { stars: order.rating }) : t('order.detail.rate')}
            </AppText>
            {!order.rating ? (
              <View style={[styles.stars, { flexDirection: row }]}>
                {[1, 2, 3, 4, 5].map((stars) => (
                  <Pressable key={stars} disabled={busy} onPress={() => void rate(stars)} accessibilityRole="button" accessibilityLabel={`${stars}`}>
                    <Ionicons name="star" size={34} color={colors.sauda} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Card>
        ) : null}

        {message ? <InlineMessage tone="error" message={message} /> : null}

        {order.status === 'requested' || order.status === 'accepted' ? (
          <Button label={t('order.detail.cancel')} variant="danger" icon="close-circle-outline" loading={busy} onPress={confirmCancel} />
        ) : null}
      </View>
    </Screen>
  );
}

function PayRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  const row = useRowDirection();
  return (
    <View style={[styles.payRow, { flexDirection: row }]}>
      <AppText variant={strong ? 'bodyStrong' : 'body'} style={styles.flex}>
        {label}
      </AppText>
      <AppText variant={strong ? 'bodyStrong' : 'body'}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: spacing.xxxl },
  content: { gap: spacing.lg },
  statusCard: { gap: spacing.lg },
  rowCenter: { alignItems: 'center', gap: spacing.md },
  steps: { gap: spacing.sm },
  block: { gap: spacing.sm },
  photos: { flexWrap: 'wrap', gap: spacing.sm },
  photo: { width: 72, height: 72, borderRadius: radius.md },
  payRow: { alignItems: 'center', gap: spacing.md },
  bill: { width: '100%', height: 160, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.xs },
  stars: { gap: spacing.sm },
});
