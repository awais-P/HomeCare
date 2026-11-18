import { Stack } from 'expo-router';

import { usePushNotifications } from '@homecare/shared/push';

import { AddressesProvider } from '@/features/addresses/addresses-provider';

export const unstable_settings = { anchor: '(tabs)' };

export default function AppLayout() {
  // Register this phone for order updates; a tapped notification opens that order.
  usePushNotifications('customer', (data) =>
    data.job_id
      ? { pathname: '/job/[id]', params: { id: data.job_id } }
      : data.order_id
        ? { pathname: '/order/[id]', params: { id: data.order_id } }
        : null,
  );
  return (
    <AddressesProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="delete-account" />
        <Stack.Screen name="order/new" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="order/[id]" />
        <Stack.Screen name="job/new" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="job/[id]" />
        <Stack.Screen name="addresses" />
        <Stack.Screen name="address/pick" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="address/details" />
      </Stack>
    </AddressesProvider>
  );
}
