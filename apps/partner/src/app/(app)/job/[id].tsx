import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, View } from 'react-native';

import { VoiceNotePlayer } from '@homecare/shared/audio';
import { ChatButton } from '@homecare/shared/chat';
import { errorMessageKey } from '@homecare/shared/auth';
import { useI18n, useRowDirection } from '@homecare/shared/i18n';
import type { Order, Substitution } from '@homecare/shared/lib';
import { getDeviceLocation } from '@homecare/shared/location';
import { pickPhoto } from '@homecare/shared/media';
import { CATEGORY_ICON, CATEGORY_KEY, formatRupees, STATUS_KEY, SUBSTITUTION_STATUS_KEY, useOrderLive } from '@homecare/shared/orders';
import { SafetyActions } from '@homecare/shared/safety';
import { radius, spacing, useColors } from '@homecare/shared/theme';
import { AppText, BackHeader, Badge, Button, Card, Divider, IconCircle, InlineMessage, Screen, TextField } from '@homecare/shared/ui';

import { advanceOrder, cashLimit, fileUrls, getCustomerContact, getOrder, listSubstitutions, releaseOrder, uploadBill } from '@/features/partner/jobs';
import { SubstitutionForm } from '@/features/partner/substitution-form';

/** Backup refresh; the customer's answers normally arrive instantly through Realtime. */
const REFRESH_MS = 15_000;

