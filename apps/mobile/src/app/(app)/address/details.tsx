import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, BackHeader, Button, Card, ChoiceChips, InlineMessage, PhoneInput, Screen, TextField, ToggleRow } from '@homecare/shared/ui';
import { useAddresses } from '@/features/addresses/addresses-provider';
import { ADDRESS_LABELS, addressErrorKey, LABEL_ICON, LABEL_KEY } from '@/features/addresses/labels';
import { setLocationDraft, useLocationDraft } from '@/features/addresses/location-draft';
import { isValidNationalNumber, PK_COUNTRY_CODE, toNationalDigits } from '@homecare/shared/auth';
import { placeToAddressLine } from '@homecare/shared/location';
import { useI18n, useRowDirection } from '@homecare/shared/i18n';
import type { TranslationKey } from '@homecare/shared/i18n';
import type { AddressLabel } from '@homecare/shared/lib';
import { radius, spacing, useColors } from '@homecare/shared/theme';

const trimOrNull = (value: string) => (value.trim() === '' ? null : value.trim());

/**
 * Address form. New address: reached from the map picker (location comes from the draft).
 * Edit: `id` param; "Change" opens the picker in edit mode, which hands back a new draft.
 */
export default function AddressDetailsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t } = useI18n();
  const colors = useColors();
  const row = useRowDirection();
  const { addresses, create, update } = useAddresses();
  const draft = useLocationDraft();
  const existing = id ? addresses.find((a) => a.id === id) : undefined;
  const isEdit = Boolean(existing);

  // The draft is only for this visit to the form.
  useEffect(() => () => setLocationDraft(null), []);

  const location = draft
    ? { latitude: draft.coordinate.latitude, longitude: draft.coordinate.longitude, line: placeToAddressLine(draft), zone: draft.zoneName }
    : existing
      ? { latitude: existing.latitude, longitude: existing.longitude, line: existing.formatted_address, zone: null }
      : null;

  const [label, setLabel] = useState<AddressLabel>(existing?.label ?? 'home');
  const [customLabel, setCustomLabel] = useState(existing?.custom_label ?? '');
  const [house, setHouse] = useState(existing?.house ?? draft?.house ?? '');
  const [street, setStreet] = useState(existing?.street ?? draft?.street ?? '');
  const [area, setArea] = useState(existing?.area ?? draft?.area ?? '');
  const [landmark, setLandmark] = useState(existing?.landmark ?? '');
  const [instructions, setInstructions] = useState(existing?.instructions ?? '');
  const [forSomeoneElse, setForSomeoneElse] = useState(Boolean(existing?.recipient_name));
  const [recipientName, setRecipientName] = useState(existing?.recipient_name ?? '');
  const [recipientDigits, setRecipientDigits] = useState(
    existing?.recipient_phone ? toNationalDigits(existing.recipient_phone) : '',
  );
  const [makeDefault, setMakeDefault] = useState(existing?.is_default ?? addresses.length === 0);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<TranslationKey | null>(null);

  // Nothing to edit: the address was deleted, or the form was opened without a location.
  if (!location) {
    return (
      <Screen header={<BackHeader title={t('address.form.title')} />}>
        <InlineMessage tone="error" message={t('errors.generic')} />
      </Screen>
    );
  }

  const detailsMissing = !house.trim() && !street.trim() && !area.trim();
  const customLabelMissing = label === 'other' && !customLabel.trim();
  const recipientNameInvalid =
    forSomeoneElse && (recipientName.trim().length < 2 || recipientName.trim().length > 60);
  const recipientPhoneInvalid = forSomeoneElse && !isValidNationalNumber(recipientDigits);

  const save = async () => {
    setSubmitted(true);
    setApiError(null);
    if (detailsMissing || customLabelMissing || recipientNameInvalid || recipientPhoneInvalid) return;
    const values = {
      label,
      custom_label: label === 'other' ? trimOrNull(customLabel) : null,
      latitude: location.latitude,
      longitude: location.longitude,
      formatted_address: location.line,
      house: trimOrNull(house),
      street: trimOrNull(street),
      area: trimOrNull(area),
      landmark: trimOrNull(landmark),
      instructions: trimOrNull(instructions),
      recipient_name: forSomeoneElse ? recipientName.trim() : null,
      recipient_phone: forSomeoneElse ? `${PK_COUNTRY_CODE}${recipientDigits}` : null,
      is_default: makeDefault,
    };
    setSaving(true);
    try {
      if (existing) {
        await update(existing.id, values);
        router.back();
      } else {
        await create(values);
        router.dismiss(2); // close the form and the map picker
      }
    } catch (error) {
      setApiError(addressErrorKey(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      header={<BackHeader title={t(isEdit ? 'address.form.editTitle' : 'address.form.title')} />}
      footer={<Button label={t('address.form.save')} onPress={() => void save()} loading={saving} />}>
      <View style={styles.form}>
        <Card style={[styles.locationCard, { flexDirection: row }]}>
          <Ionicons name="location" size={22} color={colors.primary} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong" numberOfLines={2}>
              {location.line}
            </AppText>
            {location.zone ? (
              <AppText variant="caption" color="success">
                {t('address.pick.inside', { zone: location.zone })}
              </AppText>
            ) : null}
          </View>
          <Button
            label={t('address.form.change')}
            variant="ghost"
            size="md"
            fullWidth={false}
            onPress={() =>
              router.push({
                pathname: '/address/pick',
                // 'edit' = hand the new spot back to this form instead of opening another one
                params: { mode: 'edit', lat: String(location.latitude), lng: String(location.longitude) },
              })
            }
          />
        </Card>

        <View style={styles.group}>
          <AppText variant="label" color="textMuted">
            {t('address.form.saveAs')}
          </AppText>
          <ChoiceChips<AddressLabel>
            accessibilityLabel={t('address.form.saveAs')}
            value={label}
            onChange={(next) => {
              setLabel(next);
              if (next === 'parents') setForSomeoneElse(true);
            }}
            options={ADDRESS_LABELS.map((value) => ({ value, label: t(LABEL_KEY[value]), icon: LABEL_ICON[value] }))}
          />
        </View>

        {label === 'other' ? (
          <TextField
            label={t('address.form.customLabel')}
            placeholder={t('address.form.customLabelPlaceholder')}
            value={customLabel}
            onChangeText={setCustomLabel}
            maxLength={30}
            error={submitted && customLabelMissing ? t('address.form.customLabelRequired') : null}
          />
        ) : null}

        <TextField
          label={t('address.form.house')}
          placeholder={t('address.form.housePlaceholder')}
          value={house}
          onChangeText={setHouse}
          maxLength={100}
          error={submitted && detailsMissing ? t('address.form.detailsRequired') : null}
        />
        <TextField
          label={t('address.form.street')}
          placeholder={t('address.form.streetPlaceholder')}
          value={street}
          onChangeText={setStreet}
          maxLength={100}
        />
        <TextField
          label={t('address.form.area')}
          placeholder={t('address.form.areaPlaceholder')}
          value={area}
          onChangeText={setArea}
          maxLength={100}
        />
        <TextField
          label={t('address.form.landmark')}
          placeholder={t('address.form.landmarkPlaceholder')}
          value={landmark}
          onChangeText={setLandmark}
          maxLength={150}
        />
        <TextField
          label={t('address.form.instructions')}
          placeholder={t('address.form.instructionsPlaceholder')}
          value={instructions}
          onChangeText={setInstructions}
          maxLength={300}
          multiline
          style={styles.multiline}
        />

        <View style={[styles.box, { borderColor: colors.border }]}>
          <ToggleRow
            label={t('address.form.forSomeoneElse')}
            hint={t('address.form.forSomeoneElseHint')}
            value={forSomeoneElse}
            onValueChange={setForSomeoneElse}
          />
          {forSomeoneElse ? (
            <View style={styles.group}>
              <TextField
                label={t('address.form.recipientName')}
                value={recipientName}
                onChangeText={setRecipientName}
                autoCapitalize="words"
                maxLength={60}
                error={submitted && recipientNameInvalid ? t('address.form.recipientNameInvalid') : null}
              />
              <PhoneInput
                label={t('address.form.recipientPhone')}
                placeholder={t('phone.placeholder')}
                value={recipientDigits}
                onChangeValue={setRecipientDigits}
                error={submitted && recipientPhoneInvalid ? t('address.form.recipientPhoneInvalid') : null}
              />
            </View>
          ) : null}
        </View>

        {existing?.is_default ? null : (
          <ToggleRow label={t('address.form.makeDefault')} value={makeDefault} onValueChange={setMakeDefault} />
        )}

        {apiError ? <InlineMessage tone="error" message={t(apiError)} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { gap: spacing.lg },
  locationCard: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  group: { gap: spacing.sm },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  box: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md },
});
