import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessageKey } from '@homecare/shared/auth';
import { useI18n, useRowDirection } from '@homecare/shared/i18n';
import type { Substitution } from '@homecare/shared/lib';
import { pickPhoto } from '@homecare/shared/media';
import { radius, spacing, useColors } from '@homecare/shared/theme';
import { AppText, Button, Card, InlineMessage, TextField } from '@homecare/shared/ui';

import { requestSubstitution, uploadSubstitutionPhoto } from './jobs';

/** At the shop: "No Olpers — get Nestle?" The customer answers yes / no in their app. */
export function SubstitutionForm({ orderId, onSent }: { orderId: string; onSent: (s: Substitution) => void }) {
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const [openForm, setOpenForm] = useState(false);
  const [item, setItem] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [price, setPrice] = useState('');
  const [photo, setPhoto] = useState<{ path: string; uri: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!openForm) {
    return <Button label={t('subs.ask')} icon="help-circle-outline" variant="secondary" size="md" onPress={() => setOpenForm(true)} />;
  }

  const takePhoto = async () => {
    const result = await pickPhoto('camera', { allowsEditing: true });
    if (result.status === 'denied') {
      setError(t('partner.docs.cameraDenied'));
      return;
    }
    if (result.status !== 'ok') return;
    setBusy(true);
    setError(null);
    try {
      const path = await uploadSubstitutionPhoto(orderId, result.photo);
      setPhoto({ path, uri: `data:${result.photo.mimeType};base64,${result.photo.base64}` });
    } catch (e) {
      setError(t(errorMessageKey(e)));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!item.trim()) {
      setError(t('subs.itemRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sent = await requestSubstitution({
        orderId,
        item: item.trim(),
        suggestion: suggestion.trim() || undefined,
        price: price ? Number(price) : undefined,
        photoPath: photo?.path,
      });
      onSent(sent);
      setItem('');
      setSuggestion('');
      setPrice('');
      setPhoto(null);
      setOpenForm(false);
    } catch (e) {
      setError(t(errorMessageKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.card}>
      <AppText variant="heading">{t('subs.ask')}</AppText>
      <TextField label={t('subs.item')} placeholder={t('subs.itemPlaceholder')} value={item} onChangeText={setItem} maxLength={150} />
      <TextField
        label={t('subs.suggestion')}
        placeholder={t('subs.suggestionPlaceholder')}
        hint={t('subs.suggestionHint')}
        value={suggestion}
        onChangeText={setSuggestion}
        maxLength={150}
      />
      {suggestion.trim() ? (
        <TextField
          label={t('subs.priceLabel')}
          value={price}
          onChangeText={(text) => setPrice(text.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          forceLTR
          placeholder="290"
        />
      ) : null}
      <View style={[styles.photoRow, { flexDirection: row }]}>
        {photo ? (
          <>
            <Image source={{ uri: photo.uri }} style={[styles.thumb, { borderColor: colors.border }]} contentFit="cover" />
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          </>
        ) : null}
        <Button
          style={styles.flex}
          label={photo ? t('partner.docs.retake') : t('subs.photo')}
          icon="camera-outline"
          variant="outline"
          size="md"
          disabled={busy}
          onPress={() => void takePhoto()}
        />
      </View>
      {error ? <InlineMessage tone="error" message={error} /> : null}
      <View style={[styles.photoRow, { flexDirection: row }]}>
        <Button style={styles.cancel} label={t('common.cancel')} variant="ghost" size="md" disabled={busy} onPress={() => setOpenForm(false)} />
        <Button style={styles.flex} label={t('subs.send')} icon="send" size="md" loading={busy} onPress={() => void send()} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.md },
  photoRow: { alignItems: 'center', gap: spacing.sm },
  thumb: { width: 56, height: 56, borderRadius: radius.sm, borderWidth: 1 },
  cancel: { flex: 0.6 },
});
