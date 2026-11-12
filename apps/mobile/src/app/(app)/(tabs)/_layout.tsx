import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n/i18n-provider';
import { useColors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export default function TabsLayout() {
  const { t } = useI18n();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const tabIcon = (active: IconName, inactive: IconName) =>
    function TabIcon({ focused, size }: { focused: boolean; size: number }) {
      return (
        <Ionicons name={focused ? active : inactive} size={size} color={focused ? colors.primary : colors.textSubtle} />
      );
    };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64 + insets.bottom,
          paddingTop: 4,
          paddingBottom: insets.bottom + 4,
        },
        // Icon (28) + label (16) + padding must fit; the default 49px item clips the label.
        tabBarItemStyle: { height: 56 },
        tabBarLabelStyle: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
      }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home', 'home-outline') }} />
      <Tabs.Screen
        name="orders"
        options={{ title: t('tabs.orders'), tabBarIcon: tabIcon('receipt', 'receipt-outline') }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: t('tabs.account'), tabBarIcon: tabIcon('person-circle', 'person-circle-outline') }}
      />
    </Tabs>
  );
}
