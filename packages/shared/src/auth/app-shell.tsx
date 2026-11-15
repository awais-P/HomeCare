import '../lib/supabase';

import { DarkTheme, DefaultTheme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { I18nProvider, useI18n } from '../i18n';
import { spacing, useColors, useColorSchemeName } from '../theme';
import { Button, EmptyState, Screen } from '../ui';
import { AuthProvider, useAuth, type AuthGate } from './auth-provider';

void SplashScreen.preventAutoHideAsync();

/** Everything both apps wrap their root layout in: safe areas, keyboard, language, sign-in. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <I18nProvider>
          <AuthProvider>{children}</AuthProvider>
        </I18nProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

/** Hides the splash screen once we know whether the user is signed in. */
export function useHideSplashWhenReady(gate: AuthGate | 'loading') {
  useEffect(() => {
    if (gate !== 'loading') void SplashScreen.hideAsync();
  }, [gate]);
}

/** React Navigation theme built from our colours (light/dark). */
export function useNavigationTheme() {
  const colors = useColors();
  const scheme = useColorSchemeName();
  return useMemo(() => {
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
}

/** Shown when the user is signed in but their profile can't be loaded (e.g. offline). */
export function ProfileErrorScreen() {
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
