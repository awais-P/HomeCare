import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { errorMessageKey, useAuth } from '@homecare/shared/auth';
import { useI18n, useRowDirection, type TranslationKey } from '@homecare/shared/i18n';
import type { SaudaCategory } from '@homecare/shared/lib';
import { pickPhoto } from '@homecare/shared/media';
import { CATEGORY_ICON, CATEGORY_KEY, SAUDA_CATEGORIES } from '@homecare/shared/orders';
import { radius, spacing, useColors } from '@homecare/shared/theme';
import { AppText, BackHeader, Button, Card, ChoiceChips, IconCircle, InlineMessage, Screen, TextField } from '@homecare/shared/ui';

import { useAddresses } from '@/features/addresses/addresses-provider';
import { addressSummary, addressTitle, LABEL_ICON } from '@/features/addresses/labels';
import { baseDeliveryFee, createOrder, orderErrorKey, uploadListPhoto } from '@/features/orders/api';

const MAX_PHOTOS = 4;

/** New Sauda Run order: what to buy, optional shop and photos, delivery address. */
export default function NewOrderScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const { session } = useAuth();
  const { selected } = useAddresses();

  const [category, setCategory] = useState<SaudaCategory>(
    SAUDA_CATEGORIES.includes(params.category as SaudaCategory) ? (params.category as SaudaCategory) : 'grocery',
  );
  const [items, setItems] = useState('');
  const [shop, setShop] = useState('');
  const [instructions, setInstructions] = useState('');
  const [photos, setPhotos] = useState<{ path: string; uri: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fee, setFee] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);

  useEffect(() => {
    let active = true;
    baseDeliveryFee().then((value) => {
      if (active) setFee(value);
    });
    return () => {
      active = false;
    };
  }, []);

  const itemsMissing = items.trim().length < 2;

  const addPhoto = () => {
    const choose = async (source: 'camera' | 'library') => {
      const result = await pickPhoto(source);
      if (result.status !== 'ok' || !session) return;
      setUploading(true);
      setError(null);
      try {
        const path = await uploadListPhoto(session.user.id, result.photo);
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

  const place = async () => {
    setSubmitted(true);
    setError(null);
    if (itemsMissing || !selected) return;
    setPlacing(true);
    try {
      const order = await createOrder({
        addressId: selected.id,
        category,
        itemsText: items,
        shopPreference: shop,
        instructions,
        photoPaths: photos.map((p) => p.path),
      });
      router.replace({ pathname: '/order/[id]', params: { id: order.id } });
    } catch (e) {
      setError(orderErrorKey(e) ?? errorMessageKey(e));
    } finally {
      setPlacing(false);
    }
  };

  return (
    <Screen
      header={<BackHeader title={t('order.new.title')} />}
      footer={
        <Button
          label={t('order.new.place')}
          icon="bag-check-outline"
          loading={placing}
          disabled={uploading || !selected}
          onPress={() => void place()}
        />
      }>
      <View style={styles.form}>
        <View style={styles.group}>
          <AppText variant="label" color="textMuted">
            {t('order.new.category')}
          </AppText>
          <ChoiceChips<SaudaCategory>
            value={category}
            onChange={setCategory}
            options={SAUDA_CATEGORIES.map((value) => ({ value, label: t(CATEGORY_KEY[value]), icon: CATEGORY_ICON[value] }))}
          />
        </View>

        <TextField
          label={t('order.new.items')}
          placeholder={t('order.new.itemsPlaceholder')}
          value={items}
          onChangeText={setItems}
          multiline
          maxLength={2000}
          style={styles.multiline}
          error={submitted && itemsMissing ? t('order.new.itemsRequired') : null}
        />

        <View style={styles.group}>
          <AppText variant="label" color="textMuted">
            {t('order.new.photos')}
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

        <TextField
          label={t('order.new.shop')}
          placeholder={t('order.new.shopPlaceholder')}
          hint={t('order.new.shopHint')}
          value={shop}
          onChangeText={setShop}
          maxLength={150}
        />

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

        <TextField
          label={t('address.form.instructions')}
          placeholder={t('address.form.instructionsPlaceholder')}
          value={instructions}
          onChangeText={setInstructions}
          maxLength={300}
        />

        <Card style={[styles.fee, { flexDirection: row, backgroundColor: colors.saudaSoft, borderColor: colors.saudaSoft }]}>
          <Ionicons name="cash-outline" size={24} color={colors.sauda} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{fee != null ? t('order.new.feeTitle', { fee }) : t('order.detail.deliveryFee')}</AppText>
            <AppText variant="caption" color="textMuted">
              {t('order.new.feeBody')}
            </AppText>
          </View>
        </Card>

        {error ? <InlineMessage tone="error" message={t(error)} /> : null}
      </View>
    </Screen>
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
  address: { alignItems: 'center', gap: spacing.md },
  fee: { alignItems: 'center', gap: spacing.md },
});
