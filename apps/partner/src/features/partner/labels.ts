import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { errorMessageKey } from '@homecare/shared/auth';
import type { TranslationKey } from '@homecare/shared/i18n';
import type { PartnerRole, PayoutMethod, UstaadTrade, VehicleType } from '@homecare/shared/lib';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const ROLE_KEY: Record<PartnerRole, TranslationKey> = {
  rider: 'partner.role.rider',
  ustaad: 'partner.role.ustaad',
};
export const ROLE_ICON: Record<PartnerRole, IconName> = { rider: 'bicycle', ustaad: 'construct' };

export const TRADES: UstaadTrade[] = ['plumber', 'electrician', 'ac_technician', 'mechanic'];
export const TRADE_KEY: Record<UstaadTrade, TranslationKey> = {
  plumber: 'services.ustaad.trade.plumber',
  electrician: 'services.ustaad.trade.electrician',
  ac_technician: 'services.ustaad.trade.ac',
  mechanic: 'services.ustaad.trade.mechanic',
};

export const VEHICLES: VehicleType[] = ['motorcycle', 'bicycle', 'car', 'rickshaw'];
export const VEHICLE_KEY: Record<VehicleType, TranslationKey> = {
  motorcycle: 'partner.vehicle.motorcycle',
  bicycle: 'partner.vehicle.bicycle',
  car: 'partner.vehicle.car',
  rickshaw: 'partner.vehicle.rickshaw',
};

export const PAYOUTS: PayoutMethod[] = ['jazzcash', 'easypaisa'];
export const PAYOUT_LABEL: Record<PayoutMethod, string> = { jazzcash: 'JazzCash', easypaisa: 'Easypaisa' };

const MISSING_KEY: Record<string, TranslationKey> = {
  full_name: 'partner.missing.full_name',
  cnic_number: 'partner.missing.cnic_number',
  payout: 'partner.missing.payout',
  vehicle: 'partner.missing.vehicle',
  trades: 'partner.missing.trades',
  cnic_front: 'partner.docs.cnic_front',
  cnic_back: 'partner.docs.cnic_back',
  selfie: 'partner.docs.selfie',
};

/** Turns a failed submission into a readable message ("missing: CNIC – back, selfie"). */
export function submitErrorMessage(error: unknown, t: (key: TranslationKey, params?: Record<string, string>) => string) {
  const e = (error ?? {}) as { message?: string; details?: string };
  if (e.message?.includes('application_incomplete')) {
    const items = (e.details ?? '')
      .split(',')
      .filter(Boolean)
      .map((item) => (MISSING_KEY[item] ? t(MISSING_KEY[item]) : item))
      .join(', ');
    return t('partner.errors.incomplete', { items });
  }
  return t(errorMessageKey(error));
}
