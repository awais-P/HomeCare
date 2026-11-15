import { Stack } from 'expo-router';

import { PartnerProvider } from '@/features/partner/partner-provider';

export const unstable_settings = { anchor: 'index' };

export default function PartnerAppLayout() {
  return (
    <PartnerProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="apply" />
        <Stack.Screen name="documents" />
        <Stack.Screen name="account" />
        <Stack.Screen name="edit-profile" />
      </Stack>
    </PartnerProvider>
  );
}
