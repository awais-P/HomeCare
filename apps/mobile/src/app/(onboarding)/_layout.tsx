import { Stack } from 'expo-router';

export const unstable_settings = { anchor: 'profile-setup' };

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
