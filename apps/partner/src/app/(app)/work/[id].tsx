import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, View } from 'react-native';

import { ChatButton } from '@homecare/shared/chat';
import { errorMessageKey } from '@homecare/shared/auth';
import { useI18n, useRowDirection } from '@homecare/shared/i18n';
import { formatSlot, JOB_STATUS_KEY, jobTotal, TRADE_ICON, TRADE_KEY, useJobLive } from '@homecare/shared/jobs';
import type { UstaadJob } from '@homecare/shared/lib';
import { getDeviceLocation } from '@homecare/shared/location';
import { formatRupees } from '@homecare/shared/orders';
import { radius, spacing, useColors } from '@homecare/shared/theme';
import { AppText, BackHeader, Badge, Button, Card, Divider, IconCircle, InlineMessage, Screen, TextField } from '@homecare/shared/ui';

import { fileUrls } from '@/features/partner/jobs';
import { advanceJob, completeJob, getJob, jobCustomerContact, releaseJob, sendQuote } from '@/features/partner/ustaad-jobs';

const REFRESH_MS = 15_000;
const digits = (text: string) => text.replace(/\D/g, '').slice(0, 6);

/** The ustaad's job, one step at a time: on the way → arrived → price → work → cash. */
export default function WorkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const [job, setJob] = useState<UstaadJob | null>(null);
  const [contact, setContact] = useState<{ name: string | null; phone: string | null } | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [labour, setLabour] = useState('');
  const [parts, setParts] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((n) => n + 1), []);
  useJobLive(id ?? null, reload);

  useEffect(() => {
    let active = true;
    const fetchJob = async () => {
      const [j, c] = await Promise.all([getJob(id), jobCustomerContact(id)]);
      const nextUrls = j?.photo_paths.length ? await fileUrls(j.photo_paths) : {};
      if (!active) return;
      setJob(j);
      setContact(c);
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

  if (!job) {
    return (
      <Screen header={<BackHeader title={t('ujob.work.title')} />} scroll={false}>
        {error ? <InlineMessage tone="error" message={error} /> : <ActivityIndicator style={styles.loading} color={colors.primary} />}
      </Screen>
    );
  }

  const run = async (action: () => Promise<UstaadJob | void>) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await action();
      if (updated) setJob(updated);
      reload();
    } catch (e) {
      const msg = (e as { message?: string }).message ?? '';
      if (msg.includes('too_early')) setError(t('ujob.work.tooEarly'));
      else if (msg.includes('location_required')) setError(t('partner.home.locationNeeded'));
      else if (msg.includes('warranty_labour_free')) setError(t('ujob.warranty.labourFree'));
      else if (msg.includes('labour_required')) setError(t('ujob.work.labourRequired'));
      else setError(t(errorMessageKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const arrived = () =>
    run(async () => {
      const location = await getDeviceLocation();
      if (location.status !== 'ok') throw new Error('location_required');
      return advanceJob(job.id, 'arrived', { lat: location.coordinate.latitude, lng: location.coordinate.longitude });
    });

  const quote = () =>
    run(async () => {
      if (labour === '' && !job.is_warranty) throw new Error('labour_required');
      return sendQuote(job.id, job.is_warranty ? 0 : Number(labour || 0), Number(parts || 0), note.trim() || undefined);
    });

  const release = () =>
    Alert.alert(t('ujob.work.release'), t('ujob.work.releaseConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('ujob.work.release'),
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await releaseJob(job.id);
            router.back();
          }),
      },
    ]);

  const openMaps = () => void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${job.latitude},${job.longitude}`);
  const total = jobTotal(job);
  const finished = job.status === 'completed' || job.status === 'visit_only' || job.status === 'cancelled';
  const rupees = (n: number) => t('common.rupees', { amount: formatRupees(n) });

  return (
    <Screen header={<BackHeader title={`${t('ujob.work.title')} · ${job.code}`} />}>
      <View style={styles.content}>
        <Card style={[styles.rowCenter, { flexDirection: row }]}>
          <IconCircle icon={TRADE_ICON[job.trade]} tint="ustaadSoft" color="ustaad" size={48} />
          <View style={styles.flex}>
            <AppText variant="heading">{t(TRADE_KEY[job.trade])}</AppText>
            <View style={[styles.badges, { flexDirection: row }]}>
              <Badge label={t(JOB_STATUS_KEY[job.status])} tone={job.status === 'cancelled' ? 'danger' : 'ustaad'} />
              <Badge label={job.timing === 'scheduled' && job.scheduled_for ? formatSlot(job.scheduled_for) : t('ujob.timing.now')} tone="primary" />
              {job.is_warranty ? <Badge label={t('ujob.warranty.badge')} tone="primary" /> : null}
            </View>
          </View>
        </Card>

        {job.status === 'cancelled' ? <InlineMessage tone="error" message={t('job.cancelled')} /> : null}
        {job.status === 'completed' ? <InlineMessage tone="success" message={`${t('ujob.work.done')} ${rupees(job.amount_due ?? 0)}`} /> : null}
        {job.status === 'visit_only' ? <InlineMessage tone="info" message={t('ujob.work.visitOnly', { fee: formatRupees(job.visit_fee) })} /> : null}

        <Card style={styles.block}>
          <AppText variant="label" color="textMuted">
            {t('ujob.detail.problem')}
          </AppText>
          <AppText>{job.problem_text}</AppText>
          {job.photo_paths.length ? (
            <View style={[styles.photos, { flexDirection: row }]}>
              {job.photo_paths.map((p) => (urls[p] ? <Image key={p} source={{ uri: urls[p] }} style={styles.photo} contentFit="cover" /> : null))}
            </View>
          ) : null}
          <Divider />
          <AppText variant="label" color="textMuted">
            {t('order.detail.deliverTo')}
          </AppText>
          <AppText>{job.address_text}</AppText>
          {job.instructions ? (
            <AppText variant="caption" color="textMuted">
              {job.instructions}
            </AppText>
          ) : null}
          {!finished ? (
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
          ) : null}
        </Card>

        <ChatButton thread={{ kind: 'job', id: job.id }} onPress={() => router.push({ pathname: '/chat/[kind]/[id]', params: { kind: 'job', id: job.id } })} />

        {/* Steps */}
        {job.status === 'accepted' ? (
          <>
            <Button label={t('ujob.work.onMyWay')} icon="navigate" loading={busy} onPress={() => void run(() => advanceJob(job.id, 'on_the_way'))} />
            <Button label={t('ujob.work.release')} variant="ghost" size="md" onPress={release} />
          </>
        ) : null}
        {job.status === 'on_the_way' ? (
          <>
            <Button label={t('ujob.work.arrived')} icon="home" loading={busy} onPress={() => void arrived()} />
            <Button label={t('ujob.work.release')} variant="ghost" size="md" onPress={release} />
          </>
        ) : null}

        {job.status === 'arrived' || job.status === 'quoted' ? (
          <Card style={styles.block}>
            <AppText variant="heading">{t('ujob.work.quoteTitle')}</AppText>
            {job.status === 'quoted' ? <InlineMessage tone="info" message={t('ujob.work.waiting')} /> : null}
            {job.is_warranty ? (
              <AppText variant="caption" color="textMuted">
                {t('ujob.warranty.labourFree')}
              </AppText>
            ) : (
              <TextField
                label={t('ujob.work.labour')}
                value={labour}
                onChangeText={(text) => setLabour(digits(text))}
                keyboardType="number-pad"
                forceLTR
                placeholder={job.labour_cost != null ? String(job.labour_cost) : '1500'}
              />
            )}
            <TextField
              label={t('ujob.work.parts')}
              value={parts}
              onChangeText={(text) => setParts(digits(text))}
              keyboardType="number-pad"
              forceLTR
              placeholder={job.parts_cost != null ? String(job.parts_cost) : '0'}
            />
            <TextField
              label={t('ujob.work.note')}
              placeholder={t('ujob.work.notePlaceholder')}
              value={note}
              onChangeText={setNote}
              maxLength={500}
            />
            <AppText variant="caption" color="textMuted">
              {t('ujob.quote.visitIncluded', { fee: formatRupees(job.visit_fee) })}
            </AppText>
            <Button
              label={job.status === 'quoted' ? t('ujob.work.updateQuote') : t('ujob.work.sendQuote')}
              icon="send"
              loading={busy}
              onPress={() => void quote()}
            />
          </Card>
        ) : null}

        {job.status === 'in_progress' && total != null ? (
          <Card style={styles.block}>
            <InlineMessage tone="success" message={t('ujob.work.approved')} />
            <AppText variant="heading">{t('ujob.work.collect', { amount: formatRupees(total) })}</AppText>
            <AppText variant="caption" color="textMuted">
              {t('ujob.quote.labour')} {rupees(job.labour_cost ?? 0)} · {t('ujob.quote.parts')} {rupees(job.parts_cost ?? 0)}
            </AppText>
            <Button label={t('ujob.work.complete')} icon="checkmark-done" loading={busy} onPress={() => void run(() => completeJob(job.id))} />
          </Card>
        ) : null}

        {error ? <InlineMessage tone="error" message={error} /> : null}

        {finished ? <Button label={t('job.backToJobs')} variant="outline" onPress={() => router.dismissTo('/')} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: spacing.xxxl },
  content: { gap: spacing.lg },
  rowCenter: { alignItems: 'center', gap: spacing.md },
  badges: { flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  block: { gap: spacing.sm },
  photos: { flexWrap: 'wrap', gap: spacing.sm },
  photo: { width: 72, height: 72, borderRadius: radius.md },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
});
