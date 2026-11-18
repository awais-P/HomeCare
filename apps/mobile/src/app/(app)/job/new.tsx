import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { errorMessageKey, useAuth } from '@homecare/shared/auth';
import { useI18n, useRowDirection, type TranslationKey } from '@homecare/shared/i18n';
import { TRADE_ICON, TRADE_KEY, TRADES } from '@homecare/shared/jobs';
import type { FavouriteUstaad, JobTiming, UstaadTrade } from '@homecare/shared/lib';
import { pickPhoto } from '@homecare/shared/media';
import { formatRupees } from '@homecare/shared/orders';
import { radius, spacing, useColors } from '@homecare/shared/theme';
import { AppText, BackHeader, Button, Card, ChoiceChips, IconCircle, InlineMessage, Screen, TextField } from '@homecare/shared/ui';

import { useAddresses } from '@/features/addresses/addresses-provider';
import { addressSummary, addressTitle, LABEL_ICON } from '@/features/addresses/labels';
import { createJob, jobErrorKey, myFavourites, uploadProblemPhoto, ustaadPricing } from '@/features/jobs/api';
import { hourLabel, slotDays, slotTime } from '@/features/jobs/slots';

const MAX_PHOTOS = 4;
const ANY = 'any';

/** Book an ustaad: trade, problem, photos, come now or a time slot, favourite ustaad, address. */
export default function NewJobScreen() {
  const params = useLocalSearchParams<{ trade?: string }>();
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const { session } = useAuth();
  const { selected } = useAddresses();

  const [trade, setTrade] = useState<UstaadTrade>(
    TRADES.includes(params.trade as UstaadTrade) ? (params.trade as UstaadTrade) : 'plumber',
  );
  const [problem, setProblem] = useState('');
  const [photos, setPhotos] = useState<{ path: string; uri: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [timing, setTiming] = useState<JobTiming>('now');
  // The clock is read once, when the screen opens.
  const [today] = useState(() => new Date());
  const days = useMemo(() => slotDays(today), [today]);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [hour, setHour] = useState<number | null>(null);
  const [favourites, setFavourites] = useState<FavouriteUstaad[]>([]);
  const [preferred, setPreferred] = useState<string>(ANY);
  const [pricing, setPricing] = useState<{ visitFee: number; surgePercent: number; warrantyDays: number } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([ustaadPricing(), myFavourites()]).then(([p, f]) => {
      if (!active) return;
      setPricing(p);
      setFavourites(f);
    });
    return () => {
      active = false;
    };
  }, []);

  const day = days.find((d) => d.key === dayKey) ?? null;
  const favouritesForTrade = favourites.filter((f) => f.trades.includes(trade));
  const preferredId = favouritesForTrade.some((f) => f.ustaad_id === preferred) ? preferred : ANY;
  const problemMissing = problem.trim().length < 2;
  const slotMissing = timing === 'scheduled' && (!day || hour == null || !day.hours.includes(hour));
  const fee = pricing ? Math.round((pricing.visitFee * (100 + (timing === 'now' ? pricing.surgePercent : 0))) / 100) : null;

  const addPhoto = () => {
    const choose = async (source: 'camera' | 'library') => {
      const result = await pickPhoto(source);
      if (result.status !== 'ok' || !session) return;
      setUploading(true);
      setError(null);
      try {
        const path = await uploadProblemPhoto(session.user.id, result.photo);
        setPhotos((prev) => [...prev, { path, uri: `data:${result.photo.mimeType};base64,${result.photo.base64}` }]);
      } catch {
        setError('order.new.photoFailed');
      } finally {
        setUploading(false);
      }
    };
    Alert.alert(t('order.new.addPhoto'), undefined, [
      { text: t('partner.docs.take'), onPress: () => void choose('camera') },
      { text: t('partner.docs.choose'), onPress: () => void choose('library') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const book = async () => {
    setSubmitted(true);
    setError(null);
    if (problemMissing || slotMissing || !selected) return;
    setPlacing(true);
    try {
      const job = await createJob({
        addressId: selected.id,
        trade,
        problemText: problem,
        timing,
        scheduledFor: timing === 'scheduled' && day && hour != null ? slotTime(day.date, hour).toISOString() : undefined,
        photoPaths: photos.map((p) => p.path),
        preferredUstaad: preferredId === ANY ? undefined : preferredId,
      });
      router.replace({ pathname: '/job/[id]', params: { id: job.id } });
    } catch (e) {
      setError(jobErrorKey(e) ?? errorMessageKey(e));
    } finally {
      setPlacing(false);
    }
  };

  const dayLabel = (date: Date) =>
    date.toDateString() === today.toDateString()
      ? t('ustaad.new.today')
      : date.toDateString() === new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toDateString()
        ? t('ustaad.new.tomorrow')
        : date.toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <Screen
      header={<BackHeader title={t('ustaad.new.title')} />}
      footer={
        <Button label={t('ustaad.new.submit')} icon="construct-outline" loading={placing} disabled={uploading || !selected} onPress={() => void book()} />
      }>
      <View style={styles.form}>
        <View style={styles.group}>
          <AppText variant="label" color="textMuted">
            {t('ustaad.new.trade')}
          </AppText>
          <ChoiceChips<UstaadTrade>
            value={trade}
            onChange={setTrade}
            options={TRADES.map((value) => ({ value, label: t(TRADE_KEY[value]), icon: TRADE_ICON[value] }))}
          />
        </View>

        <TextField
          label={t('ustaad.new.problem')}
          placeholder={t('ustaad.new.problemPlaceholder')}
          value={problem}
          onChangeText={setProblem}
          multiline
          maxLength={1000}
          style={styles.multiline}
          error={submitted && problemMissing ? t('ustaad.new.problemRequired') : null}
        />

        <View style={styles.group}>
          <AppText variant="label" color="textMuted">
            {t('ustaad.new.photos')}
          </AppText>
          <View style={[styles.photos, { flexDirection: row }]}>
            {photos.map((photo) => (
              <View key={photo.path}>
                <Image source={{ uri: photo.uri }} style={[styles.photo, { borderColor: colors.border }]} contentFit="cover" />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('address.list.delete')}
                  onPress={() => setPhotos((prev) => prev.filter((p) => p.path !== photo.path))}
                  style={[styles.removePhoto, { backgroundColor: colors.surface }]}>
                  <Ionicons name="close" size={16} color={colors.text} />
                </Pressable>
              </View>
            ))}
            {photos.length < MAX_PHOTOS ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('order.new.addPhoto')}
                disabled={uploading}
                onPress={addPhoto}
                style={[styles.photo, styles.addPhoto, { borderColor: colors.borderStrong, backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name={uploading ? 'hourglass-outline' : 'camera-outline'} size={26} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* When */}
        <View style={styles.group}>
          <AppText variant="label" color="textMuted">
            {t('ustaad.new.when')}
          </AppText>
          <View style={[styles.timingRow, { flexDirection: row }]}>
            <TimingCard
              selected={timing === 'now'}
              icon="flash"
              title={t('ustaad.new.now')}
              hint={pricing ? t('ustaad.new.nowHint', { surge: pricing.surgePercent }) : ''}
              onPress={() => setTiming('now')}
            />
            <TimingCard
              selected={timing === 'scheduled'}
              icon="calendar"
              title={t('ustaad.new.scheduled')}
              hint={t('ustaad.new.scheduledHint')}
              onPress={() => setTiming('scheduled')}
            />
          </View>
          {timing === 'scheduled' ? (
            <Card style={styles.group}>
              <AppText variant="caption" color="textMuted">
                {t('ustaad.new.day')}
              </AppText>
              <ChoiceChips<string>
                value={dayKey ?? ''}
                onChange={(key) => {
                  setDayKey(key);
                  setHour(null);
                }}
                options={days.map((d) => ({ value: d.key, label: dayLabel(d.date) }))}
              />
              {day ? (
                <>
                  <AppText variant="caption" color="textMuted">
                    {t('ustaad.new.time')}
                  </AppText>
                  <ChoiceChips<string>
                    value={hour != null ? String(hour) : ''}
                    onChange={(h) => setHour(Number(h))}
                    options={day.hours.map((h) => ({ value: String(h), label: hourLabel(h) }))}
                  />
                </>
              ) : null}
              {submitted && slotMissing ? (
                <AppText variant="caption" color="danger">
                  {t('ustaad.new.slotRequired')}
                </AppText>
              ) : null}
            </Card>
          ) : null}
        </View>

        {/* Favourite ustaad */}
        {favouritesForTrade.length ? (
          <View style={styles.group}>
            <AppText variant="label" color="textMuted">
              {t('ustaad.new.favourite')}
            </AppText>
            <ChoiceChips<string>
              value={preferredId}
              onChange={setPreferred}
              options={[
                { value: ANY, label: t('ustaad.new.anyUstaad'), icon: 'navigate-outline' },
                ...favouritesForTrade.map((f) => ({
                  value: f.ustaad_id,
                  label: `${f.name ?? '—'}${f.rating_avg != null ? ` ★${f.rating_avg}` : ''}`,
                  icon: 'heart' as const,
                })),
              ]}
            />
          </View>
        ) : null}

        <View style={styles.group}>
          <AppText variant="label" color="textMuted">
            {t('home.deliverTo')}
          </AppText>
          {selected ? (
            <Card
              onPress={() => router.push({ pathname: '/addresses', params: { mode: 'select' } })}
              style={[styles.address, { flexDirection: row }]}>
              <IconCircle icon={LABEL_ICON[selected.label]} size={40} />
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{addressTitle(selected, t)}</AppText>
                <AppText variant="caption" color="textMuted" numberOfLines={2}>
                  {addressSummary(selected)}
                </AppText>
              </View>
              <Ionicons name="chevron-down" size={20} color={colors.primary} />
            </Card>
          ) : (
            <Button label={t('order.new.noAddress')} variant="outline" icon="location-outline" onPress={() => router.push('/address/pick')} />
          )}
        </View>

        <Card style={[styles.fee, { flexDirection: row, backgroundColor: colors.ustaadSoft, borderColor: colors.ustaadSoft }]}>
          <Ionicons name="cash-outline" size={24} color={colors.ustaad} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{fee != null ? t('ustaad.new.feeTitle', { fee: formatRupees(fee) }) : t('ujob.pay.visitFee')}</AppText>
            <AppText variant="caption" color="textMuted">
              {t('ustaad.new.feeBody', { days: pricing?.warrantyDays ?? 7 })}
            </AppText>
          </View>
        </Card>

        {error ? <InlineMessage tone="error" message={t(error)} /> : null}
      </View>
    </Screen>
  );
}

function TimingCard({
  selected,
  icon,
  title,
  hint,
  onPress,
}: {
  selected: boolean;
  icon: 'flash' | 'calendar';
  title: string;
  hint: string;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      aria-checked={selected}
      style={[
        styles.timing,
        { borderColor: selected ? colors.ustaad : colors.border, backgroundColor: selected ? colors.ustaadSoft : colors.surface },
      ]}>
      <Ionicons name={icon} size={22} color={selected ? colors.ustaad : colors.textMuted} />
      <AppText variant="bodyStrong">{title}</AppText>
      <AppText variant="small" color="textMuted">
        {hint}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { gap: spacing.xl },
  group: { gap: spacing.sm },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  photos: { flexWrap: 'wrap', gap: spacing.sm },
  photo: { width: 72, height: 72, borderRadius: radius.md, borderWidth: 1 },
  addPhoto: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed' },
  removePhoto: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  timingRow: { gap: spacing.sm },
  timing: { flex: 1, gap: spacing.xs, padding: spacing.md, borderRadius: radius.lg, borderWidth: 2 },
  address: { alignItems: 'center', gap: spacing.md },
  fee: { alignItems: 'center', gap: spacing.md },
});
