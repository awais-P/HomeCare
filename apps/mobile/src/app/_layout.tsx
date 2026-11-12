import '@/lib/supabase';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button, EmptyState, Screen } from '@/components/ui';
import { AuthProvider, useAuth } from '@/features/auth/auth-provider';
import { I18nProvider, useI18n } from '@/i18n/i18n-provider';
import { spacing, useColors, useColorSchemeName } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <I18nProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </I18nProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

/**
 * Route groups are unlocked by the auth gate:
 *   signedOut    → (auth)        welcome, phone, verify
 *   needsProfile → (onboarding)  profile-setup
 *   ready        → (app)         tabs + edit-profile
 * When the gate changes (sign in, profile saved, sign out) Expo Router moves the user automatically.
 */
function RootNavigator() {
  const { gate } = useAuth();
  const colors = useColors();
  const scheme = useColorSchemeName();

  useEffect(() => {
    if (gate !== 'loading') void SplashScreen.hideAsync();
  }, [gate]);

  const navTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
      },
    };
  }, [scheme, colors]);

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

function ProfileErrorScreen() {
  const { t } = useI18n();
  const { retryProfile, signOut } = useAuth();
  return (
    <Screen scroll={false}>
      <EmptyState
        icon="cloud-offline-outline"
        title={t('errors.profileLoadTitle')}
        body={t('errors.profileLoadBody')}
        action={
          <View style={styles.actions}>
            <Button label={t('common.retry')} onPress={retryProfile} />
            <Button label={t('account.signOut')} variant="ghost" onPress={() => void signOut()} />
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
});
