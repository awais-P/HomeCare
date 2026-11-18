import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import type { TranslationKey } from '../i18n';
import type { OrderStatus, SaudaCategory, SubstitutionStatus } from '../lib/database.types';

type IconName = ComponentProps<typeof Ionicons>['name'];

export const SAUDA_CATEGORIES: SaudaCategory[] = ['sabzi', 'grocery', 'meat', 'bakery', 'pharmacy', 'food', 'pick_drop', 'other'];

export const CATEGORY_KEY: Record<SaudaCategory, TranslationKey> = {
  sabzi: 'services.sauda.cat.sabzi',
  grocery: 'services.sauda.cat.grocery',
  meat: 'order.cat.meat',
  bakery: 'order.cat.bakery',
  pharmacy: 'services.sauda.cat.pharmacy',
  food: 'order.cat.food',
  pick_drop: 'services.sauda.cat.pickDrop',
  other: 'order.cat.other',
};

export const CATEGORY_ICON: Record<SaudaCategory, IconName> = {
  sabzi: 'leaf',
  grocery: 'basket',
  meat: 'restaurant',
  bakery: 'cafe',
  pharmacy: 'medkit',
  food: 'fast-food',
  pick_drop: 'cube',
  other: 'ellipsis-horizontal-circle',
};

export const STATUS_KEY: Record<OrderStatus, TranslationKey> = {
  requested: 'order.status.requested',
  accepted: 'order.status.accepted',
  at_shop: 'order.status.at_shop',
  on_the_way: 'order.status.on_the_way',
  delivered: 'order.status.delivered',
  cancelled: 'order.status.cancelled',
};

export const STATUS_ICON: Record<OrderStatus, IconName> = {
  requested: 'search',
  accepted: 'bicycle',
  at_shop: 'storefront',
  on_the_way: 'navigate',
  delivered: 'checkmark-circle',
  cancelled: 'close-circle',
};

/** The happy path, in order. */
export const ORDER_STEPS: OrderStatus[] = ['requested', 'accepted', 'at_shop', 'on_the_way', 'delivered'];

/** A rider is assigned and the order isn't finished. */
export const ACTIVE_STATUSES: OrderStatus[] = ['accepted', 'at_shop', 'on_the_way'];

export const isOpen = (status: OrderStatus) => status !== 'delivered' && status !== 'cancelled';

/** "1,200" — PKR amounts without decimals. */
export const formatRupees = (amount: number) => amount.toLocaleString('en-PK', { maximumFractionDigits: 0 });

export const SUBSTITUTION_STATUS_KEY: Record<SubstitutionStatus, TranslationKey> = {
  pending: 'subs.status.pending',
  approved: 'subs.status.approved',
  declined: 'subs.status.declined',
  no_reply: 'subs.status.no_reply',
};

export { useLiveChanges, useOrderLive } from './live';
