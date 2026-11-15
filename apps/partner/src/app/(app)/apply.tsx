import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessageKey, useAuth } from '@homecare/shared/auth';
import { useI18n } from '@homecare/shared/i18n';
import type { TranslationKey } from '@homecare/shared/i18n';
import type { PartnerRole, PayoutMethod, UstaadTrade, VehicleType } from '@homecare/shared/lib';
import { spacing } from '@homecare/shared/theme';
import {
  AppText,
  BackHeader,
  Button,
  ChoiceChips,
  InlineMessage,
  MultiChoiceChips,
  Screen,
  TextField,
} from '@homecare/shared/ui';

import { formatCnic, isValidCnic, isValidWallet, toWalletDigits } from '@/features/partner/format';
import {
  PAYOUT_LABEL,
  PAYOUTS,
  ROLE_ICON,
  ROLE_KEY,
  TRADE_KEY,
  TRADES,
  VEHICLE_KEY,
  VEHICLES,
} from '@/features/partner/labels';
import { usePartner } from '@/features/partner/partner-provider';

/** Step 1 of the application: role, trades or vehicle, CNIC number and payout wallet. */
export default function ApplyScreen() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const { partner, saveApplication } = usePartner();

  const [role, setRole] = useState<PartnerRole>(partner?.role ?? 'rider');
  const [trades, setTrades] = useState<UstaadTrade[]>(partner?.trades ?? []);
  const [vehicle, setVehicle] = useState<VehicleType | null>(partner?.vehicle_type ?? null);
  const [vehicleNumber, setVehicleNumber] = useState(partner?.vehicle_number ?? '');
  const [cnic, setCnic] = useState(partner?.cnic_number ?? '');
  const [payout, setPayout] = useState<PayoutMethod | null>(partner?.payout_method ?? null);
  const [wallet, setWallet] = useState(partner?.payout_account ?? toWalletDigits(profile?.phone ?? ''));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<TranslationKey | null>(null);

  // Only drafts and rejected applications can be edited.
  if (partner && !['draft', 'rejected'].includes(partner.status)) return <Redirect href="/" />;

  const errors = {
    trades: role === 'ustaad' && trades.length === 0,
    vehicle: role === 'rider' && !vehicle,
    vehicleNumber: role === 'rider' && vehicle !== 'bicycle' && vehicleNumber.trim().length < 2,
    cnic: !isValidCnic(cnic),
    payout: !payout,
    wallet: !isValidWallet(wallet),
  };

  const save = async () => {
    setSubmitted(true);
    setApiError(null);
    if (Object.values(errors).some(Boolean)) return;
    setSaving(true);
    try {
      await saveApplication({
        role,
        trades: role === 'ustaad' ? trades : [],
        vehicle_type: role === 'rider' ? vehicle : null,
        vehicle_number: role === 'rider' && vehicle !== 'bicycle' ? vehicleNumber.trim().toUpperCase() : null,
        cnic_number: cnic,
        payout_method: payout,
        payout_account: wallet,
      });
      router.push('/documents');
    } catch (error) {
      setApiError(errorMessageKey(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      header={<BackHeader title={t('partner.apply.title')} />}
      footer={<Button label={t('partner.apply.next')} icon="arrow-forward" loading={saving} onPress={() => void save()} />}>
      <View style={styles.form}>
        <Field label={t('partner.apply.role')}>
          <ChoiceChips<PartnerRole>
            value={role}
            onChange={setRole}
            options={(['rider', 'ustaad'] as const).map((value) => ({ value, label: t(ROLE_KEY[value]), icon: ROLE_ICON[value] }))}
          />
        </Field>

        {role === 'ustaad' ? (
          <Field label={t('partner.apply.trades')} error={submitted && errors.trades ? t('partner.apply.tradesRequired') : null}>
            <MultiChoiceChips<UstaadTrade>
              values={trades}
              onChange={setTrades}
              options={TRADES.map((value) => ({ value, label: t(TRADE_KEY[value]) }))}
            />
          </Field>
        ) : (
          <>
            <Field label={t('partner.apply.vehicle')} error={submitted && errors.vehicle ? t('partner.apply.vehicleRequired') : null}>
              <ChoiceChips<VehicleType>
                value={vehicle ?? ('' as VehicleType)}
                onChange={setVehicle}
                options={VEHICLES.map((value) => ({ value, label: t(VEHICLE_KEY[value]) }))}
              />
            </Field>
            {vehicle && vehicle !== 'bicycle' ? (
              <TextField
                label={t('partner.apply.vehicleNumber')}
                placeholder={t('partner.apply.vehicleNumberPlaceholder')}
                value={vehicleNumber}
                onChangeText={setVehicleNumber}
                autoCapitalize="characters"
                maxLength={20}
                forceLTR
                error={submitted && errors.vehicleNumber ? t('partner.apply.vehicleNumberRequired') : null}
              />
            ) : null}
          </>
        )}

        <TextField
          label={t('partner.apply.cnic')}
          placeholder="12345-1234567-1"
          value={cnic}
          onChangeText={(text) => setCnic(formatCnic(text))}
          keyboardType="number-pad"
          maxLength={15}
          forceLTR
          error={submitted && errors.cnic ? t('partner.apply.cnicInvalid') : null}
        />

        <Field label={t('partner.apply.payout')} error={submitted && errors.payout ? t('partner.apply.payoutRequired') : null}>
          <ChoiceChips<PayoutMethod>
            value={payout ?? ('' as PayoutMethod)}
            onChange={setPayout}
            options={PAYOUTS.map((value) => ({ value, label: PAYOUT_LABEL[value], icon: 'wallet-outline' }))}
          />
        </Field>
        <TextField
          label={t('partner.apply.payoutAccount')}
          placeholder="03001234567"
          hint={t('partner.apply.payoutHint')}
          value={wallet}
          onChangeText={(text) => setWallet(toWalletDigits(text))}
          keyboardType="phone-pad"
          maxLength={11}
          forceLTR
          error={submitted && errors.wallet ? t('partner.apply.payoutInvalid') : null}
        />

        {apiError ? <InlineMessage tone="error" message={t(apiError)} /> : null}
      </View>
    </Screen>
  );
}

function Field({ label, error, children }: { label: string; error?: string | null; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <AppText variant="label" color="textMuted">
        {label}
      </AppText>
      {children}
      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.xl },
  field: { gap: spacing.sm },
});
