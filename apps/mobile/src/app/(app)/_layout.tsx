import { Stack } from 'expo-router';

export const unstable_settings = { anchor: '(tabs)' };

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="edit-profile" />
    </Stack>
  );
}