/** The rider's current order, one step at a time. */
export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const [order, setOrder] = useState<Order | null>(null);
  const [contact, setContact] = useState<{ name: string | null; phone: string | null } | null>(null);
  const [limit, setLimit] = useState(5000);
  const [bill, setBill] = useState('');
  const [billPath, setBillPath] = useState<string | null>(null);
  const [billPreview, setBillPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [subs, setSubs] = useState<Substitution[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);
  useOrderLive(id ?? null, reload);

  useEffect(() => {
    let active = true;
    const fetchJob = async () => {
      const [o, c, l, s] = await Promise.all([getOrder(id), getCustomerContact(id), cashLimit(), listSubstitutions(id)]);
      const photoPaths = s.flatMap((x) => (x.photo_path ? [x.photo_path] : []));
      const nextUrls = await fileUrls(photoPaths);
      if (!active) return;
      setOrder(o);
      setContact(c);
      setLimit(l);
      setSubs(s);
      setUrls(nextUrls);
    };
    fetchJob().catch(() => {
      if (active) setError(t('errors.generic'));
    });
    const timer = setInterval(() => void fetchJob().catch(() => undefined), REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, reloadToken, t]);

  // The voice note gets its own link once, so playback isn't interrupted by the refreshes.
  const voicePath = order?.voice_note_path ?? null;
  useEffect(() => {
    if (!voicePath) return;
    let active = true;
    fileUrls([voicePath]).then((map) => {
      if (active) setVoiceUrl(map[voicePath] ?? null);
    });
    return () => {
      active = false;
    };
  }, [voicePath]);

  if (!order) {
    return (
      <Screen header={<BackHeader title={t('job.title')} />} scroll={false}>
        {error ? <InlineMessage tone="error" message={error} /> : <ActivityIndicator style={styles.loading} color={colors.primary} />}
      </Screen>
    );
  }

  const run = async (action: () => Promise<Order | void>) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await action();
      if (updated) setOrder(updated);
      reload();
    } catch (e) {
      const msg = (e as { message?: string }).message ?? '';
      if (msg.includes('cash_limit_exceeded')) setError(t('job.cashLimit', { limit: formatRupees(limit) }));
      else if (msg.includes('bill_required')) setError(t('job.billRequired'));
      else if (msg.includes('location_required')) setError(t('partner.home.locationNeeded'));
      else setError(t(errorMessageKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const arrived = () =>
    run(async () => {
      const location = await getDeviceLocation();
      if (location.status !== 'ok') throw new Error('location_required');
      return advanceOrder(order.id, 'at_shop', { lat: location.coordinate.latitude, lng: location.coordinate.longitude });
    });

  const takeBillPhoto = async () => {
    const result = await pickPhoto('camera', { allowsEditing: true });
    if (result.status === 'denied') {
      setError(t('partner.docs.cameraDenied'));
      return;
    }
    if (result.status !== 'ok') return;
    await run(async () => {
      setBillPath(await uploadBill(order.id, result.photo));
      setBillPreview(`data:${result.photo.mimeType};base64,${result.photo.base64}`);
    });
  };

  const billAmount = Number(bill.replace(/\D/g, ''));
  const pendingSubs = subs.filter((s) => s.status === 'pending');
  const leaveShop = () =>
    run(async () => {
      if (!billAmount || !billPath) throw new Error('bill_required');
      return advanceOrder(order.id, 'on_the_way', { itemCost: billAmount, billPhotoPath: billPath });
    });
  const onTheWay = () => {
    if (!pendingSubs.length) {
      void leaveShop();
      return;
    }
    Alert.alert(t('subs.leaveTitle'), t('subs.leaveBody', { count: pendingSubs.length }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('subs.leave'), style: 'destructive', onPress: () => void leaveShop() },
    ]);
  };
  const question = (s: Substitution) =>
    s.suggestion ? t('subs.askReplace', { item: s.item, suggestion: s.suggestion }) : t('subs.askSkip', { item: s.item });

  const delivered = () => run(() => advanceOrder(order.id, 'delivered'));

  const release = () =>
    Alert.alert(t('job.release'), t('job.releaseConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('job.release'),
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await releaseOrder(order.id);
            router.back();
          }),
      },
    ]);

  const openMaps = () =>
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${order.delivery_latitude},${order.delivery_longitude}`);

  const fee = order.delivery_fee;
  const total = order.item_cost != null && fee != null ? order.item_cost + fee : null;

  return (
    <Screen header={<BackHeader title={`${t('job.title')} · ${order.code}`} />}>
      <View style={styles.content}>
        <Card style={[styles.rowCenter, { flexDirection: row }]}>
          <IconCircle icon={CATEGORY_ICON[order.category]} tint="saudaSoft" color="sauda" size={48} />
          <View style={styles.flex}>
            <AppText variant="heading">{t(CATEGORY_KEY[order.category])}</AppText>
            <Badge label={t(STATUS_KEY[order.status])} tone={order.status === 'cancelled' ? 'danger' : 'sauda'} />
          </View>
        </Card>

        {order.status === 'cancelled' ? <InlineMessage tone="error" message={t('job.cancelled')} /> : null}
        {order.status === 'delivered' ? <InlineMessage tone="success" message={t('job.done')} /> : null}

        <Card style={styles.block}>
          <AppText variant="label" color="textMuted">
            {t('order.detail.items')}
          </AppText>
          {order.voice_note_path ? <VoiceNotePlayer uri={voiceUrl} /> : null}
          {!(order.voice_note_path && order.items_text === 'Voice note') ? <AppText>{order.items_text}</AppText> : null}
          <AppText variant="caption" color="textMuted">
            {t('order.detail.shop')}: {order.shop_preference ?? t('order.detail.nearestShop')}
          </AppText>
          <Divider />
          <AppText variant="label" color="textMuted">
            {t('order.detail.deliverTo')}
          </AppText>
          <AppText>{order.delivery_text}</AppText>
          {order.instructions ? (
            <AppText variant="caption" color="textMuted">
              {order.instructions}
            </AppText>
          ) : null}
          <View style={[styles.actions, { flexDirection: row }]}>
            <Button style={styles.flex} label={t('job.navigate')} icon="navigate-outline" variant="outline" size="md" onPress={openMaps} />
            {contact?.phone ? (
              <Button
                style={styles.flex}
                label={`${t('order.detail.call')} ${contact.name ?? ''}`.trim()}
                icon="call"
                variant="secondary"
                size="md"
                onPress={() => void Linking.openURL(`tel:${contact.phone}`)}
              />
            ) : null}
          </View>
        </Card>

        {/* Step: at the shop */}
        {order.status === 'accepted' ? (
          <>
            <Button label={t('job.arrived')} icon="storefront-outline" loading={busy} onPress={() => void arrived()} />
            <Button label={t('job.release')} variant="ghost" size="md" onPress={release} />
          </>
        ) : null}

        <ChatButton thread={{ kind: 'order', id: order.id }} onPress={() => router.push({ pathname: '/chat/[kind]/[id]', params: { kind: 'order', id: order.id } })} />

        <SafetyActions
          thread={{ kind: 'order', id: order.id }}
          active={['accepted', 'at_shop', 'on_the_way'].includes(order.status)}
          onSos={() => router.push({ pathname: '/sos', params: { kind: 'order', id: order.id } })}
          onReport={() => router.push({ pathname: '/report/[kind]/[id]', params: { kind: 'order', id: order.id, code: order.code } })}
        />

        {/* Questions to the customer about missing items */}
        {subs.length ? (
          <Card style={styles.block}>
            <AppText variant="label" color="textMuted">
              {t('subs.mine')}
            </AppText>
            {subs.map((s) => (
              <View key={s.id} style={[styles.rowCenter, { flexDirection: row }]}>
                {s.photo_path && urls[s.photo_path] ? (
                  <Image source={{ uri: urls[s.photo_path] }} style={[styles.billThumb, { borderColor: colors.border }]} contentFit="cover" />
                ) : null}
                <View style={styles.flex}>
                  <AppText variant="caption">{question(s)}</AppText>
                  {s.price != null ? (
                    <AppText variant="small" color="textMuted">
                      {t('subs.price', { price: formatRupees(s.price) })}
                    </AppText>
                  ) : null}
                </View>
                <Badge
                  label={t(SUBSTITUTION_STATUS_KEY[s.status])}
                  tone={s.status === 'approved' ? 'primary' : s.status === 'declined' ? 'danger' : 'sauda'}
                />
              </View>
            ))}
          </Card>
        ) : null}
        {order.status === 'at_shop' ? <SubstitutionForm orderId={order.id} onSent={(s) => setSubs((prev) => [...prev, s])} /> : null}

        {/* Step: shopping done -> bill */}
        {order.status === 'at_shop' ? (
          <Card style={styles.block}>
            <TextField
              label={t('job.billAmount')}
              value={bill}
              onChangeText={(text) => setBill(text.replace(/\D/g, '').slice(0, 7))}
              keyboardType="number-pad"
              forceLTR
              placeholder="1200"
            />
            <AppText variant="caption" color="textMuted">
              {t('job.cashLimitHint', { limit: formatRupees(limit) })}
            </AppText>
            {billPreview ? (
              <View style={[styles.rowCenter, { flexDirection: row }]}>
                <Image source={{ uri: billPreview }} style={[styles.billThumb, { borderColor: colors.border }]} contentFit="cover" />
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <AppText variant="caption" color="success">
                  {t('job.billSaved')}
                </AppText>
              </View>
            ) : null}
            <Button label={billPath ? t('partner.docs.retake') : t('job.takeBill')} icon="camera" variant="outline" size="md" disabled={busy} onPress={() => void takeBillPhoto()} />
            <Button label={t('job.onTheWay')} icon="bicycle" loading={busy} disabled={!billAmount || !billPath} onPress={onTheWay} />
          </Card>
        ) : null}

        {/* Step: deliver and collect cash */}
        {order.status === 'on_the_way' && total != null && fee != null ? (
          <Card style={styles.block}>
            <AppText variant="heading">
              {t('job.collect', { total: formatRupees(total), bill: formatRupees(order.item_cost ?? 0), fee: formatRupees(fee) })}
            </AppText>
            <Button label={t('job.delivered')} icon="checkmark-done" loading={busy} onPress={() => void delivered()} />
          </Card>
        ) : null}

        {error ? <InlineMessage tone="error" message={error} /> : null}

        {order.status === 'delivered' || order.status === 'cancelled' ? (
          <Button label={t('job.backToJobs')} variant="outline" onPress={() => router.dismissTo('/')} />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: spacing.xxxl },
  content: { gap: spacing.lg },
  rowCenter: { alignItems: 'center', gap: spacing.md },
  block: { gap: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
  billThumb: { width: 56, height: 56, borderRadius: radius.sm, borderWidth: 1 },
});
