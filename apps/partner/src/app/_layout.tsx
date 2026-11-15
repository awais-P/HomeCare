import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import {
  AppProviders,
  ProfileErrorScreen,
  useAuth,
  useHideSplashWhenReady,
  useNavigationTheme,
} from '@homecare/shared/auth';
import { useColors, useColorSchemeName } from '@homecare/shared/theme';

export default function RootLayout() {
  return (
    <AppProviders>
      <RootNavigator />
    </AppProviders>
  );
}

/**
 * Route groups are unlocked by the auth gate:
 *   signedOut    → (auth)        welcome, phone, verify
 *   needsProfile → (onboarding)  profile-setup
 *   ready        → (app)         application, documents, dashboard, account
 * When the gate changes (sign in, profile saved, sign out) Expo Router moves the user automatically.
 */
function RootNavigator() {
  const { gate } = useAuth();
  const colors = useColors();
  const scheme = useColorSchemeName();
  const navTheme = useNavigationTheme();
  useHideSplashWhenReady(gate);

  if (gate === 'loading') return null; // splash screen stays visible

  // Where a blocked route sends the user, so every state lands on a real screen.
  const home = gate === 'signedOut' ? '/welcome' : gate === 'needsProfile' ? '/profile-setup' : '/';

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {gate === 'profileError' ? (
        <ProfileErrorScreen />
      ) : (
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: colors.background },
          }}>
          <Stack.Protected guard={gate === 'signedOut'} redirectTo={home}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
          <Stack.Protected guard={gate === 'needsProfile'} redirectTo={home}>
            <Stack.Screen name="(onboarding)" />
          </Stack.Protected>
          <Stack.Protected guard={gate === 'ready'} redirectTo={home}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
        </Stack>
      )}
    </ThemeProvider>
  );
}
