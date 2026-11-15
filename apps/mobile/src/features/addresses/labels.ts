import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { errorMessageKey } from '@homecare/shared/auth';
import type { TranslationKey } from '@homecare/shared/i18n';
import type { Address, AddressLabel } from '@homecare/shared/lib';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const ADDRESS_LABELS: AddressLabel[] = ['home', 'work', 'parents', 'other'];

export const LABEL_ICON: Record<AddressLabel, IconName> = {
  home: 'home',
  work: 'briefcase',
  parents: 'people',
  other: 'location',
};

export const LABEL_KEY: Record<AddressLabel, TranslationKey> = {
  home: 'address.label.home',
  work: 'address.label.work',
  parents: 'address.label.parents',
  other: 'address.label.other',
};

/** "Home", "Work", or the user's own name for an "other" address. */
export function addressTitle(address: Pick<Address, 'label' | 'custom_label'>, t: (key: TranslationKey) => string) {
  return address.label === 'other' && address.custom_label ? address.custom_label : t(LABEL_KEY[address.label]);
}

/** Short second line: "House 12, Street 5, G-10/2" or the map address. */
export function addressSummary(address: Pick<Address, 'house' | 'street' | 'area' | 'formatted_address'>) {
  const parts = [address.house, address.street, address.area].filter(Boolean);
  return parts.length ? parts.join(', ') : address.formatted_address;
}

/** Maps a save error to a message key; the database names its rule in the error message. */
export function addressErrorKey(error: unknown): TranslationKey {
  const message = typeof error === 'object' && error && 'message' in error ? String(error.message) : '';
  if (message.includes('outside_service_area')) return 'address.errors.outside';
  if (message.includes('address_limit')) return 'address.errors.limit';
  return errorMessageKey(error);
}
