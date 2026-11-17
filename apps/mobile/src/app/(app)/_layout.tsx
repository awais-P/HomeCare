import { Stack } from 'expo-router';

import { AddressesProvider } from '@/features/addresses/addresses-provider';

export const unstable_settings = { anchor: '(tabs)' };

export default function AppLayout() {
  return (
    <AddressesProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="delete-account" />
        <Stack.Screen name="order/new" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="order/[id]" />
        <Stack.Screen name="addresses" />
        <Stack.Screen name="address/pick" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="address/details" />
      </Stack>
    </AddressesProvider>
  );
}
