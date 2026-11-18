import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { addBeforeSignOut } from '../auth/auth-provider';
import { supabase } from '../lib';

export type PushApp = 'customer' | 'partner';
export type PushData = { kind?: string; order_id?: string };

let currentToken: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Asks for permission, gets this phone's FCM token and saves it for the signed-in user.
 * Returns 'unavailable' when the build has no Firebase file (google-services.json): the app
 * then works as before, with screens refreshing every 15 seconds.
 */
export async function registerForPush(app: PushApp): Promise<'ok' | 'denied' | 'unavailable'> {
  try {
    // Android 13+: the channel must exist before asking, or the prompt never shows.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('orders', {
        name: 'Orders',
        // Re-exported through `export *` from a types file, which the import plugin can't follow.
        // eslint-disable-next-line import/namespace
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'denied';
    const device = await Notifications.getDevicePushTokenAsync();
    const token = String(device.data);
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_app: app,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    if (error) return 'unavailable';
    currentToken = token;
    return 'ok';
  } catch {
    return 'unavailable';
  }
}

/** Stops notifications for this phone (called before signing out). */
export async function unregisterPush() {
  if (!currentToken) return;
  const token = currentToken;
  currentToken = null;
  await supabase.rpc('unregister_push_token', { p_token: token });
}

addBeforeSignOut(unregisterPush);

/**
 * Use once inside the signed-in part of an app: registers this phone for notifications and
 * opens the matching screen when one is tapped.
 */
export function usePushNotifications(app: PushApp, routeFor: (data: PushData) => Href | null) {
  const routeRef = useRef(routeFor);
  useEffect(() => {
    routeRef.current = routeFor;
  }, [routeFor]);

  useEffect(() => {
    void registerForPush(app);
  }, [app]);

  const last = Notifications.useLastNotificationResponse();
  useEffect(() => {
    if (!last || last.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const href = routeRef.current((last.notification.request.content.data ?? {}) as PushData);
    void Notifications.clearLastNotificationResponseAsync();
    if (href) router.push(href);
  }, [last]);
}
