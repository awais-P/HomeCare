import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Linking } from 'react-native';

import { supabase } from '@homecare/shared/lib';

/**
 * Location while the phone is locked (Android foreground service with a notification).
 * The task is defined when this file is imported, which src/app/_layout.tsx does first, so it
 * exists even when Android starts the app in the background.
 */
export const BACKGROUND_LOCATION_TASK = 'homecare-partner-location';

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) return;
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const last = locations?.[locations.length - 1];
  if (!last) return;
  const { error: rpcError } = await supabase.rpc('update_partner_location', {
    lat: last.coords.latitude,
    lng: last.coords.longitude,
  });
  // The server says we're offline (went offline elsewhere, suspended): stop sharing.
  if (rpcError?.message.includes('partner_offline')) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => undefined);
  }
});

export type BackgroundPermission = 'granted' | 'denied' | 'undetermined';

export async function backgroundPermission(): Promise<BackgroundPermission> {
  const permission = await Location.getBackgroundPermissionsAsync();
  return permission.granted ? 'granted' : permission.canAskAgain ? 'undetermined' : 'denied';
}

/** Asks for "Allow all the time" (foreground first, as Android requires). On Android 11+ this opens settings. */
export async function requestBackgroundPermission(): Promise<BackgroundPermission> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) return 'denied';
  const background = await Location.requestBackgroundPermissionsAsync();
  return background.granted ? 'granted' : background.canAskAgain ? 'undetermined' : 'denied';
}

export const openAppSettings = () => void Linking.openSettings();

export async function isBackgroundSharing(): Promise<boolean> {
  return Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
}

/** Starts sharing in the background (only with permission). Returns whether it is running. */
export async function startBackgroundSharing(): Promise<boolean> {
  if ((await backgroundPermission()) !== 'granted') return false;
  if (await isBackgroundSharing()) return true;
  try {
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15_000,
      distanceInterval: 25,
      deferredUpdatesInterval: 15_000,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'HomeCare Partner: you are online',
        notificationBody: 'Sharing your location so customers see you and jobs can reach you. Go offline to stop.',
        notificationColor: '#0B7A55',
        killServiceOnDestroy: false,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function stopBackgroundSharing() {
  if (await isBackgroundSharing()) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => undefined);
  }
}
